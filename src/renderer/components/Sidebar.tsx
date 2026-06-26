/**
 * 左侧边栏
 * 包含分类树、标签云、专辑列表
 */
import React, { useState, useCallback } from 'react';
import { Tree, Tag as AntTag, Input, Button, Modal, Space, Tooltip, Collapse, List } from 'antd';
import {
  FolderOutlined, FolderOpenOutlined, TagOutlined,
  PlusOutlined, EditOutlined, DeleteOutlined,
  BookOutlined, ExclamationCircleOutlined, StarOutlined,
} from '@ant-design/icons';
import { useStore } from '../store';
import type { Category, Tag } from '../../shared/types';

interface Props {
  onDataChange: () => void;
}

export function Sidebar({ onDataChange }: Props) {
  const {
    categories, selectedCategoryId, setSelectedCategoryId,
    tags, selectedTagId, setSelectedTagId,
    starredFilter, setStarredFilter,
  } = useStore();

  const [newCatName, setNewCatName] = useState('');
  const [addingCat, setAddingCat] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [addingTag, setAddingTag] = useState(false);

  // ========== 分类操作 ==========

  const handleAddCategory = useCallback(async () => {
    if (!newCatName.trim()) return;
    try {
      await window.electronAPI.categoryCreate(newCatName.trim(), selectedCategoryId);
      setNewCatName('');
      setAddingCat(false);
      onDataChange();
    } catch (err) { console.error(err); }
  }, [newCatName, selectedCategoryId, onDataChange]);

  const handleRenameCategory = useCallback(async () => {
    if (!editingCat || !editingCat.name.trim()) return;
    try {
      await window.electronAPI.categoryRename(editingCat.id, editingCat.name.trim());
      setEditingCat(null);
      onDataChange();
    } catch (err) { console.error(err); }
  }, [editingCat, onDataChange]);

  const handleDeleteCategory = useCallback(async (cat: Category) => {
    Modal.confirm({
      title: '删除分类',
      icon: <ExclamationCircleOutlined />,
      content: `确定要删除"${cat.name}"吗？分类下的条目不会被删除，仅取消关联。`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        await window.electronAPI.categoryDelete(cat.id);
        if (selectedCategoryId === cat.id) setSelectedCategoryId(null);
        onDataChange();
      },
    });
  }, [selectedCategoryId, onDataChange]);

  // 构建分类树数据
  const buildTreeData = useCallback((cats: Category[], parentId: string | null = null): any[] => {
    return cats
      .filter(c => c.parent_id === parentId)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(c => ({
        key: c.id,
        title: (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}
            onDoubleClick={() => setEditingCat(c)}
          >
            <span>{c.name}</span>
            <span style={{ visibility: 'hidden' }} className="cat-actions">
              <Tooltip title="重命名"><EditOutlined style={{ fontSize: 12, marginRight: 4 }} onClick={(e) => { e.stopPropagation(); setEditingCat(c); }} /></Tooltip>
              <Tooltip title="删除"><DeleteOutlined style={{ fontSize: 12, color: '#ef4444' }} onClick={(e) => { e.stopPropagation(); handleDeleteCategory(c); }} /></Tooltip>
            </span>
          </div>
        ),
        icon: selectedCategoryId === c.id ? <FolderOpenOutlined /> : <FolderOutlined />,
        children: buildTreeData(cats, c.id),
        isLeaf: !cats.some(child => child.parent_id === c.id),
      }));
  }, [selectedCategoryId, handleDeleteCategory]);

  const treeData = [
    {
      key: '__all__',
      title: '全部条目',
      icon: <FolderOutlined />,
      isLeaf: true,
    },
    ...buildTreeData(categories),
  ];

  // ========== 标签操作 ==========

  const handleAddTag = useCallback(async () => {
    if (!newTagName.trim()) return;
    try {
      await window.electronAPI.tagCreate(newTagName.trim());
      setNewTagName('');
      setAddingTag(false);
      onDataChange();
    } catch (err) { console.error(err); }
  }, [newTagName, onDataChange]);

  const handleDeleteTag = useCallback(async (tag: Tag) => {
    await window.electronAPI.tagDelete(tag.id);
    if (selectedTagId === tag.id) setSelectedTagId(null);
    onDataChange();
  }, [selectedTagId, onDataChange]);

  // ========== 碰撞面板组件 ==========

  const panelItems = [
    {
      key: 'starred',
      label: '星标',
      children: (
        <div style={{
          padding: '6px 8px', cursor: 'pointer', borderRadius: 6,
          background: starredFilter ? '#fef3c7' : 'transparent',
          fontWeight: starredFilter ? 600 : 400,
        }} onClick={() => setStarredFilter(!starredFilter)}>
          <StarOutlined style={{ color: '#f59e0b', marginRight: 8 }} />
          {starredFilter ? '⭐ 星标条目 (已筛选)' : '星标条目'}
        </div>
      ),
      extra: <StarOutlined style={{ color: '#f59e0b' }} />,
    },
    {
      key: 'categories',
      label: '分类目录',
      children: (
        <div>
          <Tree
            treeData={treeData}
            selectedKeys={selectedCategoryId ? [selectedCategoryId] : ['__all__']}
            onSelect={(keys) => {
              const key = keys[0] as string;
              setSelectedCategoryId(key === '__all__' ? null : key);
            }}
            defaultExpandAll
            blockNode
            style={{ background: 'transparent' }}
          />
          {/* 添加分类 */}
          {addingCat ? (
            <div style={{ padding: '0 8px', marginTop: 4 }}>
              <Input
                size="small"
                placeholder="分类名称"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onPressEnter={handleAddCategory}
                onBlur={() => { if (!newCatName) setAddingCat(false); }}
                autoFocus
              />
            </div>
          ) : (
            <Button type="dashed" size="small" block icon={<PlusOutlined />}
              onClick={() => setAddingCat(true)} style={{ marginTop: 4 }}>
              新建分类
            </Button>
          )}
        </div>
      ),
      extra: <FolderOutlined />,
    },
    {
      key: 'tags',
      label: `标签 (${tags.length})`,
      children: (
        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 0' }}>
            {tags.map(tag => (
              <AntTag
                key={tag.id}
                color={selectedTagId === tag.id ? 'purple' : 'default'}
                style={{ cursor: 'pointer', margin: 0 }}
                closable
                onClose={(e) => { e.preventDefault(); handleDeleteTag(tag); }}
                onClick={() => setSelectedTagId(selectedTagId === tag.id ? null : tag.id)}
              >
                {tag.name}
              </AntTag>
            ))}
          </div>
          {addingTag ? (
            <div style={{ marginTop: 4 }}>
              <Input
                size="small"
                placeholder="标签名称"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onPressEnter={handleAddTag}
                onBlur={() => { if (!newTagName) setAddingTag(false); }}
                autoFocus
              />
            </div>
          ) : (
            <Button type="dashed" size="small" block icon={<PlusOutlined />}
              onClick={() => setAddingTag(true)}>
              新建标签
            </Button>
          )}
        </div>
      ),
      extra: <TagOutlined />,
    },
  ];

  // ========== 重命名分类弹窗 ==========

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
        <Collapse
          defaultActiveKey={['categories', 'tags']}
          ghost
          items={panelItems.map(p => ({
            key: p.key,
            label: (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{p.label}</span>
                <span style={{ color: 'var(--text-muted)' }}>{p.extra}</span>
              </div>
            ),
            children: p.children,
          }))}
        />
      </div>

      {/* 重命名分类弹窗 */}
      <Modal
        title="重命名分类"
        open={!!editingCat}
        onOk={handleRenameCategory}
        onCancel={() => setEditingCat(null)}
        okText="确认"
        cancelText="取消"
      >
        <Input
          value={editingCat?.name || ''}
          onChange={(e) => setEditingCat(prev => prev ? { ...prev, name: e.target.value } : null)}
          onPressEnter={handleRenameCategory}
          autoFocus
        />
      </Modal>
    </div>
  );
}
