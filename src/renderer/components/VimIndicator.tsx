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
    <div className="vim-indicator" style={{
      display: 'flex', alignItems: 'center', gap: 5, marginLeft: 6,
      userSelect: 'none',
    }}>
      {/* 模式指示 */}
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: 1,
        padding: '1px 4px', borderRadius: 2,
        border: '1px solid var(--border-normal)',
        color: 'var(--accent)', fontFamily: 'monospace',
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
