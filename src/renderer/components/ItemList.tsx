/**
 * 中间条目列表 — 支持排序、批量操作
 */
import React, { useMemo, useCallback, useState } from 'react';
import { Card, Empty, Tag as AntTag, Typography, Dropdown, Button, Tooltip, Checkbox, Select, Space, message, Modal } from 'antd';
import {
  FileTextOutlined, FileImageOutlined, VideoCameraOutlined,
  FilePdfOutlined, FileOutlined, MoreOutlined,
  DeleteOutlined, ExclamationCircleOutlined,
  FolderOpenOutlined, TagOutlined, StarFilled, StarOutlined,
  CheckSquareOutlined, CloseSquareOutlined,
} from '@ant-design/icons';
import { useStore } from '../store';
import type { Item, ItemSort } from '../../shared/types';

const { Text, Paragraph } = Typography;

interface Props { onDataChange: () => void; }

const FILE_ICONS: Record<string, React.ReactNode> = {
  txt: <FileTextOutlined style={{ color: 'var(--text-secondary)' }} />,
  md: <FileTextOutlined style={{ color: '#3b82f6' }} />,
  html: <FileTextOutlined style={{ color: '#f59e0b' }} />,
  docx: <FileTextOutlined style={{ color: '#2563eb' }} />,
  pdf: <FilePdfOutlined style={{ color: '#ef4444' }} />,
  jpg: <FileImageOutlined style={{ color: '#10b981' }} />,
  png: <FileImageOutlined style={{ color: '#10b981' }} />,
  gif: <FileImageOutlined style={{ color: '#8b5cf6' }} />,
  webp: <FileImageOutlined style={{ color: '#10b981' }} />,
  bmp: <FileImageOutlined style={{ color: '#10b981' }} />,
  svg: <FileImageOutlined style={{ color: '#10b981' }} />,
  mp4: <VideoCameraOutlined style={{ color: '#f97316' }} />,
  mov: <VideoCameraOutlined style={{ color: '#f97316' }} />,
  mkv: <VideoCameraOutlined style={{ color: '#f97316' }} />,
  webm: <VideoCameraOutlined style={{ color: '#f97316' }} />,
};

function fmtSize(b: number) { return b < 1024 ? `${b}B` : b < 1048576 ? `${(b/1024).toFixed(1)}KB` : `${(b/1048576).toFixed(1)}MB`; }
function fmtDate(s: string) { return new Date(s).toLocaleDateString('zh-CN', { month:'short', day:'numeric' }); }

function sortItems(items: Item[], sort: ItemSort): Item[] {
  const copy = [...items];
  switch (sort) {
    case 'manual': return copy.sort((a,b) => a.sort_order - b.sort_order);
    case 'name': return copy.sort((a,b) => a.title.localeCompare(b.title, 'zh'));
    case 'date': return copy.sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    case 'size': return copy.sort((a,b) => b.size - a.size);
    case 'type': return copy.sort((a,b) => a.file_type.localeCompare(b.file_type));
    default: return copy; // 'updated' — already sorted
  }
}

