/**
 * IPC 通信处理
 * 注册所有主进程 <-> 渲染进程的通信通道
 */
import { ipcMain, dialog, BrowserWindow, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import {
  initDatabase, closeDatabase, setKnowledgeBaseRoot, ensureMediaDir,
  getCategories, createCategory, renameCategory, deleteCategory, moveCategory,
  getItems, getItem, createItem, updateItem, deleteItem,
  getTags, createTag, deleteTag, addTagToItem, removeTagFromItem, getTagsForItem,
  searchItems, searchByTag,
  getAnnotations, createAnnotation, deleteAnnotation,
  getMediaPath, getKnowledgeBaseRoot,
  toggleStar, getStarredItems, batchDeleteItems, batchCategorize, batchTag,
} from './database';
import { importFiles, importFromClipboardText, importFromClipboardImage, getFileType, isTextType, localizeHtmlImages } from './file-manager';
import type { KnowledgeBaseConfig, FileContent } from '../shared/types';

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow): void {
  mainWindow = win;
}

/** 注册所有 IPC 处理器 */
export function registerIpcHandlers(): void {
  // ========== 知识库 ==========
  ipcMain.handle('kb:init', async (_event, folderPath: string) => {
    const name = path.basename(folderPath);
    setKnowledgeBaseRoot(folderPath);
    await initDatabase(folderPath);
    const config: KnowledgeBaseConfig = {
      rootPath: folderPath,
      name,
      created_at: new Date().toISOString(),
    };
    // 保存配置到 .kbconfig
    fs.writeFileSync(
      path.join(folderPath, '.kbconfig'),
      JSON.stringify(config, null, 2)
    );
    return config;
  });

  ipcMain.handle('kb:get-config', async () => {
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
    } else if (['jpg', 'png', 'gif', 'webp'].includes(item.file_type)) {
      content.type = 'image';
    } else if (['mp4', 'mov', 'mkv'].includes(item.file_type)) {
      content.type = 'video';
      content.mimeType = item.file_type === 'mov' ? 'video/quicktime' :
                         item.file_type === 'mkv' ? 'video/x-matroska' :
                         'video/mp4';
    } else if (item.file_type === 'pdf') {
      content.type = 'pdf';
    }

    return content;
  });

  // ========== 文件导入 ==========
  ipcMain.handle('import:files', async (_e, filePaths: string[]) => {
    const items = importFiles(filePaths);
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
        { name: '所有支持的文件', extensions: ['txt', 'md', 'html', 'htm', 'docx', 'pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'mkv'] },
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
    return shell.openPath(filePath);
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
