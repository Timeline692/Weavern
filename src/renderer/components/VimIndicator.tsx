/**
 * Vim 模式指示器 — 显示当前模式和聚焦面板
 */
import React from 'react';
import { useStore } from '../store';

const PANEL_LABELS: Record<string, string> = {
  sidebar: 'SIDEBAR',
  list: 'LIST',
  preview: 'PREVIEW',
};

export function VimIndicator() {
  const { vimMode, vimPanelFocus } = useStore();

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4,
      opacity: 0.7, userSelect: 'none',
    }}>
      {/* 模式指示 */}
      <span style={{
        fontSize: 10, fontWeight: 900, letterSpacing: 1,
        padding: '1px 5px', borderRadius: 3,
        background: vimMode === 'normal' ? '#10b981' : '#3b82f6',
        color: '#fff', fontFamily: 'monospace',
      }}>
        {vimMode === 'normal' ? 'N' : 'I'}
      </span>
      {/* 面板指示 */}
      <span style={{
        fontSize: 10, fontWeight: 600, letterSpacing: 0.5,
        color: 'var(--text-secondary)', fontFamily: 'monospace',
      }}>
        {PANEL_LABELS[vimPanelFocus]}
      </span>
    </div>
  );
}
