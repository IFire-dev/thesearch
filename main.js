const { app, BrowserWindow } = require('electron');
const { startServer } = require('./server');

let mainWindow;

app.whenReady().then(async () => {
  // Start the Express server first, then point the window at it.
  // startServer() resolves with whichever port it actually bound to
  // (80 if allowed, 8080 as a fallback otherwise).
  const port = await startServer();

  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadURL(`http://localhost:${port}`);
});

app.on('window-all-closed', () => {
  // Standard Electron quit behavior (keep app alive on macOS dock).
  if (process.platform !== 'darwin') app.quit();
});
