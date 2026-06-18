import React from 'react';
import { PresetLayout } from '@connectty/shared';

interface LayoutPickerProps {
  onSelect: (preset: PresetLayout) => void;
  onClose: () => void;
  current?: PresetLayout | null;
}

const presets: { id: PresetLayout; label: string; icon: React.ReactNode }[] = [
  {
    id: 'single', label: 'Single',
    icon: <svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="2" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1"/></svg>
  },
  {
    id: 'side-by-side', label: 'Side by Side',
    icon: <svg viewBox="0 0 24 24"><rect x="2" y="2" width="9" height="20" rx="1" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1"/><rect x="13" y="2" width="9" height="20" rx="1" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1"/></svg>
  },
  {
    id: 'top-bottom', label: 'Top / Bottom',
    icon: <svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="9" rx="1" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1"/><rect x="2" y="13" width="20" height="9" rx="1" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1"/></svg>
  },
  {
    id: '2x2', label: '2x2 Grid',
    icon: <svg viewBox="0 0 24 24"><rect x="2" y="2" width="9" height="9" rx="1" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1"/><rect x="13" y="2" width="9" height="9" rx="1" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1"/><rect x="2" y="13" width="9" height="9" rx="1" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1"/><rect x="13" y="13" width="9" height="9" rx="1" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1"/></svg>
  },
  {
    id: '1-plus-2', label: '1 + 2',
    icon: <svg viewBox="0 0 24 24"><rect x="2" y="2" width="12" height="20" rx="1" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1"/><rect x="16" y="2" width="6" height="9" rx="1" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1"/><rect x="16" y="13" width="6" height="9" rx="1" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1"/></svg>
  },
  {
    id: '2-plus-1', label: '2 + 1',
    icon: <svg viewBox="0 0 24 24"><rect x="2" y="2" width="6" height="9" rx="1" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1"/><rect x="2" y="13" width="6" height="9" rx="1" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1"/><rect x="10" y="2" width="12" height="20" rx="1" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1"/></svg>
  },
  {
    id: '3-column', label: '3 Columns',
    icon: <svg viewBox="0 0 24 24"><rect x="2" y="2" width="6" height="20" rx="1" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1"/><rect x="9" y="2" width="6" height="20" rx="1" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1"/><rect x="16" y="2" width="6" height="20" rx="1" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1"/></svg>
  },
  {
    id: '3x3', label: '3x3 Grid',
    icon: <svg viewBox="0 0 24 24">{[0,1,2].map(r => [0,1,2].map(c => <rect key={`${r}${c}`} x={2+c*7.33} y={2+r*7.33} width="5.33" height="5.33" rx="0.5" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="0.5"/>))}</svg>
  },
  {
    id: '4x4', label: '4x4 Grid',
    icon: <svg viewBox="0 0 24 24">{[0,1,2,3].map(r => [0,1,2,3].map(c => <rect key={`${r}${c}`} x={2+c*5.5} y={2+r*5.5} width="3.5" height="3.5" rx="0.5" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="0.5"/>))}</svg>
  },
];

export function LayoutPicker({ onSelect, onClose, current }: LayoutPickerProps) {
  return (
    <div className="layout-picker-overlay" onClick={onClose}>
      <div className="layout-picker" onClick={e => e.stopPropagation()}>
        <div className="layout-picker-header">
          <h3>Panel Layout</h3>
          <button className="pane-action-btn" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="layout-picker-grid">
          {presets.map(preset => (
            <button
              key={preset.id}
              className={`layout-preset-btn ${current === preset.id ? 'active' : ''}`}
              onClick={() => { onSelect(preset.id); onClose(); }}
              title={preset.label}
            >
              <div className="layout-preset-icon">{preset.icon}</div>
              <span className="layout-preset-label">{preset.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
