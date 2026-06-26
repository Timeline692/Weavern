/**
 * 顶部工具栏
 * 全局搜索框 + 导入/新建/视图切换
 */
import React, { useState, useCallback } from 'react';
import { Input, Button, Space, Dropdown, Modal, Radio, message, Tooltip } from 'antd';
import {
  SearchOutlined, ImportOutlined, PlusOutlined,
  AppstoreOutlined, UnorderedListOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined,
  CloseOutlined, HistoryOutlined, FileAddOutlined,
  SunOutlined, MoonOutlined,
} from '@ant-design/icons';
import { useStore } from '../store';

const { Search } = Input;

interface Props {
  onDataChange: () => void;
}

export function Toolbar({ onDataChange }: Props) {
  const {
    viewMode, setViewMode, sidebarCollapsed, setSidebarCollapsed,
    searchQuery, setSearchQuery, setSearchResults,
    searchHistory, clearSearchHistory, addSearchHistory,
    setSelectedCategoryId, setSelectedTagId,
    selectedCategoryId, categories, darkMode, toggleDarkMode,
    newFileModalOpen, setNewFileModalOpen,
  } = useStore();
  const [searching, setSearching] = useState(false);

  // 新建文件弹窗
  const [newFileTitle, setNewFileTitle] = useState('');
  const [newFileType, setNewFileType] = useState<'txt' | 'md'>('md');
  const [creating, setCreating] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  // 执行搜索
  const handleSearch = useCallback(async (value: string) => {
    const q = value.trim();
    setSearchQuery(q);
    if (!q) { setSearchResults(null); return; }
    setSearching(true);
    addSearchHistory(q);
    setSelectedCategoryId(null);
    setSelectedTagId(null);
    try {
      const results = await window.electronAPI.searchQuery(q);
      setSearchResults(results);
    } catch (err) { console.error('Search failed:', err); }
    finally { setSearching(false); }
  }, []);

  // 导入文件
  const handleImport = useCallback(async () => {
    const paths = await window.electronAPI.dialogOpenFiles();
    if (paths.length > 0) {
      await window.electronAPI.importFiles(paths);
      onDataChange();
    }
  }, [onDataChange]);

  // 新建文件
  const handleCreateFile = useCallback(async () => {
    if (!newFileTitle.trim()) return;
    setCreating(true);
    try {
      const item = await window.electronAPI.itemCreateFile(
        newFileTitle.trim(),
        newFileType,
        '',
        selectedCategoryId
      );
      message.success(`已创建：${item.title}`);
      setNewFileModalOpen(false);
      setNewFileTitle('');
      onDataChange();
    } catch (err: any) {
      message.error('创建失败: ' + err.message);
    } finally {
      setCreating(false);
    }
  }, [newFileTitle, newFileType, selectedCategoryId, onDataChange]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 12 }}>
      <Button type="text"
        icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <span onClick={() => setAboutOpen(true)}
        style={{ fontWeight: 700, fontSize: 16, whiteSpace: 'nowrap', marginRight: 8, cursor: 'pointer', userSelect: 'none' }}>
        🧶 织识
      </span>

      <div style={{ flex: 1, maxWidth: 480 }}>
        <Search placeholder="全文搜索..." allowClear
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); if (!e.target.value) setSearchResults(null); }}
          onSearch={handleSearch} loading={searching}
          prefix={<SearchOutlined style={{ color: 'var(--text-muted)' }} />}
          suffix={
            searchHistory.length > 0 && !searchQuery ? (
              <Dropdown menu={{
                items: [
                  ...searchHistory.map(h => ({ key: h, label: h, icon: <HistoryOutlined />, onClick: () => handleSearch(h) })),
                  { type: 'divider' as const },
                  { key: 'clear', label: '清除历史', icon: <CloseOutlined />, onClick: clearSearchHistory },
                ],
              }} trigger={['click']}>
                <HistoryOutlined style={{ color: 'var(--text-muted)', cursor: 'pointer' }} />
              </Dropdown>
            ) : null
          }
        />
      </div>

      <Space>
        <Button icon={<ImportOutlined />} onClick={handleImport}>导入文件</Button>
        <Button icon={<FileAddOutlined />} onClick={() => setNewFileModalOpen(true)}>新建文件</Button>

        <Tooltip title={darkMode ? '浅色模式' : '暗色模式'}>
          <Button type="text" icon={darkMode ? <SunOutlined /> : <MoonOutlined />} onClick={toggleDarkMode} />
        </Tooltip>

        <Button.Group>
          <Button icon={<AppstoreOutlined />}
            type={viewMode === 'card' ? 'primary' : 'default'}
            onClick={() => setViewMode('card')} />
          <Button icon={<UnorderedListOutlined />}
            type={viewMode === 'list' ? 'primary' : 'default'}
            onClick={() => setViewMode('list')} />
        </Button.Group>
      </Space>

      {/* 关于弹窗 */}
      <Modal title={null} open={aboutOpen} onCancel={() => setAboutOpen(false)}
        footer={null} width={420} centered
      >
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🧶</div>
          <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 4, color: '#6366f1' }}>织识</div>
          <div style={{ fontSize: 16, color: '#9ca3af', marginBottom: 20, fontStyle: 'italic' }}>Weavern</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 2, maxWidth: 320, margin: '0 auto' }}>
            织识——「编织知识，织网识海」<br />
            一款纯本地的多模态知识库管理工具。<br />
            拖入文件即收纳，选中文字即笔记。<br />
            无需网络，数据自持，永远属于你。
          </div>
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border-light)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              v1.0.0 · Electron + React + TypeScript<br />
              MIT License
            </div>
          </div>
        </div>
      </Modal>

      {/* 新建文件弹窗 */}
      <Modal title="新建文件" open={newFileModalOpen}
        onOk={handleCreateFile} onCancel={() => { setNewFileModalOpen(false); setNewFileTitle(''); }}
        okText="创建" cancelText="取消"
        confirmLoading={creating}
      >
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>标题</label>
          <Input placeholder="输入文件标题..." value={newFileTitle}
            onChange={(e) => setNewFileTitle(e.target.value)}
            onPressEnter={handleCreateFile} autoFocus />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>文件类型</label>
          <Radio.Group value={newFileType} onChange={(e) => setNewFileType(e.target.value)}>
            <Radio.Button value="md">Markdown (.md)</Radio.Button>
            <Radio.Button value="txt">纯文本 (.txt)</Radio.Button>
          </Radio.Group>
        </div>
      </Modal>
    </div>
  );
}
