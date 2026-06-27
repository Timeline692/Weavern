/**
 * 应用根组件 — 可拖拽调整宽度的三栏布局
 */
import React, { useEffect, useCallback, useState, useRef } from 'react';
import { Result, Button, Spin, Modal } from 'antd';
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

export default function App() {
  const { kbReady, kbConfig, setKbConfig, setKbReady, setCategories, setItems, setTags,
    sidebarCollapsed, readingMode, globalLoading, setGlobalLoading,
    setAutoStartEnabled } = useStore();
  const [initError, setInitError] = useState<string | null>(null);
  const [hasExistingConfig, setHasExistingConfig] = useState(false);

  // 面板宽度
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT);
  const [midWidth, setMidWidth] = useState(DEFAULT_MID);
  const dragging = useRef<'left' | 'mid' | null>(null);
  const startX = useRef(0);
  const startW = useRef(0);

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
        setLeftWidth(Math.min(MAX_LEFT, Math.max(MIN_PANEL, startW.current + delta)));
      } else {
        setMidWidth(Math.min(MAX_MID, Math.max(MIN_PANEL, startW.current + delta)));
      }
    };
    const onUp = () => {
      dragging.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // 启动时检测是否有已有知识库（不自动加载）
  useEffect(() => {
    (async () => {
      try {
        const config = await window.electronAPI.kbGetConfig();
        if (config) {
          setHasExistingConfig(true);
          setKbConfig(config);
        }
      } catch (err) { console.error('Failed to load config:', err); }
    })();
  }, []);

  // 进入已有知识库
  const handleEnterKb = useCallback(async () => {
    try {
      const config = await window.electronAPI.kbGetConfig();
      if (config) {
        setKbConfig(config);
        setKbReady(true);
        await loadData();
      }
    } catch (err: any) { setInitError(err.message || '无法加载知识库'); }
  }, []);

  const handleInitKb = useCallback(async () => {
    try {
      setGlobalLoading(true);
      const folderPath = await window.electronAPI.dialogOpenFolder();
      if (!folderPath) { setGlobalLoading(false); return; }
      const config = await window.electronAPI.kbInit(folderPath);
      setKbConfig(config);
      setKbReady(true);
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
      const enabled = await window.electronAPI.appGetAutoStart();
      setAutoStartEnabled(enabled);
    })();
  }, []);

  // 导入完成
  useEffect(() => {
    window.electronAPI.onImportComplete(async () => {
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
      if (e.ctrlKey && e.key === 's' && !isInput) {
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
              await window.electronAPI.itemDelete(state.selectedItemId);
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

  // 未初始化 — 欢迎屏幕
  if (!kbReady) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        {hasExistingConfig ? (
          /* 有已有知识库：显示进入按钮 + 小字重新选择 */
          <div style={{ textAlign: 'center' }}>
            <FolderOpenOutlined style={{ color: '#fff', fontSize: 72, display: 'block', marginBottom: 24 }} />
            <div style={{ color: '#fff', fontSize: 24, marginBottom: 8, fontWeight: 600 }}>织识</div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginBottom: 32 }}>
              知识库：{kbConfig?.name || ''}
            </div>
            <Button type="primary" size="large"
              onClick={handleEnterKb} loading={globalLoading}
              style={{ minWidth: 180, height: 44, fontSize: 16 }}>
              进入知识库
            </Button>
            <div style={{ marginTop: 20 }}>
              <Button type="link" size="small"
                onClick={handleInitKb}
                style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                重新选择知识库文件夹
              </Button>
            </div>
          </div>
        ) : (
          /* 首次使用：选择文件夹 */
          <Result icon={<FolderOpenOutlined style={{ color: '#fff', fontSize: 72 }} />}
            title={<span style={{ color: '#fff', fontSize: 24 }}>织识</span>}
            subTitle={<span style={{ color: 'rgba(255,255,255,0.8)' }}>选择一个文件夹作为知识库根目录</span>}
            extra={<Button type="primary" size="large" onClick={handleInitKb} loading={globalLoading}>选择知识库文件夹</Button>}
          />
        )}
      </div>
    );
  }

  return (
    <DragDropOverlay onImportComplete={loadData}>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-body)' }}>
        {/* 顶部工具栏 */}
        <div style={{
          height: 48, lineHeight: '48px', background: 'var(--bg-header)',
          borderBottom: '1px solid var(--border-light)', padding: '0 12px',
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
              <div style={{
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
              <div style={{
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
          <div style={{ flex: 1, overflow: 'hidden', background: 'var(--bg-panel)' }}>
            <PreviewPanel onDataChange={loadData} />
          </div>
        </div>
      </div>
    </DragDropOverlay>
  );
}
