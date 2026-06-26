/**
 * 右侧预览面板
 * 支持：文本选中高亮、悬浮笔记、编辑模式
 */
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Spin, Empty, Typography, Tag as AntTag, Button, Space, Input, Tooltip, Modal, message, Select } from 'antd';
import {
  EditOutlined, FullscreenOutlined, FullscreenExitOutlined,
  PlusOutlined, ClockCircleOutlined, EyeOutlined,
  FilePdfOutlined, HighlightOutlined, FormOutlined, SaveOutlined,
  CloseOutlined, FontSizeOutlined, ZoomInOutlined, ZoomOutOutlined,
  StarFilled, StarOutlined, DownloadOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import { useStore } from '../store';
import type { Annotation, FileContent } from '../../shared/types';
import { marked } from 'marked';

const { Text, Title } = Typography;

interface Props {
  onDataChange: () => void;
}

// ========== 辅助：在文本中定位高亮片段 ==========

interface HighlightRange {
  text: string;        // 被标注的原文
  contextBefore: string; // 前文（用于定位）
}

/** 解码 annotation 中的 target_selector 为定位信息 */
function parseSelector(selector: string): HighlightRange | null {
  if (!selector) return null;
  try {
    return JSON.parse(selector) as HighlightRange;
  } catch {
    // 旧格式：直接存了文本
    return selector ? { text: selector, contextBefore: '' } : null;
  }
}

/** 编码定位信息 */
function encodeSelector(text: string, fullContent: string, offset: number): string {
  const contextBefore = fullContent.substring(Math.max(0, offset - 40), offset);
  return JSON.stringify({ text, contextBefore });
}

/** 在全文内容中注入高亮 <mark> 标签 */
function injectHighlights(
  rawContent: string,
  annotations: Annotation[]
): { html: string; highlightMap: Map<string, Annotation> } {
  const highlightMap = new Map<string, Annotation>();
  if (annotations.length === 0) return { html: escapeHtml(rawContent), highlightMap };

  // 筛选高亮类型的标注，按文本长度降序排列（优先匹配长文本）
  const highlights = annotations
    .filter(a => a.type === 'highlight')
    .map(a => ({ ann: a, range: parseSelector(a.target_selector) }))
    .filter((h): h is { ann: Annotation; range: HighlightRange } => h.range !== null)
    .sort((a, b) => b.range.text.length - a.range.text.length);

  if (highlights.length === 0) return { html: escapeHtml(rawContent), highlightMap };

  // 用占位符标记，避免嵌套替换问题
  const replacements: Array<{ placeholder: string; html: string }> = [];
  let working = rawContent;

  for (const h of highlights) {
    // 优先用上下文定位
    let idx = -1;
    if (h.range.contextBefore) {
      const contextIdx = working.indexOf(h.range.contextBefore);
      if (contextIdx >= 0) {
        idx = working.indexOf(h.range.text, contextIdx + h.range.contextBefore.length);
      }
    }
    // fallback: 全文搜索
    if (idx < 0) {
      idx = working.indexOf(h.range.text);
    }
    if (idx >= 0) {
      const placeholder = `__HL_PLACEHOLDER_${replacements.length}__`;
      const noteCount = annotations.filter(a => a.type === 'note' && a.target_selector === h.ann.target_selector).length;
      const noteTitle = noteCount > 0 ? ` data-note="${noteCount}条笔记"` : '';
      const html = `<mark class="highlighted-text" data-ann-id="${h.ann.id}" title="${escapeAttr(h.ann.content || '已标注')}"${noteTitle}>${escapeHtml(h.range.text)}</mark>`;
      replacements.push({ placeholder, html });
      working = working.substring(0, idx) + placeholder + working.substring(idx + h.range.text.length);
    }
  }

  // 替换回 HTML
  let html = escapeHtml(working);
  for (const r of replacements) {
    html = html.replace(r.placeholder, r.html);
  }

  // 收集 highlightMap
  for (const h of highlights) {
    highlightMap.set(h.ann.id, h.ann);
  }

  return { html, highlightMap };
}

// ========== 主组件 ==========

export function PreviewPanel({ onDataChange }: Props) {
  const {
    items, selectedItemId, readingMode, setReadingMode,
    tags, annotations, setAnnotations,
  } = useStore();

  const [content, setContent] = useState<FileContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [itemTags, setItemTags] = useState<AntTag[]>([]);
  const [showTagEditor, setShowTagEditor] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [videoRef, setVideoRef] = useState<HTMLVideoElement | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // 编辑模式状态
  const [editMode, setEditMode] = useState(false);
  const [editingContent, setEditingContent] = useState('');
  const [saving, setSaving] = useState(false);

  // 选中文本弹窗状态
  const [selectionToolbar, setSelectionToolbar] = useState<{
    visible: boolean; x: number; y: number; selectedText: string;
  }>({ visible: false, x: 0, y: 0, selectedText: '' });
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteModalText, setNoteModalText] = useState('');
  const [pendingSelection, setPendingSelection] = useState<{ text: string; offset: number } | null>(null);

  // 悬浮笔记状态
  const [hoverNote, setHoverNote] = useState<{ visible: boolean; x: number; y: number; ann: Annotation } | null>(null);

  // 字体设置
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState('default');

  const selectedItem = items.find(i => i.id === selectedItemId) || null;
  const isEditable = selectedItem && ['txt', 'md', 'html'].includes(selectedItem.file_type);
  const isEdited = selectedItem?.file_path?.startsWith('_edited/');

  // 加载条目内容
  const loadContent = useCallback(async () => {
    if (!selectedItemId) { setContent(null); return; }
    setLoading(true);
    try {
      const [cont, tgs, anns] = await Promise.all([
        window.electronAPI.itemGetContent(selectedItemId),
        window.electronAPI.tagGetForItem(selectedItemId),
        window.electronAPI.annotationList(selectedItemId),
      ]);
      setContent(cont);
      setItemTags(tgs);
      setAnnotations(anns);
      if (editMode && cont?.textContent) {
        setEditingContent(cont.textContent);
      }
    } catch (err) {
      console.error('Failed to load content:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedItemId, editMode]);

  useEffect(() => { loadContent(); }, [selectedItemId]);

  // ========== 文本选择处理 ==========

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    // 编辑模式下不触发
    if (editMode) return;
    // 延迟一下，让 selection 稳定
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setSelectionToolbar(prev => ({ ...prev, visible: false }));
        return;
      }
      const text = sel.toString().trim();
      if (!text) return;

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // 计算选中的文本在全文中的偏移量
      const fullText = content?.textContent || '';
      const offset = fullText.indexOf(text);
      // 准确偏移计算：遍历前面的文本节点
      const container = previewRef.current;
      let charOffset = 0;
      if (container && content?.textContent) {
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
        let node: Text | null;
        while ((node = walker.nextNode() as Text | null)) {
          if (node === range.startContainer) {
            charOffset += range.startOffset;
            break;
          }
          charOffset += (node.textContent || '').length;
        }
      }

      setSelectionToolbar({
        visible: true,
        x: rect.left + rect.width / 2,
        y: rect.top - 45,
        selectedText: text,
      });

      setPendingSelection({ text, offset: charOffset > 0 ? charOffset : fullText.indexOf(text) });
    }, 10);
  }, [editMode, content]);

  // ========== 高亮/笔记操作 ==========

  const handleAddHighlight = useCallback(async () => {
    if (!selectedItemId || !pendingSelection) return;
    const selector = encodeSelector(pendingSelection.text, content?.textContent || '', pendingSelection.offset);
    await window.electronAPI.annotationCreate({
      item_id: selectedItemId,
      type: 'highlight',
      content: '',
      target_selector: selector,
    });
    setSelectionToolbar({ visible: false, x: 0, y: 0, selectedText: '' });
    const anns = await window.electronAPI.annotationList(selectedItemId);
    setAnnotations(anns);
    message.success('已高亮');
  }, [selectedItemId, pendingSelection, content]);

  const handleAddInlineNote = useCallback(() => {
    if (!pendingSelection) return;
    setNoteModalText('');
    setShowNoteModal(true);
    setSelectionToolbar({ visible: false, x: 0, y: 0, selectedText: '' });
  }, [pendingSelection]);

  const handleSaveNote = useCallback(async () => {
    if (!selectedItemId || !pendingSelection || !noteModalText.trim()) return;
    const selector = encodeSelector(pendingSelection.text, content?.textContent || '', pendingSelection.offset);
    // 同时创建高亮和笔记
    await window.electronAPI.annotationCreate({
      item_id: selectedItemId,
      type: 'highlight',
      content: '',
      target_selector: selector,
    });
    await window.electronAPI.annotationCreate({
      item_id: selectedItemId,
      type: 'note',
      content: noteModalText.trim(),
      target_selector: selector,
    });
    setShowNoteModal(false);
    setPendingSelection(null);
    const anns = await window.electronAPI.annotationList(selectedItemId);
    setAnnotations(anns);
    message.success('笔记已添加（鼠标悬浮高亮处查看）');
  }, [selectedItemId, pendingSelection, noteModalText, content]);

  const handleDeleteAnnotation = useCallback(async (annId: string) => {
    await window.electronAPI.annotationDelete(annId);
    const anns = await window.electronAPI.annotationList(selectedItemId!);
    setAnnotations(anns);
  }, [selectedItemId]);

  // ========== 悬浮笔记 ==========

  const handleHighlightHover = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains('highlighted-text')) {
      setHoverNote(null);
      return;
    }
    const annId = target.dataset.annId;
    if (!annId) { setHoverNote(null); return; }

    // 找这个高亮关联的笔记
    const highlight = annotations.find(a => a.id === annId);
    const selector = highlight?.target_selector || '';
    const notes = annotations.filter(a => a.type === 'note' && a.target_selector === selector);

    if (notes.length > 0) {
      const rect = target.getBoundingClientRect();
      setHoverNote({
        visible: true,
        x: rect.left,
        y: rect.bottom + 6,
        ann: notes[notes.length - 1], // 显示最新笔记
      });
    }
  }, [annotations]);

  // ========== 编辑模式 ==========

  const handleToggleEdit = useCallback(() => {
    if (!editMode) {
      // 进入编辑模式
      setEditingContent(content?.textContent || '');
      setEditMode(true);
    } else {
      // 退出编辑模式
      setEditMode(false);
    }
  }, [editMode, content]);

  const handleSaveEdit = useCallback(async () => {
    if (!selectedItemId) return;
    setSaving(true);
    try {
      const result = await window.electronAPI.saveContent(selectedItemId, editingContent);
      if (result.success) {
        message.success('已保存');
        setEditMode(false);
        // 重新加载内容
        await loadContent();
        onDataChange();
      } else {
        message.error(result.error || '保存失败');
      }
    } catch (err: any) {
      message.error('保存失败: ' + err.message);
    } finally {
      setSaving(false);
    }
  }, [selectedItemId, editingContent, loadContent, onDataChange]);

  const handleCancelEdit = useCallback(() => {
    setEditMode(false);
    setEditingContent(content?.textContent || '');
  }, [content]);

  // ========== 标签管理 ==========

  const handleAddTag = useCallback(async (tagId: string) => {
    if (!selectedItemId) return;
    await window.electronAPI.tagAddToItem(selectedItemId, tagId);
    const tgs = await window.electronAPI.tagGetForItem(selectedItemId);
    setItemTags(tgs);
    onDataChange();
  }, [selectedItemId, onDataChange]);

  const handleRemoveTag = useCallback(async (tagId: string) => {
    if (!selectedItemId) return;
    await window.electronAPI.tagRemoveFromItem(selectedItemId, tagId);
    const tgs = await window.electronAPI.tagGetForItem(selectedItemId);
    setItemTags(tgs);
  }, [selectedItemId]);

  // ========== 专辑/重命名/笔记/时间戳 ==========

  const handleAddNote = useCallback(async () => {
    if (!selectedItemId || !noteText.trim()) return;
    await window.electronAPI.annotationCreate({
      item_id: selectedItemId,
      type: 'note',
      content: noteText.trim(),
      target_selector: '',
    });
    setNoteText('');
    const anns = await window.electronAPI.annotationList(selectedItemId);
    setAnnotations(anns);
    message.success('笔记已添加');
  }, [selectedItemId, noteText]);

  const handleAddTimestampNote = useCallback(async () => {
    if (!selectedItemId || !videoRef || !noteText.trim()) return;
    const currentTime = videoRef.currentTime;
    const m = Math.floor(currentTime / 60);
    const s = Math.floor(currentTime % 60);
    const timestamp = `${m}:${s.toString().padStart(2, '0')}`;
    await window.electronAPI.annotationCreate({
      item_id: selectedItemId,
      type: 'timestamp',
      content: `[${timestamp}] ${noteText.trim()}`,
      target_selector: String(currentTime),
    });
    setNoteText('');
    const anns = await window.electronAPI.annotationList(selectedItemId);
    setAnnotations(anns);
    message.success(`时间戳笔记已记录 (${timestamp})`);
  }, [selectedItemId, noteText, videoRef]);

  const handleJumpToTimestamp = useCallback((seconds: string) => {
    if (videoRef) { videoRef.currentTime = parseFloat(seconds); videoRef.play(); }
  }, [videoRef]);


  const handleRename = useCallback(async () => {
    if (!selectedItem) return;
    const newTitle = prompt('修改标题', selectedItem.title);
    if (newTitle && newTitle.trim()) {
      await window.electronAPI.itemUpdate(selectedItem.id, { title: newTitle.trim() });
      onDataChange();
    }
  }, [selectedItem, onDataChange]);

  // 星标切换
  const handleToggleStar = useCallback(async () => {
    if (!selectedItemId) return;
    const starred = await window.electronAPI.itemToggleStar(selectedItemId);
    message.success(starred ? '已标星' : '已取消标星');
    onDataChange();
  }, [selectedItemId, onDataChange]);

  // HTML 图片本地化
  const handleLocalizeImages = useCallback(async () => {
    if (!selectedItemId) return;
    const url = prompt('输入原始网页 URL（用于解析相对路径的图片）：');
    if (!url) return;
    try {
      const result = await window.electronAPI.importLocalizeImages(selectedItemId, url);
      if (result.success) message.success('图片已本地化');
      else message.error(result.error || '本地化失败');
    } catch (err: any) { message.error(err.message); }
  }, [selectedItemId]);

  // Ctrl+S 保存监听
  useEffect(() => {
    const handler = () => { if (editMode) handleSaveEdit(); };
    window.addEventListener('kb:save' as any, handler);
    return () => window.removeEventListener('kb:save' as any, handler);
  }, [editMode, handleSaveEdit]);

  // ========== 渲染 ==========

  if (!selectedItem) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty description="选择一个条目以预览" />
      </div>
    );
  }

  return (
    <div ref={previewRef} className={readingMode ? 'reading-mode' : ''}
      style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      {/* 标题栏 */}
      <div style={{
        padding: '8px 16px', borderBottom: '1px solid var(--border-light)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Title level={5} style={{ margin: 0 }} ellipsis>{selectedItem.title}</Title>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            <AntTag color="blue">{selectedItem.file_type.toUpperCase()}</AntTag>
            {itemTags.map((tag: any) => (
              <AntTag key={tag.id} closable onClose={() => handleRemoveTag(tag.id)}>{tag.name}</AntTag>
            ))}
            <Tooltip title="管理标签">
              <AntTag style={{ cursor: 'pointer', borderStyle: 'dashed' }}
                onClick={() => setShowTagEditor(true)}><PlusOutlined /> 标签</AntTag>
            </Tooltip>
          </div>
        </div>
        <Space>
          {/* 字体控制 */}
          <Tooltip title="缩小字号">
            <Button type="text" size="small" icon={<ZoomOutOutlined />}
              onClick={() => setFontSize(s => Math.max(10, s - 2))} />
          </Tooltip>
          <Tooltip title="字号">
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 30, textAlign: 'center', cursor: 'default' }}>{fontSize}px</span>
          </Tooltip>
          <Tooltip title="放大字号">
            <Button type="text" size="small" icon={<ZoomInOutlined />}
              onClick={() => setFontSize(s => Math.min(32, s + 2))} />
          </Tooltip>
          <Select
            size="small"
            value={fontFamily}
            onChange={setFontFamily}
            style={{ width: 110 }}
            options={[
              { value: 'default', label: '默认' },
              { value: 'serif', label: '宋体/衬线' },
              { value: 'sans-serif', label: '黑体/无衬线' },
              { value: 'monospace', label: '等宽' },
            ]}
          />
          <span style={{ color: '#e5e7eb', margin: '0 2px' }}>|</span>

          {isEdited && <AntTag color="orange" style={{ margin: 0, fontSize: 10 }}>已编辑</AntTag>}
          {isEditable && (
            editMode ? (
              <>
                <Button size="small" type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSaveEdit}>保存</Button>
                <Button size="small" icon={<CloseOutlined />} onClick={handleCancelEdit}>取消</Button>
              </>
            ) : (
              <Tooltip title="启用编辑">
                <Button type="text" size="small" icon={<FormOutlined />} onClick={handleToggleEdit} />
              </Tooltip>
            )
          )}
          <Tooltip title={(selectedItem as any)?.is_starred ? '取消星标' : '添加星标'}>
            <Button type="text" size="small"
              icon={(selectedItem as any)?.is_starred
                ? <StarFilled style={{ color: '#f59e0b' }} />
                : <StarOutlined />}
              onClick={handleToggleStar} />
          </Tooltip>
          <Tooltip title="重命名"><Button type="text" size="small" icon={<EditOutlined />} onClick={handleRename} /></Tooltip>
          {selectedItem?.file_type === 'html' && (
            <Tooltip title="本地化图片（下载HTML中的远程图片）">
              <Button type="text" size="small" icon={<DownloadOutlined />} onClick={handleLocalizeImages} />
            </Tooltip>
          )}
          <Tooltip title={readingMode ? '退出阅读模式' : '阅读模式'}>
            <Button type="text" size="small"
              icon={readingMode ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              onClick={() => setReadingMode(!readingMode)}
            />
          </Tooltip>
        </Space>
      </div>

      {/* 内容预览区 */}
      <div style={{
        flex: 1, overflow: 'auto', padding: readingMode ? 32 : 16,
        fontSize: `${fontSize}px`,
        fontFamily: fontFamily === 'default' ? undefined : fontFamily,
      }}
        onMouseUp={isEditable ? handleMouseUp : undefined}
        onMouseOver={handleHighlightHover}
        onMouseLeave={() => setHoverNote(null)}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
        ) : editMode ? (
          selectedItem.file_type === 'md' ? (
            /* Markdown 分屏：左编辑，右实时预览 */
            <div style={{ display: 'flex', height: '100%', gap: 0 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{
                  padding: '4px 12px', background: 'var(--bg-hover)', borderBottom: '1px solid var(--border-normal)',
                  fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500,
                }}>编辑</div>
                <textarea
                  value={editingContent}
                  onChange={(e) => setEditingContent(e.target.value)}
                  style={{
                    flex: 1, border: 'none', borderRadius: 0, padding: 16,
                    fontFamily: 'Consolas, "Fira Code", monospace', fontSize: 14, lineHeight: 1.8,
                    resize: 'none', outline: 'none',
                  }}
                  placeholder="编写 Markdown..."
                />
              </div>
              <div style={{
                width: 1, background: '#e5e7eb',
              }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{
                  padding: '4px 12px', background: 'var(--bg-hover)', borderBottom: '1px solid var(--border-normal)',
                  fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500,
                }}>预览</div>
                <div style={{
                  flex: 1, overflow: 'auto', padding: 16,
                  fontSize: `${fontSize}px`,
                  fontFamily: fontFamily === 'default' ? undefined : fontFamily,
                }}
                  className="preview-content"
                  dangerouslySetInnerHTML={{
                    __html: (() => { try { return marked.parse(editingContent) as string; } catch { return '<p>渲染错误</p>'; } })()
                  }}
                />
              </div>
            </div>
          ) : (
            /* 纯文本：全宽编辑 */
            <textarea
              value={editingContent}
              onChange={(e) => setEditingContent(e.target.value)}
              style={{
                width: '100%', height: '100%', minHeight: 400,
                border: '1px solid var(--border-normal)', borderRadius: 8, padding: 16,
                fontFamily: 'monospace', fontSize: 14, lineHeight: 1.8,
                resize: 'none', outline: 'none',
              }}
              placeholder="编辑文档内容..."
            />
          )
        ) : content ? (
          <RenderContent
            content={content}
            fileType={selectedItem.file_type}
            annotations={annotations}
            onVideoRef={setVideoRef}
          />
        ) : (
          <Empty description="无法加载内容" />
        )}
      </div>

      {/* 选中文本浮动工具栏 */}
      {selectionToolbar.visible && (
        <div style={{
          position: 'fixed', left: selectionToolbar.x, top: selectionToolbar.y,
          transform: 'translateX(-50%)',
          background: '#1f2937', color: '#fff', borderRadius: 8, padding: '4px 8px',
          display: 'flex', gap: 4, zIndex: 1001, boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
        }}>
          <Button type="text" size="small" icon={<HighlightOutlined />}
            style={{ color: '#fde68a' }}
            onClick={handleAddHighlight}>高亮</Button>
          <Button type="text" size="small" icon={<FormOutlined />}
            style={{ color: '#a5f3fc' }}
            onClick={handleAddInlineNote}>添加笔记</Button>
        </div>
      )}

      {/* 悬浮笔记弹出 */}
      {hoverNote?.visible && (
        <div style={{
          position: 'fixed', left: hoverNote.x, top: hoverNote.y,
          maxWidth: 320, background: '#fffbeb', border: '1px solid #fcd34d',
          borderRadius: 8, padding: '8px 12px', zIndex: 1001,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)', fontSize: 13,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text strong style={{ fontSize: 12 }}>📝 笔记</Text>
            <Button type="text" size="small" danger
              onClick={() => { handleDeleteAnnotation(hoverNote.ann.id); setHoverNote(null); }}
              style={{ fontSize: 12, padding: 0, height: 18 }}>删除</Button>
          </div>
          <Text style={{ fontSize: 13 }}>{hoverNote.ann.content}</Text>
        </div>
      )}

      {/* 笔记输入弹窗 */}
      <Modal title="添加笔记" open={showNoteModal}
        onOk={handleSaveNote} onCancel={() => setShowNoteModal(false)}
        okText="保存" cancelText="取消"
      >
        <div style={{ marginBottom: 8 }}>
          <AntTag color="yellow">选中的文本：</AntTag>
          <Text type="secondary" style={{ fontSize: 12 }}>
            "{pendingSelection?.text?.substring(0, 100)}{(pendingSelection?.text?.length || 0) > 100 ? '...' : ''}"
          </Text>
        </div>
        <Input.TextArea rows={3} value={noteModalText}
          onChange={(e) => setNoteModalText(e.target.value)}
          placeholder="输入笔记内容..."
          autoFocus
        />
      </Modal>

      {/* 笔记面板（底部） */}
      {content && (content.type === 'text' || content.type === 'html' || content.type === 'video') && (
        <AnnotationPanel
          annotations={annotations}
          noteText={noteText}
          onNoteTextChange={setNoteText}
          onAddNote={handleAddNote}
          onAddTimestamp={content.type === 'video' ? handleAddTimestampNote : undefined}
          onDelete={handleDeleteAnnotation}
          onJumpToTimestamp={handleJumpToTimestamp}
          isVideo={content.type === 'video'}
        />
      )}

      {/* 元数据面板 */}
      {selectedItem && (
        <div style={{
          borderTop: '1px solid var(--border-light)', padding: '8px 16px',
          background: 'var(--bg-meta, #fafafa)', fontSize: 12,
        }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', color: 'var(--text-secondary)' }}>
            <span>📏 {selectedItem.size < 1024 ? `${selectedItem.size}B` : selectedItem.size < 1048576 ? `${(selectedItem.size/1024).toFixed(1)}KB` : `${(selectedItem.size/1048576).toFixed(1)}MB`}</span>
            <span>📅 创建: {new Date(selectedItem.created_at).toLocaleString('zh-CN')}</span>
            <span>🕐 修改: {new Date(selectedItem.updated_at).toLocaleString('zh-CN')}</span>
            {selectedItem.original_url && <span>🔗 {selectedItem.original_url}</span>}
            <span>📁 {selectedItem.file_path}</span>
          </div>
        </div>
      )}

      {/* 标签编辑器弹窗 */}
      <Modal title="管理标签" open={showTagEditor}
        onCancel={() => setShowTagEditor(false)} footer={null} width={400}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {tags.filter((t: any) => !itemTags.find((it: any) => it.id === t.id)).map((tag: any) => (
            <AntTag key={tag.id} style={{ cursor: 'pointer' }}
              onClick={() => handleAddTag(tag.id)}>
              <PlusOutlined /> {tag.name}
            </AntTag>
          ))}
        </div>
      </Modal>
    </div>
  );
}

