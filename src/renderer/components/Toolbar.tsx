/**
 * 顶部工具栏
 * 全局搜索框 + 导入/新建/视图切换
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Input, Button, Space, Dropdown, Modal, Radio, message, Tooltip, Switch, Tabs } from 'antd';
import {
  SearchOutlined, ImportOutlined,
  AppstoreOutlined, UnorderedListOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined,
  CloseOutlined, HistoryOutlined, FileAddOutlined,
  SunOutlined, MoonOutlined, LinkOutlined, FolderOpenOutlined,
} from '@ant-design/icons';
import { useStore } from '../store';

const { Search } = Input;

interface Props {
  onDataChange: () => Promise<void>;
}

export function Toolbar({ onDataChange }: Props) {
  const {
    viewMode, setViewMode, sidebarCollapsed, setSidebarCollapsed,
    searchQuery, setSearchQuery, setSearchResults,
    searchHistory, clearSearchHistory, addSearchHistory,
    setSelectedCategoryId, setSelectedTagId, setStarredFilter,
    selectedCategoryId, categories, darkMode, toggleDarkMode,
    newFileModalOpen, setNewFileModalOpen,
    autoStartEnabled, setAutoStartEnabled, setKbConfig, resetKnowledgeBaseView,
  } = useStore();
  const [searching, setSearching] = useState(false);
  const searchRequest = useRef(0);

  // 新建文件弹窗
  const [newFileTitle, setNewFileTitle] = useState('');
  const [newFileType, setNewFileType] = useState<'txt' | 'md'>('md');
  const [creating, setCreating] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  // URL 导入弹窗
  const [urlModalOpen, setUrlModalOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlDetectedTitle, setUrlDetectedTitle] = useState('');
  const [urlCustomTitle, setUrlCustomTitle] = useState('');
  const [urlDetecting, setUrlDetecting] = useState(false);
  const [urlImporting, setUrlImporting] = useState(false);
  const [switchingKb, setSwitchingKb] = useState(false);

  // Vim ? 触发关于弹窗
  useEffect(() => {
    const handler = () => setAboutOpen(true);
    window.addEventListener('vim:about' as any, handler);
    return () => window.removeEventListener('vim:about' as any, handler);
  }, []);

  // 执行搜索
  const handleSearch = useCallback(async (value: string) => {
    const q = value.trim();
    const request = ++searchRequest.current;
    if (!q) { setSearchQuery(''); setSearchResults(null); return; }
    setSearching(true);
    addSearchHistory(q);
    setSelectedCategoryId(null);
    setSelectedTagId(null);
    setStarredFilter(false);
    setSearchQuery(q);
    try {
      const results = await window.electronAPI.searchQuery(q);
      if (request === searchRequest.current) setSearchResults(results);
    } catch (err) { if (request === searchRequest.current) message.error('搜索失败'); console.error('Search failed:', err); }
    finally { if (request === searchRequest.current) setSearching(false); }
  }, []);

  // 导入文件
  const handleImport = useCallback(async () => {
    const paths = await window.electronAPI.dialogOpenFiles();
    if (paths.length > 0) {
      try { await window.electronAPI.importFiles(paths); }
      catch (err: any) { message.error('导入失败：' + err.message); }
    }
  }, []);

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

  // URL 检测
  const handleUrlDetect = useCallback(async () => {
    const u = urlInput.trim();
    if (!u) return;
    setUrlDetecting(true);
    try {
      const result = await window.electronAPI.importUrlDetect(u);
      if (result.error) { message.error('无法访问该链接: ' + result.error); }
      else {
        setUrlDetectedTitle(result.title);
        setUrlCustomTitle(result.title);
      }
    } catch (err: any) { message.error('检测失败: ' + err.message); }
    finally { setUrlDetecting(false); }
  }, [urlInput]);

  // URL 导入
  const handleUrlImport = useCallback(async () => {
    const u = urlInput.trim();
    if (!u) return;
    setUrlImporting(true);
    try {
      const result = await window.electronAPI.importUrl(u, urlCustomTitle || urlDetectedTitle || undefined);
      if (result.success) {
        message.success(`已导入：${result.item.title}`);
        setUrlModalOpen(false);
        setUrlInput('');
        setUrlDetectedTitle('');
        setUrlCustomTitle('');
      } else {
        message.error('导入失败: ' + (result.error || '未知错误'));
      }
    } catch (err: any) { message.error('导入失败: ' + err.message); }
    finally { setUrlImporting(false); }
  }, [urlInput, urlCustomTitle, urlDetectedTitle]);

  // 切换知识库
  const handleSwitchKb = useCallback(async () => {
    const folderPath = await window.electronAPI.dialogOpenFolder();
    if (!folderPath) return;
    setSwitchingKb(true);
    try {
      searchRequest.current++;
      setSearching(false);
      const config = await window.electronAPI.kbInit(folderPath);
      resetKnowledgeBaseView();
      setKbConfig(config);
      await onDataChange();
      message.success(`已切换到 ${config.name}`);
    } catch (err: any) { message.error('切换知识库失败：' + err.message); }
    finally { setSwitchingKb(false); }
  }, [onDataChange, resetKnowledgeBaseView, setKbConfig]);

  return (
    <div className="app-toolbar">
      <button type="button" className="brand" onClick={() => setAboutOpen(true)} aria-label="关于织识">
        <span className="brand-name">织识</span>
        <span className="brand-caption">WEAVERN</span>
      </button>
      <span className="toolbar-divider" aria-hidden="true" />
      <Tooltip title={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}>
        <Button type="text" aria-label={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
          icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)} />
      </Tooltip>
      <Tooltip title="切换知识库文件夹">
        <Button type="text" aria-label="切换知识库文件夹" icon={<FolderOpenOutlined />} onClick={handleSwitchKb} loading={switchingKb} />
      </Tooltip>

      <div className="toolbar-search">
        <Search placeholder="搜索知识库中的内容" allowClear
          value={searchQuery}
          onChange={(e) => { searchRequest.current++; setSearching(false); setSearchQuery(e.target.value); setSearchResults(null); }}
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

      <Space className="toolbar-actions">
        <Dropdown menu={{ items: [
          { key: 'file', label: '导入文件', icon: <ImportOutlined />, onClick: handleImport },
          { key: 'url', label: '导入网页', icon: <LinkOutlined />, onClick: () => setUrlModalOpen(true) },
        ] }} trigger={['click']}>
          <Button aria-label="导入内容" icon={<ImportOutlined />}><span className="toolbar-action-label">导入</span></Button>
        </Dropdown>
        <Button className="toolbar-create" type="primary" aria-label="新建文件" icon={<FileAddOutlined />} onClick={() => setNewFileModalOpen(true)}><span className="toolbar-action-label">新建</span></Button>

        <Tooltip title={darkMode ? '浅色模式' : '暗色模式'}>
          <Button type="text" aria-label={darkMode ? '浅色模式' : '暗色模式'} icon={darkMode ? <SunOutlined /> : <MoonOutlined />} onClick={toggleDarkMode} />
        </Tooltip>

        <Button.Group>
          <Button aria-label="卡片视图" icon={<AppstoreOutlined />}
            type={viewMode === 'card' ? 'primary' : 'default'}
            onClick={() => setViewMode('card')} />
          <Button aria-label="列表视图" icon={<UnorderedListOutlined />}
            type={viewMode === 'list' ? 'primary' : 'default'}
            onClick={() => setViewMode('list')} />
        </Button.Group>
      </Space>

      {/* URL 导入弹窗 */}
      <Modal title="导入网页" open={urlModalOpen}
        onOk={handleUrlImport} onCancel={() => {
          setUrlModalOpen(false); setUrlInput(''); setUrlDetectedTitle(''); setUrlCustomTitle('');
        }}
        okText="导入" cancelText="取消"
        confirmLoading={urlImporting}
        okButtonProps={{ disabled: !urlInput.trim() || !urlDetectedTitle && !urlCustomTitle }}
      >
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>网页链接</label>
          <Input.Search placeholder="https://..." value={urlInput}
            onChange={(e) => { setUrlInput(e.target.value); setUrlDetectedTitle(''); setUrlCustomTitle(''); }}
            onSearch={handleUrlDetect} enterButton="检测" loading={urlDetecting}
            onPressEnter={handleUrlDetect}
            autoFocus />
        </div>
        {urlDetectedTitle && (
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>条目名称</label>
            <Input placeholder="输入名称..." value={urlCustomTitle}
              onChange={(e) => setUrlCustomTitle(e.target.value)}
              onPressEnter={handleUrlImport} />
          </div>
        )}
      </Modal>

      {/* 帮助弹窗 */}
      <Modal title={null} open={aboutOpen} onCancel={() => setAboutOpen(false)}
        footer={null} width={560} centered
      >
        <Tabs
          defaultActiveKey="keys"
          tabBarStyle={{ marginBottom: 12 }}
          items={[
            {
              key: 'keys',
              label: '键盘快捷键',
              children: <KeybindingReference />,
            },
            {
              key: 'about',
              label: '关于',
              children: (
                <div style={{ textAlign: 'center', padding: '8px 0' }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>Weavern</div>
                  <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, color: 'var(--brand)' }}>织识</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 2, maxWidth: 320, margin: '0 auto' }}>
                    编织知识，织网识海<br />
                    纯本地的多模态知识库管理工具。<br />
                    拖入文件即收纳，选中文字即笔记。<br />
                    无需网络，数据自持，永远属于你。
                  </div>
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-light)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ fontSize: 13 }}>开机自启动</span>
                      <Switch size="small" checked={autoStartEnabled}
                        onChange={async (v) => {
                          try {
                            const applied = await window.electronAPI.appSetAutoStart(v);
                            setAutoStartEnabled(applied);
                            if (applied !== v) message.info('当前系统不支持此开机自启设置');
                          }
                          catch { message.error('开机自启设置失败'); }
                        }} />
                    </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      v1.2.0 · Electron + React + TypeScript<br />
                      MIT License
                    </div>
                  </div>
                </div>
              ),
            },
          ]}
        />
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

