/**
 * 拖拽导入遮罩层
 * 使用 ref 保持回调稳定，避免 React 重渲染打断事件监听
 */
import React, { useEffect, useState, useRef } from 'react';

interface Props {
  children: React.ReactNode;
  onImportComplete: () => void;
}

export function DragDropOverlay({ children, onImportComplete }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const dragCounter = useRef(0);

  // 用 ref 保存最新回调，避免 effect 依赖变化
  const onImportCompleteRef = useRef(onImportComplete);
  onImportCompleteRef.current = onImportComplete;

  useEffect(() => {
    /** 判断是否是从文件系统拖入的真实文件（排除内部拖拽排序） */
    const isExternalFileDrag = (e: DragEvent): boolean => {
      const dt = e.dataTransfer;
      if (!dt) return false;
      // 外部文件拖入时 files 不为空，内部拖拽（排序）files 为空
      if (dt.files && dt.files.length > 0) return true;
      // 也检查 types：Files 类型表示外部文件
      if (dt.types && dt.types.includes('Files')) return true;
      return false;
    };

    const onDragEnter = (e: DragEvent) => {
      if (!isExternalFileDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current++;
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      setIsDragging(true);
    };

    const onDragOver = (e: DragEvent) => {
      if (!isExternalFileDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };

    const onDragLeave = (e: DragEvent) => {
      if (!isExternalFileDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current--;
      if (dragCounter.current <= 0) {
        dragCounter.current = 0;
        setIsDragging(false);
      }
    };

    const onDragEnd = () => {
      dragCounter.current = 0;
      setIsDragging(false);
    };

    const onDrop = async (e: DragEvent) => {
      if (!isExternalFileDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragging(false);

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      const filePaths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        // contextIsolation 模式下必须用 webUtils.getPathForFile
        const realPath = window.electronAPI.getPathForFile(f);
        if (realPath) {
          filePaths.push(realPath);
        }
      }

      if (filePaths.length > 0) {
        setImporting(true);
        try {
          await window.electronAPI.importFiles(filePaths);
          onImportCompleteRef.current();
        } catch (err) {
          console.error('Import failed:', err);
        } finally {
          setImporting(false);
        }
      }
    };

    // 粘贴事件
    const onPaste = async (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (!blob) continue;
          const reader = new FileReader();
          reader.onload = async () => {
            try {
              await window.electronAPI.importClipboard({ type: 'image', imageBase64: reader.result as string });
              onImportCompleteRef.current();
            } catch (err) { console.error('Paste image failed:', err); }
          };
          reader.readAsDataURL(blob);
          break;
        } else if (item.type === 'text/plain') {
          item.getAsString(async (text) => {
            if (text.trim().length > 10) {
              try {
                await window.electronAPI.importClipboard({ type: 'text', text });
                onImportCompleteRef.current();
              } catch (err) { console.error('Paste text failed:', err); }
            }
          });
          break;
        }
      }
    };

    // 注册所有事件（只执行一次，因为依赖数组为空）
    document.addEventListener('dragenter', onDragEnter);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('dragleave', onDragLeave);
    document.addEventListener('dragend', onDragEnd);
    document.addEventListener('drop', onDrop);
    document.addEventListener('paste', onPaste);

    return () => {
      document.removeEventListener('dragenter', onDragEnter);
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('dragleave', onDragLeave);
      document.removeEventListener('dragend', onDragEnd);
      document.removeEventListener('drop', onDrop);
      document.removeEventListener('paste', onPaste);
    };
  }, []); // 空依赖 —— 只绑定一次，通过 ref 访问最新回调

  return (
    <div style={{ height: '100%', position: 'relative' }}>
      {children}
      {isDragging && (
        <div className="drag-overlay">
          {importing ? '正在导入...' : '释放文件以导入'}
        </div>
      )}
    </div>
  );
}
