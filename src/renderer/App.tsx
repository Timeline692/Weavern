/**
 * 应用根组件 — 可拖拽调整宽度的三栏布局
 */
import React, { useEffect, useCallback, useState, useRef } from 'react';
import { Button, Modal, Alert } from 'antd';
import { FolderOpenOutlined } from '@ant-design/icons';
import { useStore } from './store';
import { Sidebar } from './components/Sidebar';
import { ItemList } from './components/ItemList';
import { PreviewPanel } from './components/PreviewPanel';
import { Toolbar } from './components/Toolbar';
import { DragDropOverlay } from './components/DragDropOverlay';
import { useVimKeybindings } from './hooks/useVimKeybindings';
import { VimIndicator } from './components/VimIndicator';

// 默认宽度和限制
const DEFAULT_LEFT = 260;
const DEFAULT_MID = 300;
const MIN_PANEL = 180;
const MAX_LEFT = 450;
const MAX_MID = 550;
const MIN_PREVIEW = 320;
const savedWidth = (key: string, fallback: number, max: number) => {
  const value = Number(localStorage.getItem(key));
  return Number.isFinite(value) && value >= MIN_PANEL ? Math.min(value, max) : fallback;
};

export default function App() {
  const { kbReady, kbConfig, setKbConfig, setKbReady, setCategories, setItems, setTags,
    sidebarCollapsed, readingMode, globalLoading, setGlobalLoading,
    setAutoStartEnabled } = useStore();
  const [initError, setInitError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  // 面板宽度
  const [leftWidth, setLeftWidth] = useState(() => savedWidth('weavern:leftWidth', DEFAULT_LEFT, MAX_LEFT));
  const [midWidth, setMidWidth] = useState(() => savedWidth('weavern:midWidth', DEFAULT_MID, MAX_MID));
  const leftWidthRef = useRef(leftWidth);
  const midWidthRef = useRef(midWidth);
  const dragging = useRef<'left' | 'mid' | null>(null);
  const startX = useRef(0);
  const startW = useRef(0);

  useEffect(() => { leftWidthRef.current = leftWidth; localStorage.setItem('weavern:leftWidth', String(leftWidth)); }, [leftWidth]);
  useEffect(() => { midWidthRef.current = midWidth; localStorage.setItem('weavern:midWidth', String(midWidth)); }, [midWidth]);

  // 拖拽调整面板宽度
  const handleResizeStart = useCallback((which: 'left' | 'mid') => (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = which;
    startX.current = e.clientX;
    startW.current = which === 'left' ? leftWidth : midWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [leftWidth, midWidth]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = e.clientX - startX.current;
      if (dragging.current === 'left') {
        setLeftWidth(Math.min(MAX_LEFT, window.innerWidth - midWidthRef.current - MIN_PREVIEW - 12, Math.max(MIN_PANEL, startW.current + delta)));
      } else {
        setMidWidth(Math.min(MAX_MID, window.innerWidth - (useStore.getState().sidebarCollapsed ? 0 : leftWidthRef.current) - MIN_PREVIEW - 12, Math.max(MIN_PANEL, startW.current + delta)));
      }
    };
    const onUp = () => {
      dragging.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    const onResize = () => {
      setLeftWidth(width => Math.min(width, Math.max(MIN_PANEL, window.innerWidth - midWidthRef.current - MIN_PREVIEW - 12)));
      setMidWidth(width => Math.min(width, Math.max(MIN_PANEL, window.innerWidth - leftWidthRef.current - MIN_PREVIEW - 12)));
    };
    window.addEventListener('resize', onResize);
    onResize();
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('resize', onResize);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  // 启动时：有已有知识库则直接进入，否则显示欢迎页
  useEffect(() => {
    if (!window.electronAPI) {
      setInitError('请通过 Electron 桌面应用打开织识。');
      setInitializing(false);
      return;
    }
    (async () => {
      try {
        const config = await window.electronAPI.kbGetConfig();
        if (config) {
          setKbConfig(config);
          setKbReady(true);
          // 异步加载数据（不阻塞 UI）
          const [categories, items, tags] = await Promise.all([
            window.electronAPI.categoryList(),
            window.electronAPI.itemList(),
            window.electronAPI.tagList(),
          ]);
          setCategories(categories);
          setItems(items);
          setTags(tags);
        }
      } catch (err: any) { setInitError(err.message || '无法打开知识库'); }
      finally { setInitializing(false); }
    })();
  }, []);

  // 首次选择知识库文件夹
  const handleInitKb = useCallback(async () => {
    try {
      setGlobalLoading(true);
      const folderPath = await window.electronAPI.dialogOpenFolder();
      if (!folderPath) { setGlobalLoading(false); return; }
      const config = await window.electronAPI.kbInit(folderPath);
      setKbConfig(config);
      setKbReady(true);
      setInitError(null);
      await loadData();
    } catch (err: any) { setInitError(err.message || '初始化失败'); }
    finally { setGlobalLoading(false); }
  }, []);

  const loadData = async () => {
    const [categories, items, tags] = await Promise.all([
      window.electronAPI.categoryList(),
      window.electronAPI.itemList(),
      window.electronAPI.tagList(),
    ]);
    setCategories(categories);
    setItems(items);
    setTags(tags);
  };

  // Vim 风格全键盘操作
  useVimKeybindings(loadData);

  // 加载开机自启动状态
  useEffect(() => {
    (async () => {
      try { setAutoStartEnabled(await window.electronAPI.appGetAutoStart()); }
      catch { setAutoStartEnabled(false); }
    })();
  }, []);

  // 导入完成
  useEffect(() => {
    if (!window.electronAPI) return;
    return window.electronAPI.onImportComplete(async () => {
      const items = await window.electronAPI.itemList();
      setItems(items);
    });
  }, []);

  // ========== 键盘快捷键 ==========
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable;

      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        useStore.getState().setNewFileModalOpen(true);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('kb:save'));
        return;
      }
      if (e.key === 'Delete' && !isInput) {
        const state = useStore.getState();
        if (state.selectedItemId) {
          e.preventDefault();
          Modal.confirm({
            title: '确认删除',
            content: '确定要删除该条目吗？此操作不可撤销。',
            okText: '删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
              await window.electronAPI.itemDelete(state.selectedItemId!);
              state.setSelectedItemId(null);
              const items = await window.electronAPI.itemList();
              state.setItems(items);
            },
          });
        }
        return;
      }
      if (e.key === 'Escape') {
        const state = useStore.getState();
        if (state.readingMode) state.setReadingMode(false);
        if (state.batchMode) state.toggleBatchMode();
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 未初始化 — 首次使用欢迎屏幕
  if (!kbReady) {
    if (initializing) return <div className="welcome-screen"><div className="welcome-mark welcome-loading" aria-label="正在打开知识库">织</div></div>;
    return (
      <div className="welcome-screen">
        <div className="welcome-card">
          <div className="welcome-mark" aria-hidden="true">织</div>
          <div className="welcome-eyebrow">WEAVERN · LOCAL KNOWLEDGE</div>
          <h1>让知识，各归其位。</h1>
          <p>选择一个文件夹开始使用织识。文档、图片、视频与笔记都会保存在你自己的知识库中。</p>
          <Button type="primary" size="large" icon={<FolderOpenOutlined />} onClick={handleInitKb} loading={globalLoading} disabled={!window.electronAPI}>选择知识库文件夹</Button>
          {initError && <Alert style={{ marginTop: 20, textAlign: 'left' }} type="error" showIcon message={initError} />}
        </div>
      </div>
    );
  }

  return (
    <DragDropOverlay>
      <div className="app-shell" style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-body)' }}>
        {/* 顶部工具栏 */}
        <div className="app-topbar" style={{
          minHeight: 64, background: 'var(--bg-header)',
          borderBottom: '1px solid var(--border-light)', padding: '0 20px',
          display: 'flex', alignItems: 'center', flexShrink: 0,
        }}>
          <Toolbar onDataChange={loadData} />
          <VimIndicator />
        </div>

        {/* 三栏主体 */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* 左侧边栏 */}
          {!readingMode && (
            <>
              <div className="app-sidebar" style={{
                width: sidebarCollapsed ? 0 : leftWidth,
                minWidth: sidebarCollapsed ? 0 : MIN_PANEL,
                background: 'var(--bg-sidebar)',
                borderRight: '1px solid var(--border-light)',
                overflow: 'hidden', flexShrink: 0,
                transition: sidebarCollapsed ? 'width 0.2s' : 'none',
              }}>
                <Sidebar onDataChange={loadData} />
              </div>
              {/* 拖拽手柄 */}
              {!sidebarCollapsed && (
                <div className="panel-resizer" onMouseDown={handleResizeStart('left')} />
              )}
            </>
          )}

          {/* 中间条目列表 */}
          {!readingMode && (
            <>
              <div className="app-list" style={{
                width: midWidth, minWidth: MIN_PANEL,
                background: 'var(--bg-panel)',
                borderRight: '1px solid var(--border-light)',
                overflow: 'hidden', flexShrink: 0,
              }}>
                <ItemList onDataChange={loadData} />
              </div>
              {/* 拖拽手柄 */}
              <div className="panel-resizer" onMouseDown={handleResizeStart('mid')} />
            </>
          )}

          {/* 右侧预览面板 */}
          <div className="app-preview" style={{ flex: 1, minWidth: MIN_PREVIEW, overflow: 'hidden', background: 'var(--bg-panel)' }}>
            <PreviewPanel onDataChange={loadData} />
          </div>
        </div>
      </div>
    </DragDropOverlay>
  );
}
