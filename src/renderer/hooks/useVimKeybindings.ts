/**
 * Vim 风格全键盘操作 Hook
 *
 * 模态设计:
 *   Normal — 不在输入框时，所有操作手不离主键盘
 *   Insert — 焦点在 input/textarea/contenteditable 时，自然打字，Esc 退出
 *
 * 键位一览:
 *   hjkl      — 面板切换 (h← l→) / 列表导航 (j↓ k↑)
 *   gg / G    — 跳到首/尾
 *   dd        — 删除当前项
 *   Space     — 切换星标
 *   /         — 聚焦搜索框
 *   n / N     — 下/上一个搜索结果
 *   f         — 阅读模式
 *   t         — 暗色模式
 *   m         — 折叠/展开侧栏
 *   v         — 批量选择模式
 *   r         — 重命名
 *   i         — 编辑模式 (可编辑文件)
 *   s         — 保存 (编辑模式)
 *   c         — 新建文件
 *   a         — 新建分类/标签 (上下文)
 *   + / -     — 放大/缩小字号
 *   ?         — 关于弹窗
 *   Ctrl+o    — 导入文件
 *   Esc       — 取消 / 退出 / 清除搜索
 *   Ctrl+d/u  — 翻半页 (预览区)
 *   Enter     — 确认 / 进入
 */
import { useEffect, useRef, useCallback } from 'react';
import { Modal, message } from 'antd';
import { useStore } from '../store';
import type { Item } from '../../shared/types';

type PanelFocus = 'sidebar' | 'list' | 'preview';

/* 计算当前过滤后的条目列表 (与 ItemList 保持一致) */
function getFilteredItems(): Item[] {
  const s = useStore.getState();
  let list = s.items;
  if (s.searchResults !== null) list = s.searchResults.map(r => r.item);
  else if (s.selectedCategoryId) list = s.items.filter(i => i.category_id === s.selectedCategoryId);
  if (s.starredFilter) list = list.filter(i => (i as any).is_starred);
  return list;
}

/* 是否在输入框内 */
function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

/* 是否有弹窗/下拉打开 */
function isPopupOpen(): boolean {
  return document.querySelectorAll('.ant-modal-root, .ant-dropdown, .ant-popover').length > 0;
}

/* 预览区滚动 */
function scrollPreview(delta: number): void {
  const el = document.querySelector('.preview-content')?.closest('[style*="overflow"]') as HTMLElement | null;
  const container = el || document.querySelector('.preview-scroll') as HTMLElement | null;
  // fallback: 找 preview 区内的可滚动父元素
  const fallback = document.querySelector('[class*="preview"]') as HTMLElement | null;
  const target = container || (fallback?.closest('[style*="overflow: auto"]') as HTMLElement | null);
  if (target) {
    target.scrollBy({ top: delta, behavior: 'auto' });
  }
}

const SEQ_TIMEOUT = 450; // 连击超时 ms

