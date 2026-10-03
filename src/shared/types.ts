// ========== 核心数据类型定义 ==========

/** 分类 */
export interface Category {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
}

/** 条目 */
export interface Item {
  id: string;
  title: string;
  file_path: string;        // 相对路径，相对于知识库根目录的 _media
  original_url: string;     // 原始网页 URL
  source_type: SourceType;
  file_type: FileType;
  size: number;             // 字节
  preview_text: string;     // 可搜索的纯文本内容
  category_id: string | null;
  is_starred: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type SourceType = 'local' | 'url' | 'clipboard';
export type FileType = 'txt' | 'md' | 'html' | 'docx' | 'pdf' | 'jpg' | 'png' | 'gif' | 'webp' | 'bmp' | 'svg' | 'mp4' | 'mov' | 'mkv' | 'webm' | 'other';
export type ItemSort = 'updated' | 'manual' | 'name' | 'date' | 'size' | 'type';

/** 标签 */
export interface Tag {
  id: string;
  name: string;
}

/** 条目-标签关联 */
export interface ItemTag {
  item_id: string;
  tag_id: string;
}

/** 标注/笔记 */
export interface Annotation {
  id: string;
  item_id: string;
  type: 'highlight' | 'note' | 'timestamp';
  content: string;              // 笔记内容或高亮文本
  target_selector: string;      // CSS选择器 | 时间秒数 | 图片坐标JSON
  created_at: string;
}

/** 搜索结果 */
export interface SearchResult {
  item: Item;
  snippet: string;      // 匹配片段，含高亮标记
  score: number;
}

/** 知识库配置 */
export interface KnowledgeBaseConfig {
  rootPath: string;       // 知识库根文件夹
  name: string;
  created_at: string;
}

// ========== IPC 通道类型 ==========

export interface IpcChannels {
  // 知识库
  'kb:init': { args: [path: string]; result: KnowledgeBaseConfig };
  'kb:get-config': { args: []; result: KnowledgeBaseConfig | null };

  // 分类
  'category:list': { args: []; result: Category[] };
  'category:create': { args: [name: string, parentId: string | null]; result: Category };
  'category:rename': { args: [id: string, name: string]; result: void };
  'category:delete': { args: [id: string]; result: void };
  'category:move': { args: [id: string, newParentId: string | null, newOrder: number]; result: void };

  // 条目
  'item:list': { args: [categoryId?: string]; result: Item[] };
  'item:get': { args: [id: string]; result: Item | null };
  'item:create': { args: [data: CreateItemInput]; result: Item };
  'item:update': { args: [id: string, data: Partial<Item>]; result: void };
  'item:delete': { args: [id: string]; result: void };
  'item:get-content': { args: [id: string]; result: FileContent };

  // 文件导入
  'import:files': { args: [paths: string[]]; result: ImportResult };
  'import:clipboard': { args: [data: ClipboardData]; result: ImportResult };
  'import:url': { args: [url: string]; result: ImportResult };

  // 标签
  'tag:list': { args: []; result: Tag[] };
  'tag:create': { args: [name: string]; result: Tag };
  'tag:delete': { args: [id: string]; result: void };
  'tag:add-to-item': { args: [itemId: string, tagId: string]; result: void };
  'tag:remove-from-item': { args: [itemId: string, tagId: string]; result: void };
  'tag:get-for-item': { args: [itemId: string]; result: Tag[] };

  // 搜索
  'search:query': { args: [query: string, filters?: SearchFilters]; result: SearchResult[] };
  'search:by-tag': { args: [tagId: string]; result: Item[] };

  // 标注
  'annotation:list': { args: [itemId: string]; result: Annotation[] };
  'annotation:create': { args: [data: Omit<Annotation, 'id' | 'created_at'>]; result: Annotation };
  'annotation:delete': { args: [id: string]; result: void };

  // 对话框
  'dialog:open-folder': { args: []; result: string | null };
  'dialog:open-files': { args: []; result: string[] };
  'dialog:confirm': { args: [message: string]; result: boolean };

  // 文件系统
  'fs:read-file': { args: [relativePath: string]; result: Buffer | null };
  'fs:get-media-path': { args: [relativePath: string]; result: string };
}

export type IpcChannel = keyof IpcChannels;

/** 创建条目的输入 */
export interface CreateItemInput {
  title: string;
  file_path: string;
  original_url?: string;
  source_type: SourceType;
  file_type: FileType;
  size: number;
  preview_text: string;
  category_id?: string | null;
}

/** 文件导入结果 */
export interface ImportResult {
  success: boolean;
  item?: Item;
  error?: string;
  duplicates?: Item[];
}

/** 剪贴板数据 */
export interface ClipboardData {
  type: 'text' | 'image';
  text?: string;
  imageBase64?: string;
}

/** 搜索筛选器 */
export interface SearchFilters {
  categoryId?: string;
  tagIds?: string[];
  fileTypes?: FileType[];
}

/** 文件内容（预览用） */
export interface FileContent {
  type: 'text' | 'html' | 'image' | 'video' | 'pdf' | 'binary';
  textContent?: string;
  htmlContent?: string;
  /** 文件的绝对路径（图片、视频等直接用 file:// 协议加载） */
  absolutePath?: string;
  mimeType?: string;
}
