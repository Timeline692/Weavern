/**
 * Zustand 全局状态管理
 */
import { create } from 'zustand';
import type { Item, Category, Tag, Annotation, SearchResult, KnowledgeBaseConfig, ItemSort } from '../shared/types';

export type { ItemSort } from '../shared/types';

interface AppState {
  // 知识库
  kbConfig: KnowledgeBaseConfig | null;
  kbReady: boolean;

  // 分类
  categories: Category[];
  selectedCategoryId: string | null;

  // 条目
  items: Item[];
  selectedItemId: string | null;
  viewMode: 'card' | 'list';
  itemSort: ItemSort;

  // 批量操作
  batchMode: boolean;
  selectedItemIds: Set<string>;

  // 星标
  starredFilter: boolean;

  // 标签
  tags: Tag[];
  selectedTagId: string | null;

  // 搜索
  searchQuery: string;
  searchResults: SearchResult[] | null;
  searchHistory: string[];

  // 标注
  annotations: Annotation[];

  // UI状态
  sidebarCollapsed: boolean;
  readingMode: boolean;
  globalLoading: boolean;
  darkMode: boolean;
  newFileModalOpen: boolean;
  autoStartEnabled: boolean;

  // Vim 键位
  vimPanelFocus: 'sidebar' | 'list' | 'preview';
  vimMode: 'normal' | 'insert';
  vimSearchIdx: number;

  // Actions
  setKbConfig: (config: KnowledgeBaseConfig | null) => void;
  setKbReady: (ready: boolean) => void;
  setCategories: (cats: Category[]) => void;
  setSelectedCategoryId: (id: string | null) => void;
  setItems: (items: Item[]) => void;
  setSelectedItemId: (id: string | null) => void;
  setViewMode: (mode: 'card' | 'list') => void;
  setItemSort: (sort: ItemSort) => void;
  toggleBatchMode: () => void;
  toggleItemSelection: (id: string) => void;
  selectAllItems: (ids?: string[]) => void;
  resetKnowledgeBaseView: () => void;
  clearSelection: () => void;
  setStarredFilter: (v: boolean) => void;
  setTags: (tags: Tag[]) => void;
  setSelectedTagId: (id: string | null) => void;
  setSearchQuery: (q: string) => void;
  setSearchResults: (results: SearchResult[] | null) => void;
  addSearchHistory: (q: string) => void;
  clearSearchHistory: () => void;
  setAnnotations: (anns: Annotation[]) => void;
  setSidebarCollapsed: (v: boolean) => void;
  setReadingMode: (v: boolean) => void;
  setGlobalLoading: (v: boolean) => void;
  toggleDarkMode: () => void;
  setNewFileModalOpen: (v: boolean) => void;
  setAutoStartEnabled: (v: boolean) => void;
  setVimPanelFocus: (f: 'sidebar' | 'list' | 'preview') => void;
  setVimMode: (m: 'normal' | 'insert') => void;
  setVimSearchIdx: (i: number) => void;
}

export const useStore = create<AppState>((set, get) => ({
  kbConfig: null,
  kbReady: false,
  categories: [],
  selectedCategoryId: null,
  items: [],
  selectedItemId: null,
  viewMode: 'card',
  itemSort: 'updated',
  batchMode: false,
  selectedItemIds: new Set(),
  starredFilter: false,
  tags: [],
  selectedTagId: null,
  searchQuery: '',
  searchResults: null,
  searchHistory: [],
  annotations: [],
  sidebarCollapsed: false,
  readingMode: false,
  globalLoading: false,
  darkMode: false,
  newFileModalOpen: false,
  autoStartEnabled: false,
  vimPanelFocus: 'list',
  vimMode: 'normal',
  vimSearchIdx: 0,

  setKbConfig: (config) => set({ kbConfig: config }),
  setKbReady: (ready) => set({ kbReady: ready }),
  setCategories: (cats) => set({ categories: cats }),
  setSelectedCategoryId: (id) => set({ selectedCategoryId: id, selectedTagId: null, starredFilter: false, searchResults: null, searchQuery: '' }),
  setItems: (items) => set({ items }),
  setSelectedItemId: (id) => set({ selectedItemId: id }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setItemSort: (sort) => set({ itemSort: sort }),
  toggleBatchMode: () => set(s => ({ batchMode: !s.batchMode, selectedItemIds: new Set() })),
  toggleItemSelection: (id) => {
    const next = new Set(get().selectedItemIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    set({ selectedItemIds: next });
  },
  selectAllItems: (ids) => {
    const all = new Set(ids ?? get().items.map(i => i.id));
    set({ selectedItemIds: all });
  },
  resetKnowledgeBaseView: () => set({ categories: [], items: [], tags: [], annotations: [], selectedCategoryId: null, selectedTagId: null, selectedItemId: null, selectedItemIds: new Set(), batchMode: false, starredFilter: false, searchQuery: '', searchResults: null, readingMode: false }),
  clearSelection: () => set({ selectedItemIds: new Set() }),
  setStarredFilter: (v) => set({ starredFilter: v, selectedCategoryId: null, selectedTagId: null, searchResults: null, searchQuery: '' }),
  setTags: (tags) => set({ tags }),
  setSelectedTagId: (id) => set({ selectedTagId: id, selectedCategoryId: null, starredFilter: false, searchResults: null, searchQuery: '' }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setSearchResults: (results) => set({ searchResults: results }),
  addSearchHistory: (q) => {
    const history = get().searchHistory.filter(h => h !== q);
    set({ searchHistory: [q, ...history].slice(0, 20) });
  },
  clearSearchHistory: () => set({ searchHistory: [] }),
  setAnnotations: (anns) => set({ annotations: anns }),
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
  setReadingMode: (v) => set({ readingMode: v }),
  setGlobalLoading: (v) => set({ globalLoading: v }),
  toggleDarkMode: () => set(s => ({ darkMode: !s.darkMode })),
  setNewFileModalOpen: (v) => set({ newFileModalOpen: v }),
  setAutoStartEnabled: (v) => set({ autoStartEnabled: v }),
  setVimPanelFocus: (f) => set({ vimPanelFocus: f }),
  setVimMode: (m) => set({ vimMode: m }),
  setVimSearchIdx: (i) => set({ vimSearchIdx: i }),
}));
