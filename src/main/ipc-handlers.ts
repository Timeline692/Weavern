/**
 * IPC 通信处理
 * 注册所有主进程 <-> 渲染进程的通信通道
 */
import { ipcMain, dialog, BrowserWindow, shell, app } from 'electron';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import {
  initDatabase, setKnowledgeBaseRoot, ensureMediaDir,
  getCategories, createCategory, renameCategory, deleteCategory, moveCategory,
  getItems, getItem, createItem, updateItem, deleteItem,
  getTags, createTag, deleteTag, addTagToItem, removeTagFromItem, getTagsForItem,
  searchItems, searchByTag,
  getAnnotations, createAnnotation, deleteAnnotation,
  getMediaPath, getKnowledgeBaseRoot,
  toggleStar, getStarredItems, batchDeleteItems, batchCategorize, batchTag,
  reorderItems,
} from './database';
import { importFiles, importFromClipboardText, importFromClipboardImage, getFileType, isTextType, localizeHtmlImages, detectUrlTitle, importUrl } from './file-manager';
import type { KnowledgeBaseConfig, FileContent } from '../shared/types';

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow): void {
  mainWindow = win;
}

/** 注册所有 IPC 处理器 */
export function registerIpcHandlers(): void {
  // 持久化 KB 路径到 userData
  const kbLocationFile = path.join(app.getPath('userData'), 'kb-location.json');

  function saveKbLocation(kbPath: string): void {
    fs.writeFileSync(kbLocationFile, JSON.stringify({ path: kbPath }));
  }

  function loadKbLocation(): string | null {
    try {
      if (fs.existsSync(kbLocationFile)) {
        const data = JSON.parse(fs.readFileSync(kbLocationFile, 'utf-8'));
        if (data.path && fs.existsSync(data.path)) return data.path;
      }
    } catch { /* 文件损坏则忽略 */ }
    return null;
  }

  // ========== 知识库 ==========
  ipcMain.handle('kb:init', async (_event, folderPath: string) => {
    if (typeof folderPath !== 'string' || !fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
      throw new Error('知识库文件夹不存在');
    }
    const name = path.basename(folderPath);
    await initDatabase(folderPath);
    setKnowledgeBaseRoot(folderPath);
    const configPath = path.join(folderPath, '.kbconfig');
    let previous: Partial<KnowledgeBaseConfig> = {};
    try { previous = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { /* 首次创建 */ }
    const config: KnowledgeBaseConfig = {
      rootPath: folderPath,
      name,
      created_at: previous.created_at || new Date().toISOString(),
    };
    // 保存配置到 KB 文件夹和 userData
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    saveKbLocation(folderPath);
    return config;
  });

  ipcMain.handle('kb:get-config', async () => {
    // 先从 userData 恢复上次的 KB 路径
    const savedPath = loadKbLocation();
    if (savedPath) {
      await initDatabase(savedPath);
      setKnowledgeBaseRoot(savedPath);
    }
    const root = getKnowledgeBaseRoot();
    if (!root) return null;
    const configPath = path.join(root, '.kbconfig');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as KnowledgeBaseConfig;
    }
    return null;
  });

  // ========== 分类 ==========
  ipcMain.handle('category:list', async () => getCategories());
  ipcMain.handle('category:create', async (_e, name: string, parentId: string | null) =>
    createCategory(name, parentId));
  ipcMain.handle('category:rename', async (_e, id: string, name: string) =>
    renameCategory(id, name));
  ipcMain.handle('category:delete', async (_e, id: string) => deleteCategory(id));
  ipcMain.handle('category:move', async (_e, id: string, newParentId: string | null, newOrder: number) =>
    moveCategory(id, newParentId, newOrder));

  // ========== 条目 ==========
  ipcMain.handle('item:list', async (_e, categoryId?: string) => getItems(categoryId));
  ipcMain.handle('item:get', async (_e, id: string) => getItem(id));
  ipcMain.handle('item:create', async (_e, data) => createItem(data));
  ipcMain.handle('item:update', async (_e, id, data) => updateItem(id, data));
  ipcMain.handle('item:delete', async (_e, id: string) => deleteItem(id));

  ipcMain.handle('item:get-content', async (_e, id: string) => {
    const item = getItem(id);
    if (!item) return null;
    const absPath = getMediaPath(item.file_path);
    const content: FileContent = {
      type: 'binary',
      absolutePath: absPath,
    };

    if (['txt', 'md'].includes(item.file_type)) {
      content.type = 'text';
      content.textContent = fs.readFileSync(absPath, 'utf-8');
    } else if (item.file_type === 'html') {
      content.type = 'html';
      content.htmlContent = fs.readFileSync(absPath, 'utf-8');
    } else if (item.file_type === 'docx') {
      // mammoth 把 docx 转成 HTML
      try {
        const mammoth = require('mammoth');
        const result = await mammoth.convertToHtml({ path: absPath });
        content.type = 'html';
        content.htmlContent = result.value;
      } catch (err) {
        console.error('Docx conversion failed:', err);
        content.type = 'text';
        content.textContent = '(docx 解析失败，请用系统默认应用打开)';
      }
    } else if (['jpg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(item.file_type)) {
      content.type = 'image';
    } else if (['mp4', 'mov', 'mkv', 'webm'].includes(item.file_type)) {
      content.type = 'video';
      content.mimeType = item.file_type === 'mov' ? 'video/quicktime' :
                         item.file_type === 'mkv' ? 'video/x-matroska' :
                         item.file_type === 'webm' ? 'video/webm' :
                         'video/mp4';
    } else if (item.file_type === 'pdf') {
      content.type = 'pdf';
    }

    return content;
  });

  // ========== 文件导入 ==========
  ipcMain.handle('import:files', async (_e, filePaths: string[]) => {
    const items = await importFiles(filePaths);
    const results = items.map(data => ({
      success: true,
      item: createItem(data),
    }));
    if (mainWindow) mainWindow.webContents.send('import:complete', results);
    return results;
  });

  ipcMain.handle('import:clipboard', async (_e, data: { type: string; text?: string; imageBase64?: string }) => {
    let itemData;
    if (data.type === 'text' && data.text) {
      itemData = importFromClipboardText(data.text);
    } else if (data.type === 'image' && data.imageBase64) {
      itemData = importFromClipboardImage(data.imageBase64);
    } else {
      return { success: false, error: 'No data' };
    }
    const item = createItem(itemData);
    if (mainWindow) mainWindow.webContents.send('import:complete', [{ success: true, item }]);
    return { success: true, item };
  });

  // ========== URL 导入 ==========
  ipcMain.handle('import:url-detect', async (_e, url: string) => {
    try {
      return await detectUrlTitle(url);
    } catch (err: any) {
      return { title: url, url, error: err.message };
    }
  });

  ipcMain.handle('import:url', async (_e, url: string, title?: string) => {
    try {
      const data = await importUrl(url, title);
      const item = createItem(data);
      if (mainWindow) mainWindow.webContents.send('import:complete', [{ success: true, item }]);
      return { success: true, item };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ========== 标签 ==========
  ipcMain.handle('tag:list', async () => getTags());
  ipcMain.handle('tag:create', async (_e, name: string) => createTag(name));
  ipcMain.handle('tag:delete', async (_e, id: string) => deleteTag(id));
  ipcMain.handle('tag:add-to-item', async (_e, itemId: string, tagId: string) =>
    addTagToItem(itemId, tagId));
  ipcMain.handle('tag:remove-from-item', async (_e, itemId: string, tagId: string) =>
    removeTagFromItem(itemId, tagId));
  ipcMain.handle('tag:get-for-item', async (_e, itemId: string) => getTagsForItem(itemId));

  // ========== 搜索 ==========
  ipcMain.handle('search:query', async (_e, query: string, filters) =>
    searchItems(query, filters));
  ipcMain.handle('search:by-tag', async (_e, tagId: string) => searchByTag(tagId));

  // ========== 标注 ==========
  ipcMain.handle('annotation:list', async (_e, itemId: string) => getAnnotations(itemId));
  ipcMain.handle('annotation:create', async (_e, data) => createAnnotation(data));
  ipcMain.handle('annotation:delete', async (_e, id: string) => deleteAnnotation(id));

  // ========== 星标 ==========
  ipcMain.handle('item:toggle-star', async (_e, id: string) => toggleStar(id));
  ipcMain.handle('item:starred', async () => getStarredItems());

  // ========== 批量操作 ==========
  ipcMain.handle('item:batch-delete', async (_e, ids: string[]) => { batchDeleteItems(ids); });
  ipcMain.handle('item:batch-categorize', async (_e, ids: string[], categoryId: string | null) => { batchCategorize(ids, categoryId); });
  ipcMain.handle('item:batch-tag', async (_e, ids: string[], tagId: string) => { batchTag(ids, tagId); });
  ipcMain.handle('item:reorder', async (_e, ids: string[]) => { reorderItems(ids); });

  // ========== HTML 图片本地化 ==========
  ipcMain.handle('import:localize-images', async (_e, itemId: string, baseUrl: string) => {
    const item = getItem(itemId);
    if (!item) return { success: false, error: '条目不存在' };
    const absPath = getMediaPath(item.file_path);
    try {
      await localizeHtmlImages(absPath, baseUrl);
      // 重新提取 preview_text
      const newText = fs.readFileSync(absPath, 'utf-8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 50000);
      updateItem(itemId, { preview_text: newText });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ========== 对话框 ==========
  ipcMain.handle('dialog:open-folder', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择知识库文件夹',
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:open-files', async () => {
    if (!mainWindow) return [];
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      title: '选择要导入的文件',
      filters: [
        { name: '所有支持的文件', extensions: ['txt', 'md', 'html', 'htm', 'docx', 'pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'mp4', 'mov', 'mkv', 'webm'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('dialog:confirm', async (_e, message: string) => {
    if (!mainWindow) return false;
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['取消', '确认'],
      defaultId: 1,
      title: '确认',
      message,
    });
    return result.response === 1;
  });

  // ========== 文件系统辅助 ==========
  ipcMain.handle('fs:get-media-path', async (_e, relativePath: string) =>
    getMediaPath(relativePath));

  ipcMain.handle('shell:open-path', async (_e, filePath: string) => {
    const mediaRoot = path.resolve(getKnowledgeBaseRoot(), '_media');
    const target = path.resolve(filePath);
    if (!target.startsWith(mediaRoot + path.sep)) throw new Error('只能打开知识库内的文件');
    return shell.openPath(filePath);
  });

  // ========== 开机自启动 ==========
  ipcMain.handle('app:get-auto-start', async () => {
    if (process.platform === 'linux') return false;
    try { return app.getLoginItemSettings().openAtLogin; } catch { return false; }
  });
  ipcMain.handle('app:set-auto-start', async (_e, enabled: boolean) => {
    if (process.platform === 'linux') return false;
    app.setLoginItemSettings({ openAtLogin: enabled });
    return app.getLoginItemSettings().openAtLogin;
  });

  // ========== 新建文件 ==========
  ipcMain.handle('item:create-file', async (_e, title: string, fileType: string, content: string, categoryId: string | null) => {
    ensureMediaDir();
    const ext = fileType === 'md' ? '.md' : '.txt';
    const storedName = `${uuid()}${ext}`;
    const destPath = getMediaPath(storedName);
    const initialContent = content || (fileType === 'md'
      ? `# ${title}\n\n开始编写...\n`
      : `# ${title}\n\n开始编写...\n`);
    fs.writeFileSync(destPath, initialContent, 'utf-8');
    const stats = fs.statSync(destPath);
    const item = createItem({
      title,
      file_path: storedName,
      original_url: '',
      source_type: 'local',
      file_type: fileType as any,
      size: stats.size,
      preview_text: initialContent,
      category_id: categoryId,
    });
    return item;
  });

  // ========== 文件保存（编辑模式、写时复制） ==========
  ipcMain.handle('item:save-content', async (_e, itemId: string, newContent: string) => {
    const item = getItem(itemId);
    if (!item) return { success: false, error: '条目不存在' };
    let absPath = getMediaPath(item.file_path);

    try {
      // 写时复制：如果文件还在 _media 根目录（首次编辑），先复制到 _edited 子目录
      const mediaRoot = path.join(getKnowledgeBaseRoot(), '_media');
      const editedDir = path.join(mediaRoot, '_edited');
      if (path.dirname(absPath) === mediaRoot) {
        if (!fs.existsSync(editedDir)) {
          fs.mkdirSync(editedDir, { recursive: true });
        }
        const ext = path.extname(item.file_path);
        const basename = path.basename(item.file_path, ext);
        const editedName = `${basename}_edited${ext}`;
        const editedPath = path.join(editedDir, editedName);
        // 复制原始文件到 _edited
        fs.copyFileSync(absPath, editedPath);
        // 更新条目的 file_path 指向 _edited 中的副本
        const newRelativePath = `_edited/${editedName}`;
        updateItem(itemId, { file_path: newRelativePath });
        absPath = editedPath;
      }

      // 写入修改内容
      fs.writeFileSync(absPath, newContent, 'utf-8');
      // 更新 preview_text 用于搜索
      updateItem(itemId, { preview_text: newContent.substring(0, 50000), size: Buffer.byteLength(newContent, 'utf-8') });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
}
