/**
 * Electron 主进程入口
 * 创建窗口，初始化应用
 */
import { app, BrowserWindow, globalShortcut } from 'electron';
import path from 'path';
import fs from 'fs';
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
      webSecurity: !isDev, // 开发服务器需要预览知识库中的 file:// 媒体
      sandbox: true,
      webviewTag: true,
    },
    // 隐藏默认菜单（可选）
    autoHideMenuBar: true,
  });

  setMainWindow(mainWindow);

  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    if (!/^https?:\/\//i.test(params.src)) { event.preventDefault(); return; }
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
  });
  mainWindow.webContents.on('did-attach-webview', (_event, guest) => {
    guest.setWindowOpenHandler(() => ({ action: 'deny' }));
    guest.on('will-navigate', (event, url) => {
      if (!/^https?:\/\//i.test(url)) event.preventDefault();
    });
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const appUrl = mainWindow?.webContents.getURL();
    if (!appUrl) { event.preventDefault(); return; }
    const current = new URL(appUrl);
    const target = new URL(url);
    if (target.origin !== current.origin || (current.protocol === 'file:' && target.pathname !== current.pathname)) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

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
  registerIpcHandlers();
  createWindow();

  // 开机自启动（仅打包后生效，首次启动默认开启）
  if (!isDev && process.platform !== 'linux') {
    const flagFile = path.join(app.getPath('userData'), '.auto-start-configured');
    if (!fs.existsSync(flagFile)) {
      try {
        app.setLoginItemSettings({ openAtLogin: true });
        fs.writeFileSync(flagFile, '');
      } catch (error) { console.error('Failed to configure auto start:', error); }
    }
  }

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