// ========== 内容渲染子组件 ==========

function RenderContent({
  content, fileType, annotations, onVideoRef,
}: {
  content: FileContent;
  fileType: string;
  annotations: Annotation[];
  onVideoRef: (ref: HTMLVideoElement | null) => void;
}) {
  switch (content.type) {
    case 'text':
      return <TextPreview content={content.textContent || ''} fileType={fileType} annotations={annotations} />;
    case 'html':
      return (
        <div className="preview-content"
          dangerouslySetInnerHTML={{ __html: content.htmlContent || '' }}
          style={{ maxWidth: '100%', overflow: 'auto' }}
        />
      );
    case 'image':
      return (
        <div style={{ textAlign: 'center' }}>
          <img src={`file://${content.absolutePath}`} alt="preview"
            style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 8 }} />
        </div>
      );
    case 'video':
      return (
        <div style={{ textAlign: 'center' }}>
          <video ref={onVideoRef} src={`file://${content.absolutePath}`} controls
            style={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: 8 }} />
        </div>
      );
    case 'pdf':
      return (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <FilePdfOutlined style={{ fontSize: 48, color: '#ef4444' }} />
          <br /><br />
          <Button type="primary" icon={<EyeOutlined />}
            onClick={() => content.absolutePath && window.electronAPI.shellOpenPath(content.absolutePath)}>
            打开 PDF
          </Button>
        </div>
      );
    default:
      return <Empty description="此文件类型暂不支持预览" />;
  }
}

