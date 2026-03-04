const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow;

function startBackend() {
  // Tell backend where to store the DB and uploads
  process.env.ELECTRON_USER_DATA = app.getPath('userData');
  process.env.ELECTRON_PACKAGED = app.isPackaged ? '1' : '0';
  process.env.PORT = '5000';

  const backendPath = app.isPackaged
    ? path.join(process.resourcesPath, 'backend', 'server.js')
    : path.join(__dirname, '../../backend/server.js');

  require(backendPath);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
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
  // Give Express ~1.5s to start before opening the window
  setTimeout(createWindow, 1500);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