// ========== 键位参考（帮助弹窗） ==========

const KBD: React.FC<{ keys: string }> = ({ keys }) => (
  <span style={{
    display: 'inline-block', padding: '1px 7px',
    background: '#f3f4f6', border: '1px solid #d1d5db',
    borderRadius: 4, fontFamily: 'Consolas, "Fira Code", monospace',
    fontSize: 12, fontWeight: 600, lineHeight: '20px',
    whiteSpace: 'nowrap',
  }}>{keys}</span>
);

interface RowProps { keys: string; desc: string; keys2?: string; desc2?: string; }

const KeyRow: React.FC<RowProps> = ({ keys, desc, keys2, desc2 }) => (
  <tr>
    <td style={{ whiteSpace: 'nowrap', paddingRight: 16, paddingBottom: 6 }}><KBD keys={keys} /></td>
    <td style={{ paddingRight: 24, paddingBottom: 6, fontSize: 13 }}>{desc}</td>
    {keys2 && <td style={{ whiteSpace: 'nowrap', paddingRight: 16, paddingBottom: 6 }}><KBD keys={keys2} /></td>}
    {desc2 && <td style={{ paddingBottom: 6, fontSize: 13 }}>{desc2}</td>}
  </tr>
);

function KeybindingReference() {
  return (
    <div style={{ fontSize: 13, lineHeight: 1.8 }}>
      <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f0fdf4', borderRadius: 6, fontSize: 12 }}>
        <strong>Normal</strong> 模式（顶部栏显示 <span style={{ color: '#10b981', fontWeight: 700 }}>N</span>）下所有键位生效。
        输入框聚焦时自动进入 <strong>Insert</strong> 模式（显示 <span style={{ color: '#3b82f6', fontWeight: 700 }}>I</span>），按 <KBD keys="Esc" /> 返回 Normal。
      </div>

      <table style={{ width: '100%' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
            <th style={{ textAlign: 'left', paddingBottom: 8, fontSize: 12, color: '#9ca3af' }}>导航</th>
            <th style={{ textAlign: 'left', paddingBottom: 8, fontSize: 12, color: '#9ca3af' }}></th>
            <th style={{ textAlign: 'left', paddingBottom: 8, fontSize: 12, color: '#9ca3af' }}>操作</th>
            <th style={{ textAlign: 'left', paddingBottom: 8, fontSize: 12, color: '#9ca3af' }}></th>
          </tr>
        </thead>
        <tbody>
          <KeyRow keys="h" desc="聚焦左侧面板" keys2="i" desc2="进入编辑" />
          <KeyRow keys="l" desc="聚焦右侧面板" keys2="s" desc2="保存 (编辑模式)" />
          <KeyRow keys="j" desc="下一项 / 下滚" keys2="Space" desc2="切换星标" />
          <KeyRow keys="k" desc="上一项 / 上滚" keys2="r" desc2="重命名" />
          <KeyRow keys="g g" desc="跳到第一个" keys2="d d" desc2="删除当前项" />
          <KeyRow keys="G" desc="跳到最后一个" keys2="c" desc2="新建文件" />
          <KeyRow keys="Enter" desc="确认 / 进入" keys2="a" desc2="新建分类或标签" />
          <KeyRow keys="Ctrl+d/u" desc="翻半页 (预览区)" keys2="Ctrl+o" desc2="导入文件" />
        </tbody>
      </table>

      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e5e7eb' }}>
        <table style={{ width: '100%' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              <th style={{ textAlign: 'left', paddingBottom: 8, fontSize: 12, color: '#9ca3af' }}>模式/全局</th>
              <th style={{ textAlign: 'left', paddingBottom: 8, fontSize: 12, color: '#9ca3af' }}></th>
              <th style={{ textAlign: 'left', paddingBottom: 8, fontSize: 12, color: '#9ca3af' }}>搜索</th>
              <th style={{ textAlign: 'left', paddingBottom: 8, fontSize: 12, color: '#9ca3af' }}></th>
            </tr>
          </thead>
          <tbody>
            <KeyRow keys="f" desc="阅读模式" keys2="/" desc2="聚焦搜索框" />
            <KeyRow keys="t" desc="暗色模式" keys2="n" desc2="下一个搜索结果" />
            <KeyRow keys="m" desc="折叠侧栏" keys2="N" desc2="上一个搜索结果" />
            <KeyRow keys="v" desc="批量模式" keys2="+/-" desc2="增大/缩小字号" />
            <KeyRow keys="V" desc="全选+批量模式" keys2="?" desc2="打开此帮助" />
            <KeyRow keys="Esc" desc="取消 / 退出 / 清除搜索" keys2="" desc2="" />
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, padding: '8px 12px', background: '#f9fafb', borderRadius: 6, fontSize: 11, color: '#9ca3af', lineHeight: 1.8 }}>
        熟练之后，手不离主键盘即可完成导入、分类、编辑、高亮、搜索全部操作。
        顶部栏右侧实时显示当前模式 (<span style={{ color: '#10b981' }}>N</span>/<span style={{ color: '#3b82f6' }}>I</span>) 和聚焦面板 (SIDEBAR/LIST/PREVIEW)。
      </div>
    </div>
  );
}