export function ItemList({ onDataChange }: Props) {
  const {
    items: allItems, selectedItemId, setSelectedItemId,
    selectedCategoryId, selectedTagId,
    searchResults, searchQuery,
    tags, categories,
    viewMode, itemSort, setItemSort,
    batchMode, toggleBatchMode, selectedItemIds, toggleItemSelection,
    selectAllItems, clearSelection,
    starredFilter,
  } = useStore();

  // 拖拽排序状态
  const [dragSrc, setDragSrc] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  // 本地排序覆盖（用户拖拽后）
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const [tagItems, setTagItems] = useState<Item[] | null>(null);

  // 计算显示条目
  const displayItems = useMemo(() => {
    let list: Item[];
    if (searchResults !== null) { list = searchResults.map(r => r.item); }
    else if (selectedTagId) { list = tagItems ?? []; }
    else if (selectedCategoryId) { list = allItems.filter(i => i.category_id === selectedCategoryId); }
    else { list = allItems; }

    if (starredFilter) { list = list.filter(i => (i as any).is_starred); }
    return sortItems(list, itemSort);
  }, [allItems, tagItems, searchResults, selectedCategoryId, selectedTagId, itemSort, starredFilter]);

  // 标签筛选
  React.useEffect(() => {
    let active = true;
    setTagItems(null);
    if (selectedTagId) window.electronAPI.searchByTag(selectedTagId)
      .then(items => { if (active) setTagItems(items); })
      .catch(() => { if (active) { setTagItems([]); message.error('标签筛选失败'); } });
    return () => { active = false; };
  }, [selectedTagId, allItems]);

  // ========== 操作 ==========

  const handleDeleteItem = useCallback((item: Item) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除"${item.title}"吗？此操作不可撤销。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        await window.electronAPI.itemDelete(item.id);
        if (selectedItemId === item.id) setSelectedItemId(null);
        onDataChange();
      },
    });
  }, [selectedItemId, onDataChange]);

  const handleMoveToCategory = useCallback(async (item: Item, catId: string | null) => {
    await window.electronAPI.itemUpdate(item.id, { category_id: catId });
    onDataChange();
  }, [onDataChange]);

  // ========== 拖拽排序 ==========

  const handleDragStart = useCallback((itemId: string) => (e: React.DragEvent) => {
    setDragSrc(itemId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', itemId);
  }, []);

  const handleDragOver = useCallback((itemId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragSrc !== itemId) setDragOver(itemId);
  }, [dragSrc]);

  const handleDragLeave = useCallback(() => {
    setDragOver(null);
  }, []);

  const handleDrop = useCallback((targetId: string) => async (e: React.DragEvent) => {
    e.preventDefault();
    const srcId = e.dataTransfer.getData('text/plain');
    if (!srcId || srcId === targetId) { setDragSrc(null); setDragOver(null); return; }

    const current = localOrder || displayItems.map(i => i.id);
    const srcIdx = current.indexOf(srcId);
    const dstIdx = current.indexOf(targetId);
    if (srcIdx < 0 || dstIdx < 0) { setDragSrc(null); setDragOver(null); return; }

    const next = [...current];
    next.splice(srcIdx, 1);
    next.splice(dstIdx, 0, srcId);
    setLocalOrder(next);
    setDragSrc(null);
    setDragOver(null);
    try {
      await window.electronAPI.itemReorder(next);
      setItemSort('manual');
      await onDataChange();
      setLocalOrder(null);
    } catch (error) { setLocalOrder(null); message.error('排序保存失败'); }
  }, [displayItems, localOrder, setItemSort, onDataChange]);

  const handleDragEnd = useCallback(() => {
    setDragSrc(null);
    setDragOver(null);
  }, []);

  // 当 displayItems 变化（切换分类等）时重置本地排序
  React.useEffect(() => { setLocalOrder(null); }, [displayItems.length, selectedCategoryId, selectedTagId, searchResults]);

  // 按本地排序调整显示顺序
  const orderedItems = useMemo(() => {
    if (!localOrder) return displayItems;
    const orderMap = new Map(localOrder.map((id, i) => [id, i]));
    return [...displayItems].sort((a, b) => (orderMap.get(a.id) ?? 9999) - (orderMap.get(b.id) ?? 9999));
  }, [displayItems, localOrder]);

  // ========== 批量操作 ==========

  const handleBatchDelete = useCallback(() => {
    const ids = [...selectedItemIds];
    if (!ids.length) return;
    Modal.confirm({
      title: '批量删除',
      content: `确定要删除选中的 ${ids.length} 个条目吗？此操作不可撤销。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        await window.electronAPI.itemBatchDelete(ids);
        clearSelection();
        toggleBatchMode();
        onDataChange();
      },
    });
  }, [selectedItemIds, onDataChange]);

  // 批量打标签
  const handleBatchTag = useCallback(async (tagId: string) => {
    await window.electronAPI.itemBatchTag([...selectedItemIds], tagId);
    message.success('已添加标签');
  }, [selectedItemIds]);

  // 批量移动分类
  const handleBatchCategorize = useCallback(async (catId: string | null) => {
    await window.electronAPI.itemBatchCategorize([...selectedItemIds], catId);
    clearSelection();
    toggleBatchMode();
    onDataChange();
  }, [selectedItemIds, onDataChange]);

  // ========== 标题 ==========

  const titleText = searchResults !== null ? '搜索结果'
    : selectedTagId ? '标签条目'
    : starredFilter ? '星标条目'
    : selectedCategoryId ? categories.find(c => c.id === selectedCategoryId)?.name || '分类条目'
    : '全部条目';

  return (
    <div className="item-list" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* 标题栏 */}
      <div className="list-header" style={{
        padding: '18px 18px 16px', borderBottom: '1px solid var(--border-light)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
      }}>
        <div className="list-title"><span>CONTENTS · {String(displayItems.length).padStart(2, '0')}</span><strong title={titleText}>{titleText}</strong></div>
        <Space size={4}>
          <Select size="small" value={itemSort} onChange={(v: ItemSort) => setItemSort(v)}
            style={{ width: 80 }} options={[
              { value: 'updated', label: '最近' },
              { value: 'manual', label: '自定义' },
              { value: 'name', label: '名称' },
              { value: 'date', label: '日期' },
              { value: 'size', label: '大小' },
              { value: 'type', label: '类型' },
            ]} />
          <Tooltip title="批量模式">
            <Button type="text" size="small"
              icon={batchMode ? <CloseSquareOutlined /> : <CheckSquareOutlined />}
              onClick={toggleBatchMode} />
          </Tooltip>
        </Space>
      </div>

      {/* 批量工具栏 */}
      {batchMode && displayItems.length > 0 && (
        <div style={{ padding: '4px 12px', background: 'var(--accent-light)', borderBottom: '1px solid var(--border-normal)',
          display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button size="small" onClick={() => selectAllItems(displayItems.map(item => item.id))}>全选</Button>
          <Text type="secondary" style={{ fontSize: 12 }}>已选 {selectedItemIds.size}</Text>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={handleBatchDelete}>删除</Button>
          <Select size="small" placeholder="移动分类" style={{ width: 100 }} allowClear
            onChange={(v) => handleBatchCategorize(v || null)}
            options={useStore.getState().categories.map(c => ({ value: c.id, label: c.name }))}
          />
          <Select size="small" placeholder="添加标签" style={{ width: 100 }}
            onChange={(v) => v && handleBatchTag(v)}
            options={tags.map(t => ({ value: t.id, label: t.name }))}
          />
        </div>
      )}

      {/* 条目列表 */}
      <div className="item-scroll" style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {orderedItems.length === 0 ? (
          <Empty description="暂无条目" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 60 }} />
        ) : viewMode === 'card' ? (
          orderedItems.map(item => {
            const isSel = selectedItemId === item.id;
            const isChecked = selectedItemIds.has(item.id);
            const starred = (item as any).is_starred;
            return (
              <Card key={item.id} size="small" hoverable
                className={`draggable-item item-card${isSel ? ' selected' : ''}${dragOver === item.id ? ' drag-over' : ''}${dragSrc === item.id ? ' dragging' : ''}`}
                draggable={!batchMode}
                onDragStart={batchMode ? undefined : handleDragStart(item.id)}
                onDragOver={batchMode ? undefined : handleDragOver(item.id)}
                onDragLeave={batchMode ? undefined : handleDragLeave}
                onDrop={batchMode ? undefined : handleDrop(item.id)}
                onDragEnd={batchMode ? undefined : handleDragEnd}
                style={{ marginBottom: 8, background: isSel ? 'var(--bg-selected)' : 'var(--bg-card)' }}
                onClick={() => batchMode ? toggleItemSelection(item.id) : setSelectedItemId(item.id)}
                bodyStyle={{ padding: 10 }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  {batchMode && <Checkbox checked={isChecked} style={{ marginTop: 2 }} />}
                  <div style={{ fontSize: 18 }}>{FILE_ICONS[item.file_type] || <FileOutlined />}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text strong ellipsis style={{ minWidth: 0, maxWidth: 'calc(100% - 32px)' }}>{Boolean(starred) && <StarFilled className="item-star" />}{starred ? ' ' : ''}{item.title}</Text>
                      {!batchMode && (
                        <Dropdown menu={{ items: [
                          { key: 'move', label: '移动到分类', icon: <FolderOpenOutlined />, children: [
                            { key: 'uncategorized', label: '未分类', onClick: () => handleMoveToCategory(item, null) },
                            ...categories.map(cat => ({ key: cat.id, label: cat.name, onClick: () => handleMoveToCategory(item, cat.id) })),
                          ] },
                          { type: 'divider' },
                          { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true, onClick: () => handleDeleteItem(item) },
                        ]}} trigger={['click']}>
                          <Button type="text" size="small" aria-label={`更多操作：${item.title}`} icon={<MoreOutlined />} onClick={e => e.stopPropagation()} />
                        </Dropdown>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                      <AntTag style={{ fontSize: 10, lineHeight: '18px', padding: '0 4px', margin: 0 }}>{item.file_type.toUpperCase()}</AntTag>
                      <Text type="secondary" style={{ fontSize: 11 }}>{fmtSize(item.size)}</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>{fmtDate(item.created_at)}</Text>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        ) : (
          <div className="item-rows">
            {orderedItems.map(item => {
              const isSel = selectedItemId === item.id;
              const isChecked = selectedItemIds.has(item.id);
              const starred = (item as any).is_starred;
              return (
                <div key={item.id}
                  className={`draggable-item item-row${isSel ? ' selected' : ''}${dragOver === item.id ? ' drag-over' : ''}${dragSrc === item.id ? ' dragging' : ''}`}
                  draggable={!batchMode}
                  onDragStart={batchMode ? undefined : handleDragStart(item.id)}
                  onDragOver={batchMode ? undefined : handleDragOver(item.id)}
                  onDragLeave={batchMode ? undefined : handleDragLeave}
                  onDrop={batchMode ? undefined : handleDrop(item.id)}
                  onDragEnd={batchMode ? undefined : handleDragEnd}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
                    cursor: batchMode ? 'pointer' : 'grab', borderBottom: '1px solid var(--border-divider)',
                    background: isSel ? 'var(--bg-selected)' : 'transparent',
                  }}
                  onClick={() => batchMode ? toggleItemSelection(item.id) : setSelectedItemId(item.id)}
                >
                  {batchMode && <Checkbox checked={isChecked} />}
                  <span style={{ fontSize: 16 }}>{FILE_ICONS[item.file_type] || <FileOutlined />}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text ellipsis>{Boolean(starred) && <StarFilled className="item-star" />}{starred ? ' ' : ''}{item.title}</Text>
                    <div><Text type="secondary" style={{ fontSize: 11 }}>{item.file_type} · {fmtSize(item.size)}</Text></div>
                  </div>
                  <Text type="secondary" style={{ fontSize: 11 }}>{fmtDate(item.created_at)}</Text>
                  {!batchMode && (
                    <Dropdown menu={{ items: [
                      { key: 'move', label: '移动到分类', icon: <FolderOpenOutlined />, children: [
                        { key: 'uncategorized', label: '未分类', onClick: () => handleMoveToCategory(item, null) },
                        ...categories.map(cat => ({ key: cat.id, label: cat.name, onClick: () => handleMoveToCategory(item, cat.id) })),
                      ] },
                      { type: 'divider' },
                      { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true, onClick: () => handleDeleteItem(item) },
                    ] }} trigger={['click']}>
                      <Button type="text" size="small" aria-label={`更多操作：${item.title}`} icon={<MoreOutlined />} onClick={e => e.stopPropagation()} />
                    </Dropdown>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
