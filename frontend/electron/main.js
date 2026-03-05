const { app, BrowserWindow } = require('electron');
const http = require('http');
const path = require('path');

let mainWindow;

function startBackend() {
  process.env.ELECTRON_USER_DATA = app.getPath('userData');
  process.env.ELECTRON_PACKAGED = app.isPackaged ? '1' : '0';
  process.env.PORT = '5000';

  const backendPath = app.isPackaged
    ? path.join(process.resourcesPath, 'backend', 'server.js')
    : path.join(__dirname, '../../backend/server.js');

  require(backendPath);
}

// Poll /api/health every 500ms until the backend is ready, then open the window
function waitForBackend(retries = 30) {
  http.get('http://localhost:5000/api/health', (res) => {
    res.resume(); // consume response body to free the socket
    if (res.statusCode === 200) {
      createWindow();
    } else {
      retry(retries);
    }
  }).on('error', () => retry(retries));
}

function retry(retries) {
  if (retries <= 0) {
    createWindow();
    return;
  }
  setTimeout(() => waitForBackend(retries - 1), 500);
}

function createWindow() {
  if (mainWindow) return; // already created
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
    },
  });

  mainWindow.loadURL('http://localhost:5000');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  startBackend();
  waitForBackend(30);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
