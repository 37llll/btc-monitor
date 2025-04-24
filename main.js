const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  
  mainWindow = new BrowserWindow({
    width: 180,
    height: 100, // 增加高度以容纳标题
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    transparent: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false // 允许跨域请求
    },
    x: width - 200,
    y: 50
  });

  mainWindow.loadFile('index.html');
  
  // 允许窗口拖动
  mainWindow.setMovable(true);
  
  // 在开发模式下打开DevTools
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// 处理IPC通信
ipcMain.on('close-window', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

// 处理快速更新模式结束通知
ipcMain.on('fast-update-ended', () => {
  console.log('快速更新模式已结束');
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
}); 