// ========== 文本预览（含高亮注入） ==========

function TextPreview({ content: text, fileType, annotations }: {
  content: string;
  fileType: string;
  annotations: Annotation[];
}) {
  const renderedHtml = useMemo(() => {
    if (fileType === 'md') {
      try {
        const html = marked.parse(text) as string;
        return html;
      } catch { /* fallback */ }
    }
    // 纯文本：注入高亮
    const { html } = injectHighlights(text, annotations);
    // 保持换行
    return html.replace(/\n/g, '<br/>');
  }, [text, fileType, annotations]);

  return (
    <div className="preview-content"
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
      style={{ whiteSpace: fileType === 'md' ? 'normal' : 'pre-wrap', wordBreak: 'break-word' }}
    />
  );
}

// ========== 笔记面板 ==========

function AnnotationPanel({
  annotations, noteText, onNoteTextChange,
  onAddNote, onAddTimestamp, onDelete,
  onJumpToTimestamp, isVideo,
}: {
  annotations: Annotation[];
  noteText: string;
  onNoteTextChange: (v: string) => void;
  onAddNote: () => void;
  onAddTimestamp?: () => void;
  onDelete: (ann: Annotation) => void;
  onJumpToTimestamp: (seconds: string) => void;
  isVideo: boolean;
}) {
  const generalNotes = annotations.filter(a => a.type === 'note' || a.type === 'timestamp');

  return (
    <div style={{ borderTop: '1px solid var(--border-light)', maxHeight: 200, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 12px', display: 'flex', gap: 8 }}>
        <Input.TextArea size="small" rows={2}
          placeholder={isVideo ? '输入笔记，点击时钟图标记录当前播放时间点' : '输入笔记...'}
          value={noteText} onChange={(e) => onNoteTextChange(e.target.value)}
          onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); onAddNote(); }}}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Button size="small" type="primary" onClick={onAddNote}>添加</Button>
          {isVideo && (
            <Tooltip title="记录当前时间点">
              <Button size="small" icon={<ClockCircleOutlined />} onClick={onAddTimestamp} />
            </Tooltip>
          )}
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 12px 8px' }}>
        {generalNotes.length === 0 ? (
          <Text type="secondary" style={{ fontSize: 12 }}>暂无笔记</Text>
        ) : generalNotes.map(ann => (
          <div key={ann.id} style={{
            padding: '6px 0', borderBottom: '1px solid #fafafa',
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {ann.type === 'timestamp' && (
                <AntTag color="blue" style={{ cursor: 'pointer', marginBottom: 4 }}
                  onClick={() => onJumpToTimestamp(ann.target_selector)}>
                  <ClockCircleOutlined /> {ann.content.match(/\[([^\]]+)\]/)?.[1] || '跳转'}
                </AntTag>
              )}
              <Text style={{ fontSize: 12, display: 'block' }}>{ann.content}</Text>
              <Text type="secondary" style={{ fontSize: 10 }}>
                {new Date(ann.created_at).toLocaleString('zh-CN')}
              </Text>
            </div>
            <Button type="text" size="small" danger onClick={() => onDelete(ann)}>×</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ========== 工具函数 ==========

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
