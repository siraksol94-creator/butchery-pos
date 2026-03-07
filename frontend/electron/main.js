const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const http = require('http');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

// Use temp dir — always writable, no app.getPath needed before ready
const logFile = path.join(os.tmpdir(), 'butchery-startup.log');
function log(msg) {
  try { fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`); } catch (e) {}
}

log('main.js loaded');

let mainWindow;
let _autoUpdater = null;

// IPC: renderer can request a manual update check
ipcMain.handle('check-for-updates', () => {
  if (_autoUpdater) {
    _autoUpdater.checkForUpdates().catch(() => {});
    return { checking: true };
  }
  return { error: 'Auto-updater not available' };
});

function startBackend() {
  log('startBackend called, isPackaged=' + app.isPackaged);

  process.env.ELECTRON_USER_DATA     = app.getPath('userData');
  process.env.ELECTRON_PACKAGED      = app.isPackaged ? '1' : '0';
  process.env.PORT                   = '5000';
  process.env.ELECTRON_FRONTEND_BUILD = app.isPackaged
    ? path.join(process.resourcesPath, 'frontend', 'build')
    : path.join(__dirname, '../../frontend/build');

  log('userData: '      + process.env.ELECTRON_USER_DATA);
  log('frontendBuild: ' + process.env.ELECTRON_FRONTEND_BUILD);

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

function waitForBackend(retries = 30) {
  http.get('http://localhost:5000/api/health', (res) => {
    res.resume();
    if (res.statusCode === 200) {
      log('backend ready — creating window');
      createWindow();
    } else {
      retry(retries);
    }
  }).on('error', () => retry(retries));
}

function retry(retries) {
  if (retries <= 0) {
    log('backend timeout — opening window anyway');
    createWindow();
    return;
  }
  setTimeout(() => waitForBackend(retries - 1), 500);
}

function createWindow() {
  if (mainWindow) return;
  log('createWindow');
  // __dirname is always the electron/ folder, packaged or not
  const preloadPath = path.join(__dirname, 'preload.js');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    center: true,
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
  });
  mainWindow.webContents.on('did-fail-load', (e, code, desc) => log('page FAILED: ' + code + ' ' + desc));
  mainWindow.on('closed', () => { log('window closed'); mainWindow = null; });
}

app.whenReady().then(() => {
  log('app ready');
  startBackend();
  waitForBackend(30);

  // ─── Auto-update (only in packaged builds) ─────────────────────────────
  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = require('electron-updater');
    _autoUpdater = autoUpdater;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on('update-not-available', () => {
      log('No update available');
      if (mainWindow) mainWindow.webContents.send('update-not-available');
    });

    autoUpdater.on('update-available', (info) => {
      log('Update available: ' + info.version);
      dialog.showMessageBox({
        type: 'info',
        title: 'Update Available',
        message: `A new version (${info.version}) of Butchery Pro is available.\nDo you want to download and install it now?`,
        buttons: ['Install Now', 'Skip'],
        defaultId: 0,
        cancelId: 1,
      }).then(({ response }) => {
        if (response === 0) {
          dialog.showMessageBox({
            type: 'info',
            title: 'Downloading Update',
            message: 'Downloading update in the background...\nThe app will restart automatically when ready.',
            buttons: ['OK'],
          });
          autoUpdater.downloadUpdate();
        } else {
          log('Update skipped by user');
        }
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      log('Update downloaded: ' + info.version);
      dialog.showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message: `Version ${info.version} is ready.\nThe app will now restart to apply the update.`,
        buttons: ['Restart Now'],
        defaultId: 0,
      }).then(() => {
        autoUpdater.quitAndInstall();
      });
    });

    autoUpdater.on('error', (err) => {
      log('AutoUpdater error: ' + err.message);
    });

    autoUpdater.checkForUpdates();
  } catch (e) {
    log('AutoUpdater load error: ' + e.message);
  }
});

app.on('window-all-closed', () => {
  log('window-all-closed');
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
