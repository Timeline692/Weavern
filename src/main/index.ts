/**
 * Electron 主进程入口
 * 创建窗口，初始化应用
 */
import { app, BrowserWindow, globalShortcut } from 'electron';
import path from 'path';
import { registerIpcHandlers, setMainWindow } from './ipc-handlers';

let mainWindow: BrowserWindow | null = null;

const isDev = !app.isPackaged;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: '织识 - Weavern',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: !isDev, // 开发模式允许加载本地文件
    },
    // 隐藏默认菜单（可选）
    autoHideMenuBar: true,
  });

  setMainWindow(mainWindow);
  registerIpcHandlers();

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // 开发模式下打开 DevTools
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 应用就绪
app.whenReady().then(() => {
  createWindow();

  // 注册全局快捷键：Ctrl+Shift+I 切换 DevTools（仅开发模式）
  if (isDev) {
    globalShortcut.register('CommandOrControl+Shift+I', () => {
      if (mainWindow) {
        mainWindow.webContents.toggleDevTools();
      }
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 所有窗口关闭时退出（macOS 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 应用退出前清理
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
