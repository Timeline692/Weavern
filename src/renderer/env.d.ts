/**
 * 渲染进程全局类型声明
 */

/// <reference types="vite/client" />

interface ElectronAPI {
  getPathForFile: (file: File) => string;
  kbInit: (path: string) => Promise<any>;
  kbGetConfig: () => Promise<any>;
  categoryList: () => Promise<any[]>;
  categoryCreate: (name: string, parentId: string | null) => Promise<any>;
  categoryRename: (id: string, name: string) => Promise<void>;
  categoryDelete: (id: string) => Promise<void>;
  categoryMove: (id: string, newParentId: string | null, newOrder: number) => Promise<void>;
  itemList: (categoryId?: string) => Promise<any[]>;
  itemGet: (id: string) => Promise<any>;
  itemCreate: (data: any) => Promise<any>;
  itemCreateFile: (title: string, fileType: string, content: string, categoryId: string | null) => Promise<any>;
  itemUpdate: (id: string, data: any) => Promise<void>;
  itemDelete: (id: string) => Promise<void>;
  itemGetContent: (id: string) => Promise<any>;
  importFiles: (paths: string[]) => Promise<any[]>;
  importClipboard: (data: any) => Promise<any>;
  importUrlDetect: (url: string) => Promise<{title: string; url: string; error?: string}>;
  importUrl: (url: string, title?: string) => Promise<{success: boolean; item?: any; error?: string}>;
  onImportComplete: (callback: (results: any[]) => void) => () => void;
  tagList: () => Promise<any[]>;
  tagCreate: (name: string) => Promise<any>;
  tagDelete: (id: string) => Promise<void>;
  tagAddToItem: (itemId: string, tagId: string) => Promise<void>;
  tagRemoveFromItem: (itemId: string, tagId: string) => Promise<void>;
  tagGetForItem: (itemId: string) => Promise<any[]>;
  searchQuery: (query: string, filters?: any) => Promise<any[]>;
  searchByTag: (tagId: string) => Promise<any[]>;
  annotationList: (itemId: string) => Promise<any[]>;
  annotationCreate: (data: any) => Promise<any>;
  annotationDelete: (id: string) => Promise<void>;
  dialogOpenFolder: () => Promise<string | null>;
  dialogOpenFiles: () => Promise<string[]>;
  dialogConfirm: (message: string) => Promise<boolean>;
  fsGetMediaPath: (relativePath: string) => Promise<string>;
  shellOpenPath: (filePath: string) => Promise<string>;
  saveContent: (itemId: string, content: string) => Promise<{success: boolean; error?: string}>;
  itemToggleStar: (id: string) => Promise<boolean>;
  itemStarredList: () => Promise<any[]>;
  itemBatchDelete: (ids: string[]) => Promise<void>;
  itemBatchCategorize: (ids: string[], categoryId: string | null) => Promise<void>;
  itemBatchTag: (ids: string[], tagId: string) => Promise<void>;
  itemReorder: (ids: string[]) => Promise<void>;
  importLocalizeImages: (itemId: string, baseUrl: string) => Promise<{success: boolean; error?: string}>;
  appGetAutoStart: () => Promise<boolean>;
  appSetAutoStart: (enabled: boolean) => Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

// Electron webview 标签
declare namespace JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        src?: string;
        nodeintegration?: string;
        plugins?: string;
        preload?: string;
        httpreferrer?: string;
        useragent?: string;
        allowpopups?: string;
        partition?: string;
      },
      HTMLElement
    >;
  }
}

export {};