export function useVimKeybindings(onDataChange: () => void) {
  const seqRef = useRef<string | null>(null);
  const seqTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDataChangeRef = useRef(onDataChange);
  onDataChangeRef.current = onDataChange;

  /* 清除序列缓冲 */
  const clearSeq = useCallback(() => {
    seqRef.current = null;
    if (seqTimerRef.current) { clearTimeout(seqTimerRef.current); seqTimerRef.current = null; }
  }, []);

  /* 设置序列缓冲 */
  const setSeq = useCallback((key: string) => {
    seqRef.current = key;
    if (seqTimerRef.current) clearTimeout(seqTimerRef.current);
    seqTimerRef.current = setTimeout(clearSeq, SEQ_TIMEOUT);
  }, [clearSeq]);

  /* 在条目列表中通过索引选中 */
  const selectItemByIndex = useCallback((idx: number) => {
    const items = getFilteredItems();
    if (items.length === 0) return;
    const clamped = Math.max(0, Math.min(idx, items.length - 1));
    const state = useStore.getState();
    state.setSelectedItemId(items[clamped].id);
    state.setVimPanelFocus('list');
  }, []);

  /* 选中分类 */
  const selectCategoryByIndex = useCallback((idx: number) => {
    const cats = useStore.getState().categories;
    if (cats.length === 0) return;
    const clamped = Math.max(0, Math.min(idx, cats.length - 1));
    const state = useStore.getState();
    state.setSelectedCategoryId(cats[clamped].id);
    state.setSelectedTagId(null);
    state.setSearchResults(null);
    state.setSearchQuery('');
    state.setVimPanelFocus('sidebar');
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const state = useStore.getState();
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable;

      // --- Insert mode: 只处理 Esc 返回 Normal ---
      if (isInput) {
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur();
          state.setVimMode('normal');
        }
        return;
      }

      // 弹窗打开时不处理 (除了 Esc)
      if (isPopupOpen()) {
        if (e.key === 'Escape') {
          // 让 antd Modal 自己处理关闭
          state.setVimMode('normal');
        }
        return;
      }

      // --- 更新模式显示 ---
      state.setVimMode('normal');

      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const { vimPanelFocus: focus, selectedItemId, selectedCategoryId } = state;

      // --- 全局快捷键 (不受面板焦点影响) ---

      // Esc: 清除一切
      if (e.key === 'Escape') {
        e.preventDefault();
        clearSeq();
        if (state.readingMode) state.setReadingMode(false);
        if (state.batchMode) state.toggleBatchMode();
        state.setSearchResults(null);
        state.setSearchQuery('');
        state.setVimSearchIdx(0);
        return;
      }

      // / 聚焦搜索
      if (e.key === '/' && !ctrl) {
        e.preventDefault();
        clearSeq();
        const searchInput = document.querySelector('.ant-input-search input, input[placeholder*="搜索"]') as HTMLInputElement | null;
        if (searchInput) {
          searchInput.focus();
          state.setVimMode('insert');
        }
        return;
      }

      // Ctrl+o 导入文件
      if (ctrl && e.key === 'o') {
        e.preventDefault();
        clearSeq();
        window.electronAPI.dialogOpenFiles().then(paths => {
          if (paths.length > 0) {
            window.electronAPI.importFiles(paths).then(() => onDataChangeRef.current());
          }
        });
        return;
      }

      // Ctrl+d / Ctrl+u 翻页
      if (ctrl && (e.key === 'd' || e.key === 'u')) {
        e.preventDefault();
        clearSeq();
        const previewEl = document.querySelector('[style*="overflow"]') as HTMLElement | null;
        if (previewEl) {
          const h = previewEl.clientHeight || 600;
          previewEl.scrollBy({ top: e.key === 'd' ? h / 2 : -h / 2, behavior: 'smooth' });
        }
        return;
      }

      // ? 关于
      if (e.key === '?' && !ctrl) {
        e.preventDefault();
        clearSeq();
        window.dispatchEvent(new CustomEvent('vim:about'));
        return;
      }

      // --- 单键全局操作 ---

      // t 暗色模式
      if (e.key === 't' && !ctrl) { e.preventDefault(); clearSeq(); state.toggleDarkMode(); return; }

      // f 阅读模式
      if (e.key === 'f' && !ctrl) { e.preventDefault(); clearSeq(); state.setReadingMode(!state.readingMode); return; }

      // m 侧栏
      if (e.key === 'm' && !ctrl) { e.preventDefault(); clearSeq(); state.setSidebarCollapsed(!state.sidebarCollapsed); return; }

      // v 批量模式
      if (e.key === 'v' && !ctrl) { e.preventDefault(); clearSeq(); state.toggleBatchMode(); return; }
      // V 全选并进入批量模式
      if (e.key === 'V' && !ctrl) {
        e.preventDefault(); clearSeq();
        if (!state.batchMode) state.toggleBatchMode();
        state.selectAllItems();
        return;
      }

      // c 新建文件
      if (e.key === 'c' && !ctrl) { e.preventDefault(); clearSeq(); state.setNewFileModalOpen(true); return; }

      // + / - 字号
      if (e.key === '=' || e.key === '+') {
        e.preventDefault(); clearSeq();
        // 字号增大在 PreviewPanel 本地状态中，这里简化处理：触发事件
        window.dispatchEvent(new CustomEvent('vim:font-inc'));
        return;
      }
      if (e.key === '-') {
        e.preventDefault(); clearSeq();
        window.dispatchEvent(new CustomEvent('vim:font-dec'));
        return;
      }

      // --- 序列键 (gg, dd, zz) ---
      const SEQ_KEYS = ['g', 'd'];
      if (SEQ_KEYS.includes(e.key) && !ctrl) {
        e.preventDefault();
        if (seqRef.current === e.key) {
          // 第二次按下: 执行双重命令
          clearSeq();
          if (e.key === 'g') {
            // gg: 跳转到第一个
            if (focus === 'sidebar') selectCategoryByIndex(0);
            else selectItemByIndex(0);
          } else if (e.key === 'd') {
            // dd: 删除当前
            handleDelete(state, onDataChangeRef.current);
          }
        } else {
          setSeq(e.key);
        }
        return;
      }
      // 非序列键按下时清除序列缓冲
      if (seqRef.current) clearSeq();

      // n / N 搜索导航
      if ((e.key === 'n' || e.key === 'N') && !ctrl) {
        e.preventDefault();
        const results = state.searchResults;
        if (!results || results.length === 0) return;
        let idx = state.vimSearchIdx;
        if (e.key === 'n') idx = (idx + 1) % results.length;
        else idx = (idx - 1 + results.length) % results.length;
        state.setVimSearchIdx(idx);
        state.setSelectedItemId(results[idx].item.id);
        return;
      }

      // --- 面板切换 (h/l) ---
      if (e.key === 'h' && !ctrl) {
        e.preventDefault();
        const order: PanelFocus[] = ['sidebar', 'list', 'preview'];
        const cur = order.indexOf(focus);
        const next = order[Math.max(0, cur - 1)];
        state.setVimPanelFocus(next);
        return;
      }
      if (e.key === 'l' && !ctrl) {
        e.preventDefault();
        const order: PanelFocus[] = ['sidebar', 'list', 'preview'];
        const cur = order.indexOf(focus);
        const next = order[Math.min(order.length - 1, cur + 1)];
        state.setVimPanelFocus(next);
        return;
      }

      // --- 面板内导航 (j/k) ---
      if ((e.key === 'j' || e.key === 'k') && !ctrl) {
        e.preventDefault();
        const delta = e.key === 'j' ? 1 : -1;

        if (focus === 'sidebar') {
          const cats = state.categories;
          if (cats.length === 0) return;
          const curIdx = cats.findIndex(c => c.id === state.selectedCategoryId);
          selectCategoryByIndex((curIdx === -1 ? 0 : curIdx) + delta);
        } else if (focus === 'list') {
          const items = getFilteredItems();
          if (items.length === 0) return;
          const curIdx = items.findIndex(i => i.id === state.selectedItemId);
          selectItemByIndex((curIdx === -1 ? 0 : curIdx) + delta);
        } else {
          // preview: 滚动
          scrollPreview(delta * 60);
        }
        return;
      }

      // G: 跳到末尾
      if (e.key === 'G' && !ctrl && !shift) {
        e.preventDefault();
        if (focus === 'sidebar') {
          const cats = state.categories;
          if (cats.length > 0) selectCategoryByIndex(cats.length - 1);
        } else {
          const items = getFilteredItems();
          if (items.length > 0) selectItemByIndex(items.length - 1);
        }
        return;
      }

      // --- 面板内操作 ---

      // Enter 进入/编辑
      if (e.key === 'Enter' && !ctrl) {
        e.preventDefault();
        if (focus === 'preview') {
          // 尝试进入编辑模式：触发预览面板的编辑按钮
          const editBtn = document.querySelector('[title*="编辑"]') as HTMLElement | null;
          editBtn?.click();
        }
        return;
      }

      // Space 星标
      if (e.key === ' ' && !ctrl) {
        e.preventDefault();
        if (selectedItemId) {
          window.electronAPI.itemToggleStar(selectedItemId).then(() => onDataChangeRef.current());
        }
        return;
      }

      // r 重命名
      if (e.key === 'r' && !ctrl) {
        e.preventDefault();
        if (focus === 'sidebar' && selectedCategoryId) {
          // 触发侧栏重命名
          const renameBtn = document.querySelector('[class*="cat-actions"] [title="重命名"]') as HTMLElement | null;
          renameBtn?.click();
        } else if (selectedItemId) {
          const newTitle = prompt('修改标题');
          if (newTitle && newTitle.trim()) {
            window.electronAPI.itemUpdate(selectedItemId, { title: newTitle.trim() }).then(() => onDataChangeRef.current());
          }
        }
        return;
      }

      // i 编辑模式
      if (e.key === 'i' && !ctrl) {
        e.preventDefault();
        const editBtn = document.querySelector('[title*="编辑"]') as HTMLElement | null;
        editBtn?.click();
        return;
      }

      // s 保存 (仅在编辑模式有效)
      if (e.key === 's' && !ctrl) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('kb:save'));
        return;
      }

      // a 新建分类/标签 (基于面板)
      if (e.key === 'a' && !ctrl) {
        e.preventDefault();
        if (focus === 'sidebar') {
          // 点击"新建分类"或"新建标签"按钮
          const addBtns = Array.from(document.querySelectorAll('button')).filter(b =>
            b.textContent?.includes('新建分类') || b.textContent?.includes('新建标签'));
          if (addBtns.length > 0) (addBtns[0] as HTMLElement).click();
        }
        return;
      }

      // --- 批量模式下 ---
      if (state.batchMode && selectedItemId && !ctrl) {
        if (e.key === ' ') {
          e.preventDefault();
          state.toggleItemSelection(selectedItemId);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearSeq();
    };
    // ponytail: onDataChange via ref avoids re-registering listener every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/* 删除当前选中项 */
function handleDelete(state: ReturnType<typeof useStore.getState>, onDataChange: () => void) {
  const { vimPanelFocus: focus, selectedItemId, selectedCategoryId } = state;
  if (focus === 'sidebar' && selectedCategoryId) {
    // 删除分类
    const cat = state.categories.find(c => c.id === selectedCategoryId);
    if (!cat) return;
    Modal.confirm({
      title: '删除分类',
      content: `确定要删除"${cat.name}"吗？分类下的条目不会被删除。`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        await window.electronAPI.categoryDelete(cat.id);
        state.setSelectedCategoryId(null);
        onDataChange();
      },
    });
  } else if (selectedItemId) {
    // 删除条目
    const item = state.items.find(i => i.id === selectedItemId);
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除"${item?.title || '选中条目'}"吗？此操作不可撤销。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        await window.electronAPI.itemDelete(selectedItemId);
        state.setSelectedItemId(null);
        onDataChange();
      },
    });
  }
}
