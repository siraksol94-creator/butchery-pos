const router = require('express').Router();
const db = require('../config/database');
const { auth, readOnlyGuard } = require('../middleware/auth');
const syncConfig = require('../config/syncConfig');
const { randomUUID } = require('crypto');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

router.get('/', auth, readOnlyGuard, (req, res) => {
  try {
    const user = db.prepare(
      'SELECT id, first_name, last_name, email, phone, address, role FROM users WHERE id = ? AND tenant_id = ?'
    ).get(req.user.id, req.user.tenantId);
    const business = db.prepare('SELECT * FROM business_settings WHERE tenant_id = ? LIMIT 1').get(req.user.tenantId) || {};
    res.json({ user, business });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/profile', auth, (req, res) => {
  try {
    const { firstName, lastName, email, phone, address } = req.body;
    db.prepare(
      "UPDATE users SET first_name=?, last_name=?, email=?, phone=?, address=?, updated_at=datetime('now'), synced=0 WHERE id=?"
    ).run(firstName, lastName, email, phone, address, req.user.id);
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/business', auth, (req, res) => {
  try {
    const { business_name, business_phone, business_email, business_address, tax_rate } = req.body;
    const existing = db.prepare('SELECT * FROM business_settings LIMIT 1').get();
    let row;
    if (existing) {
      db.prepare(
        `UPDATE business_settings SET business_name=?, business_phone=?, business_email=?,
         business_address=?, tax_rate=?, updated_at=datetime('now'), synced=0 WHERE id=?`
      ).run(business_name, business_phone, business_email, business_address, tax_rate, existing.id);
      row = db.prepare('SELECT * FROM business_settings WHERE id = ?').get(existing.id);
    } else {
      const { tenantId, branchId, deviceId } = syncConfig.getConfig();
      const info = db.prepare(
        'INSERT INTO business_settings (business_name, business_phone, business_email, business_address, tax_rate, sync_id, tenant_id, branch_id, device_id, synced) VALUES (?,?,?,?,?,?,?,?,?,0)'
      ).run(business_name, business_phone, business_email, business_address, tax_rate,
            randomUUID(), tenantId, branchId, deviceId);
      row = db.prepare('SELECT * FROM business_settings WHERE id = ?').get(info.lastInsertRowid);
    }
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/settings/drawer-port — get configured cash drawer port
router.get('/drawer-port', (req, res) => {
  try {
    const row = db.prepare("SELECT value FROM sync_config WHERE key = 'drawer_port'").get();
    res.json({ port: row?.value || 'POS-80' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/settings/drawer-port — save cash drawer port
router.put('/drawer-port', auth, (req, res) => {
  try {
    const { port } = req.body;
    if (!port || !port.trim()) return res.status(400).json({ error: 'Port is required.' });
    const existing = db.prepare("SELECT value FROM sync_config WHERE key = 'drawer_port'").get();
    if (existing) {
      db.prepare("UPDATE sync_config SET value = ? WHERE key = 'drawer_port'").run(port.trim());
    } else {
      db.prepare("INSERT INTO sync_config (key, value) VALUES ('drawer_port', ?)").run(port.trim());
    }
    res.json({ port: port.trim() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/settings/open-drawer — send ESC/POS drawer kick via Windows Print Spooler
router.post('/open-drawer', (req, res) => {
  try {
    const row = db.prepare("SELECT value FROM sync_config WHERE key = 'drawer_port'").get();
    const printerName = row?.value || 'POS-80';

    const psScript = `
$source = @"
using System;
using System.Runtime.InteropServices;
public class RawPrint {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }
    [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
    [DllImport("winspool.Drv", EntryPoint="ClosePrinter")]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
    [DllImport("winspool.Drv", EntryPoint="EndDocPrinter")]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint="StartPagePrinter")]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint="EndPagePrinter")]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);
    public static bool Send(string printer, byte[] bytes) {
        IntPtr hPrinter; IntPtr pBuf = IntPtr.Zero;
        DOCINFOA di = new DOCINFOA(); di.pDocName = "drawer"; di.pDataType = "RAW";
        if (!OpenPrinter(printer, out hPrinter, IntPtr.Zero)) return false;
        if (!StartDocPrinter(hPrinter, 1, di)) { ClosePrinter(hPrinter); return false; }
        StartPagePrinter(hPrinter);
        pBuf = System.Runtime.InteropServices.Marshal.AllocCoTaskMem(bytes.Length);
        System.Runtime.InteropServices.Marshal.Copy(bytes, 0, pBuf, bytes.Length);
        int written;
        WritePrinter(hPrinter, pBuf, bytes.Length, out written);
        System.Runtime.InteropServices.Marshal.FreeCoTaskMem(pBuf);
        EndPagePrinter(hPrinter); EndDocPrinter(hPrinter); ClosePrinter(hPrinter);
        return true;
    }
}
"@
Add-Type -TypeDefinition $source -Language CSharp
[RawPrint]::Send("${printerName}", [byte[]](0x1B, 0x70, 0x00, 0x19, 0xFA))
`;

    const tmpPs = path.join(os.tmpdir(), 'butchery_drawer.ps1');
    fs.writeFileSync(tmpPs, psScript, 'utf8');
    exec(`powershell -ExecutionPolicy Bypass -File "${tmpPs}"`, (err, stdout, stderr) => {
      if (err) return res.status(500).json({ error: 'Failed to open drawer: ' + (stderr || err.message) });
      res.json({ success: true });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/settings/print-receipt — send ESC/POS receipt via Windows Print Spooler
router.post('/print-receipt', (req, res) => {
  try {
    const row = db.prepare("SELECT value FROM sync_config WHERE key = 'drawer_port'").get();
    const printerName = row?.value || 'POS-80';
    const { businessName, businessPhone, orderNumber, date, time, customerName, servedBy, items, subtotal, discount, total, amountReceived, change } = req.body;

    const W = 42;
    const eq = '='.repeat(W);
    const da = '-'.repeat(W);
    const center = (str) => {
      const s = String(str).substring(0, W);
      const pad = Math.floor((W - s.length) / 2);
      return ' '.repeat(pad) + s;
    };
    const cols = (left, right) => {
      const l = String(left).substring(0, W - String(right).length - 1);
      return l + ' '.repeat(W - l.length - String(right).length) + String(right);
    };

    const lines = [];
    lines.push(center(businessName || 'BUTCHERY PRO'));
    if (businessPhone) lines.push(center('Tel: ' + businessPhone));
    lines.push(eq);
    lines.push(center('SALES RECEIPT'));
    lines.push(eq);
    lines.push(cols('Receipt #:', orderNumber || ''));
    lines.push(cols('Date:', date || ''));
    lines.push(cols('Time:', time || ''));
    lines.push(cols('Customer:', customerName || 'Walk-in'));
    lines.push(cols('Served by:', servedBy || 'Staff'));
    lines.push(eq);

    (items || []).forEach(item => {
      lines.push(String(item.product_name).substring(0, W));
      const qty = `  ${parseFloat(item.quantity).toFixed(2)} ${item.unit || ''}`;
      const price = `K${parseFloat(item.unit_price).toFixed(2)}`;
      const tot = `K${parseFloat(item.total_price).toFixed(2)}`;
      const right = `${price}  ${tot}`;
      lines.push(qty + ' '.repeat(Math.max(1, W - qty.length - right.length)) + right);
    });

    lines.push(da);
    lines.push(cols('Subtotal:', `K${parseFloat(subtotal || 0).toFixed(2)}`));
    if (parseFloat(discount || 0) > 0) lines.push(cols('Discount:', `-K${parseFloat(discount).toFixed(2)}`));
    lines.push(eq);
    lines.push(cols('TOTAL:', `K${parseFloat(total || 0).toFixed(2)}`));
    lines.push(eq);
    lines.push(cols('Amt Received:', `K${parseFloat(amountReceived || 0).toFixed(2)}`));
    const change_ = parseFloat(change || 0);
    const due = parseFloat(total || 0) - parseFloat(amountReceived || 0);
    if (parseFloat(amountReceived || 0) >= parseFloat(total || 0)) {
      lines.push(cols('*** CHANGE ***:', `K${change_.toFixed(2)}`));
    } else {
      lines.push(cols('*** BALANCE DUE ***:', `K${due.toFixed(2)}`));
    }
    lines.push(eq);
    lines.push(center('Thank you for your purchase!'));
    lines.push(center('Please come again.'));

    const text = lines.join('\n') + '\n\n\n\n\n\n';

    // Write ESC/POS content to temp binary file
    const ESC = Buffer.from([0x1B, 0x40]); // init
    const CUT = Buffer.from([0x1D, 0x56, 0x00]); // full cut
    const DRAWER = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]); // drawer kick
    const content = Buffer.from(text, 'utf8');
    const allBytes = Buffer.concat([ESC, content, CUT, DRAWER]);

    const tmpBin = path.join(os.tmpdir(), 'butchery_receipt.bin');
    fs.writeFileSync(tmpBin, allBytes);

    const psScript = `
$source = @"
using System;
using System.Runtime.InteropServices;
public class RawPrint2 {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }
    [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
    [DllImport("winspool.Drv", EntryPoint="ClosePrinter")]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
    [DllImport("winspool.Drv", EntryPoint="EndDocPrinter")]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint="StartPagePrinter")]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint="EndPagePrinter")]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);
    public static bool Send(string printer, byte[] bytes) {
        IntPtr hPrinter; IntPtr pBuf = IntPtr.Zero;
        DOCINFOA di = new DOCINFOA(); di.pDocName = "receipt"; di.pDataType = "RAW";
        if (!OpenPrinter(printer, out hPrinter, IntPtr.Zero)) return false;
        if (!StartDocPrinter(hPrinter, 1, di)) { ClosePrinter(hPrinter); return false; }
        StartPagePrinter(hPrinter);
        pBuf = System.Runtime.InteropServices.Marshal.AllocCoTaskMem(bytes.Length);
        System.Runtime.InteropServices.Marshal.Copy(bytes, 0, pBuf, bytes.Length);
        int written;
        WritePrinter(hPrinter, pBuf, bytes.Length, out written);
        System.Runtime.InteropServices.Marshal.FreeCoTaskMem(pBuf);
        EndPagePrinter(hPrinter); EndDocPrinter(hPrinter); ClosePrinter(hPrinter);
        return true;
    }
}
"@
Add-Type -TypeDefinition $source -Language CSharp
$bytes = [System.IO.File]::ReadAllBytes("${tmpBin.replace(/\\/g, '\\\\')}")
[RawPrint2]::Send("${printerName}", $bytes)
`;

    const tmpPs = path.join(os.tmpdir(), 'butchery_receipt.ps1');
    fs.writeFileSync(tmpPs, psScript, 'utf8');
    exec(`powershell -ExecutionPolicy Bypass -File "${tmpPs}"`, (err, stdout, stderr) => {
      if (err) return res.status(500).json({ error: 'Failed to print: ' + (stderr || err.message) });
      res.json({ success: true });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
