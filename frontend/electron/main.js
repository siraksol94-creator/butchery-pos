const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const http = require('http');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { exec } = require('child_process');

const logFile = path.join(os.tmpdir(), 'butchery-startup.log');
function log(msg) {
  try { fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`); } catch (e) {}
}

log('main.js loaded');

// Kill any process using port 5000 (prevents EADDRINUSE on restart)
function killPort(port) {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32'
      ? `for /f "tokens=5" %a in ('netstat -ano ^| findstr :${port}') do taskkill /PID %a /F`
      : `lsof -ti:${port} | xargs kill -9`;
    exec(cmd, () => setTimeout(resolve, 500));
  });
}

let mainWindow;
let splashWindow;
let _autoUpdater = null;

// Update the status text shown on splash screen
function setSplashStatus(msg) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents
      .executeJavaScript(`(function(){ var el = document.getElementById('status'); if(el) el.textContent = ${JSON.stringify(msg)}; })()`)
      .catch(() => {});
  }
}

// IPC: renderer can request a manual update check
ipcMain.handle('check-for-updates', () => {
  if (_autoUpdater) {
    _autoUpdater.checkForUpdates().catch(() => {});
    return { checking: true };
  }
  return { error: 'Auto-updater not available' };
});

// IPC: silent print (Promise-based API required for Electron 28+)
ipcMain.handle('print-silent', (_event, html) => {
  return new Promise((resolve) => {
    // Write HTML to a temp file — more reliable than data: URLs for large content
    const tmpFile = path.join(os.tmpdir(), 'butchery-print-' + Date.now() + '.html');
    try { fs.writeFileSync(tmpFile, html, 'utf8'); } catch (e) {
      log('print-silent: failed to write temp file: ' + e.message);
      return resolve({ success: false, reason: e.message });
    }

    const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false } });
    win.loadFile(tmpFile);
    win.webContents.once('did-finish-load', () => {
      const result = win.webContents.print({ silent: true, printBackground: true });
      const cleanup = () => { try { fs.unlinkSync(tmpFile); } catch (_) {} };
      if (result && typeof result.then === 'function') {
        // Electron 28+: print() returns a Promise
        result
          .then(() => { win.close(); cleanup(); resolve({ success: true }); })
          .catch((err) => { win.close(); cleanup(); resolve({ success: false, reason: err.message }); });
      } else {
        // Older Electron: print() returns undefined, fire-and-forget
        setTimeout(() => { win.close(); cleanup(); resolve({ success: true }); }, 1500);
      }
    });
    win.webContents.once('did-fail-load', (_e, code, desc) => {
      log('print-silent: did-fail-load: ' + code + ' ' + desc);
      win.close();
      try { fs.unlinkSync(tmpFile); } catch (_) {}
      resolve({ success: false, reason: desc });
    });
  });
});

function startBackend() {
  log('startBackend called, isPackaged=' + app.isPackaged);
  process.env.ELECTRON_USER_DATA      = app.getPath('userData');
  process.env.ELECTRON_PACKAGED       = app.isPackaged ? '1' : '0';
  process.env.PORT                    = '5000';
  process.env.ELECTRON_FRONTEND_BUILD = app.isPackaged
    ? path.join(process.resourcesPath, 'frontend', 'build')
    : path.join(__dirname, '../../frontend/build');

  const backendPath = app.isPackaged
    ? path.join(process.resourcesPath, 'backend', 'server.js')
    : path.join(__dirname, '../../backend/server.js');

  log('backendPath: ' + backendPath);
  try {
    require(backendPath);
    log('backend loaded OK');
  } catch (e) {
    log('BACKEND ERROR: ' + e.message + '\n' + e.stack);
  }
}

// Promise that resolves when backend is healthy, or after timeout
function waitForBackend(retries = 30) {
  return new Promise((resolve) => {
    function check(remaining) {
      http.get('http://localhost:5000/api/health', (res) => {
        res.resume();
        if (res.statusCode === 200) { log('backend ready'); resolve(); }
        else retry(remaining);
      }).on('error', () => retry(remaining));
    }
    function retry(remaining) {
      if (remaining <= 0) { log('backend timeout — continuing anyway'); resolve(); return; }
      setTimeout(() => check(remaining - 1), 500);
    }
    check(retries);
  });
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 380,
    frame: false,
    transparent: false,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    webPreferences: { nodeIntegration: false },
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.on('closed', () => { splashWindow = null; });
}

function createWindow() {
  if (mainWindow) return;
  log('createWindow');
  const preloadPath = path.join(__dirname, 'preload.js');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    center: true,
    show: false,
    title: 'Butchery Pro - Management System',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
    },
  });

  mainWindow.loadURL('http://localhost:5000');
  mainWindow.webContents.on('did-finish-load', () => {
    log('page loaded OK');
    mainWindow.show();
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  });
  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    log('page FAILED: ' + code + ' ' + desc);
    mainWindow.show();
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  });
  mainWindow.on('closed', () => { log('window closed'); mainWindow = null; });
}

// Check for updates — resolves with: 'no-update' | 'error' | 'timeout' | { type: 'update-available', info }
function checkForUpdate() {
  return new Promise((resolve) => {
    try {
      const { autoUpdater } = require('electron-updater');
      _autoUpdater = autoUpdater;
      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = false;
      autoUpdater.logger = null;

      const timer = setTimeout(() => { log('update check timed out'); resolve('timeout'); }, 10000);

      autoUpdater.once('update-not-available', () => {
        log('No update available');
        clearTimeout(timer);
        resolve('no-update');
      });

      autoUpdater.once('update-available', (info) => {
        log('Update available: ' + info.version);
        clearTimeout(timer);
        resolve({ type: 'update-available', info });
      });

      autoUpdater.once('error', (err) => {
        log('AutoUpdater error: ' + err.message);
        clearTimeout(timer);
        resolve('error');
      });

      autoUpdater.checkForUpdates().catch((err) => {
        log('checkForUpdates threw: ' + err.message);
        clearTimeout(timer);
        resolve('error');
      });

    } catch (e) {
      log('AutoUpdater load error: ' + e.message);
      resolve('error');
    }
  });
}

app.whenReady().then(async () => {
  log('app ready');
  createSplashWindow();

  // Attach listener immediately — before killPort/startBackend so we never miss the event
  const splashLoaded = new Promise(resolve => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      if (splashWindow.webContents.isLoading()) {
        splashWindow.webContents.once('did-finish-load', resolve);
      } else {
        resolve(); // already loaded
      }
    } else {
      resolve();
    }
  });

  await killPort(5000);
  startBackend();

  // Minimum 8 seconds so company info on splash is readable
  const minDelay    = new Promise(resolve => setTimeout(resolve, 8000));
  const backendReady = waitForBackend(30);

  await splashLoaded;

  setSplashStatus('Starting backend...');

  let updateResult = 'no-update';

  if (app.isPackaged) {
    setSplashStatus('Checking for updates...');
    // Run all three in parallel — proceed only when all are done
    [, , updateResult] = await Promise.all([minDelay, backendReady, checkForUpdate()]);
  } else {
    setSplashStatus('Development mode');
    await Promise.all([minDelay, backendReady]);
  }

  // If update is available — show dialog BEFORE opening main window
  if (updateResult && updateResult.type === 'update-available') {
    setSplashStatus('Update available!');

    // Lower splash so dialogs appear on top of it
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.setAlwaysOnTop(false);

    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'Update Available',
      message: `Version ${updateResult.info.version} of Butchery Pro is available.\nDo you want to download and install it now?`,
      buttons: ['Install Now', 'Skip for Now'],
      defaultId: 0,
      cancelId: 1,
    });

    if (response === 0) {
      setSplashStatus('Downloading update...');

      _autoUpdater.on('download-progress', (progress) => {
        setSplashStatus(`Downloading... ${Math.round(progress.percent)}%`);
      });

      _autoUpdater.once('update-downloaded', async (info) => {
        setSplashStatus('Restarting to apply update...');
        if (splashWindow && !splashWindow.isDestroyed()) splashWindow.setAlwaysOnTop(false);
        await dialog.showMessageBox({
          type: 'info',
          title: 'Update Ready',
          message: `Version ${info.version} is ready.\nThe app will now restart to apply the update.`,
          buttons: ['Restart Now'],
          defaultId: 0,
        });
        _autoUpdater.quitAndInstall();
      });

      _autoUpdater.downloadUpdate();
      return; // App will restart — don't open main window
    }
    // User chose Skip — fall through to open main window normally
  }

  setSplashStatus('Ready!');
  createWindow();
});

app.on('window-all-closed', () => {
  log('window-all-closed');
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
