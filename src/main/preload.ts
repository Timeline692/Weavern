/**
 * Preload 脚本
 * 在渲染进程和主进程之间建立安全的 IPC 桥接
 */
import { contextBridge, ipcRenderer, webUtils } from 'electron';

// 暴露安全的 API 到渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 获取拖拽文件的真实路径（contextIsolation 模式下 File.path 为 undefined）
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  // 知识库
  kbInit: (path: string) => ipcRenderer.invoke('kb:init', path),
  kbGetConfig: () => ipcRenderer.invoke('kb:get-config'),

  // 分类
  categoryList: () => ipcRenderer.invoke('category:list'),
  categoryCreate: (name: string, parentId: string | null) => ipcRenderer.invoke('category:create', name, parentId),
  categoryRename: (id: string, name: string) => ipcRenderer.invoke('category:rename', id, name),
  categoryDelete: (id: string) => ipcRenderer.invoke('category:delete', id),
  categoryMove: (id: string, newParentId: string | null, newOrder: number) => ipcRenderer.invoke('category:move', id, newParentId, newOrder),

  // 条目
  itemList: (categoryId?: string) => ipcRenderer.invoke('item:list', categoryId),
  itemGet: (id: string) => ipcRenderer.invoke('item:get', id),
  itemCreate: (data: any) => ipcRenderer.invoke('item:create', data),
  itemCreateFile: (title: string, fileType: string, content: string, categoryId: string | null) =>
    ipcRenderer.invoke('item:create-file', title, fileType, content, categoryId),
  itemUpdate: (id: string, data: any) => ipcRenderer.invoke('item:update', id, data),
  itemDelete: (id: string) => ipcRenderer.invoke('item:delete', id),
  itemGetContent: (id: string) => ipcRenderer.invoke('item:get-content', id),

  // 导入
  importFiles: (paths: string[]) => ipcRenderer.invoke('import:files', paths),
  importClipboard: (data: any) => ipcRenderer.invoke('import:clipboard', data),
  importUrlDetect: (url: string) => ipcRenderer.invoke('import:url-detect', url),
  importUrl: (url: string, title?: string) => ipcRenderer.invoke('import:url', url, title),
  onImportComplete: (callback: (results: any[]) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, results: any[]) => callback(results);
    ipcRenderer.on('import:complete', listener);
    return () => ipcRenderer.removeListener('import:complete', listener);
  },

  // 标签
  tagList: () => ipcRenderer.invoke('tag:list'),
  tagCreate: (name: string) => ipcRenderer.invoke('tag:create', name),
  tagDelete: (id: string) => ipcRenderer.invoke('tag:delete', id),
  tagAddToItem: (itemId: string, tagId: string) => ipcRenderer.invoke('tag:add-to-item', itemId, tagId),
  tagRemoveFromItem: (itemId: string, tagId: string) => ipcRenderer.invoke('tag:remove-from-item', itemId, tagId),
  tagGetForItem: (itemId: string) => ipcRenderer.invoke('tag:get-for-item', itemId),

  // 搜索
  searchQuery: (query: string, filters?: any) => ipcRenderer.invoke('search:query', query, filters),
  searchByTag: (tagId: string) => ipcRenderer.invoke('search:by-tag', tagId),

  // 标注
  annotationList: (itemId: string) => ipcRenderer.invoke('annotation:list', itemId),
  annotationCreate: (data: any) => ipcRenderer.invoke('annotation:create', data),
  annotationDelete: (id: string) => ipcRenderer.invoke('annotation:delete', id),

  // 对话框
  dialogOpenFolder: () => ipcRenderer.invoke('dialog:open-folder'),
  dialogOpenFiles: () => ipcRenderer.invoke('dialog:open-files'),
  dialogConfirm: (message: string) => ipcRenderer.invoke('dialog:confirm', message),

  // 文件系统辅助
  fsGetMediaPath: (relativePath: string) => ipcRenderer.invoke('fs:get-media-path', relativePath),
  shellOpenPath: (filePath: string) => ipcRenderer.invoke('shell:open-path', filePath),
  saveContent: (itemId: string, content: string) => ipcRenderer.invoke('item:save-content', itemId, content),
  // 星标
  itemToggleStar: (id: string) => ipcRenderer.invoke('item:toggle-star', id),
  itemStarredList: () => ipcRenderer.invoke('item:starred'),
  // 批量操作
  itemBatchDelete: (ids: string[]) => ipcRenderer.invoke('item:batch-delete', ids),
  itemBatchCategorize: (ids: string[], categoryId: string | null) => ipcRenderer.invoke('item:batch-categorize', ids, categoryId),
  itemBatchTag: (ids: string[], tagId: string) => ipcRenderer.invoke('item:batch-tag', ids, tagId),
  itemReorder: (ids: string[]) => ipcRenderer.invoke('item:reorder', ids),
  // HTML 图片本地化
  importLocalizeImages: (itemId: string, baseUrl: string) => ipcRenderer.invoke('import:localize-images', itemId, baseUrl),
  // 开机自启动
  appGetAutoStart: () => ipcRenderer.invoke('app:get-auto-start'),
  appSetAutoStart: (enabled: boolean) => ipcRenderer.invoke('app:set-auto-start', enabled),
});
