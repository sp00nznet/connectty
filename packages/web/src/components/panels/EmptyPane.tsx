import React from 'react';

interface EmptyPaneProps {
  panelId: string;
  isActive: boolean;
  onActivate: () => void;
  onSelectSession: () => void;
  onClose?: () => void;
}

export function EmptyPane({ panelId, isActive, onActivate, onSelectSession, onClose }: EmptyPaneProps) {
  return (
    <div
      className={`terminal-pane empty-pane ${isActive ? 'active' : ''}`}
      onClick={onActivate}
    >
      <div className="empty-pane-content">
        <button className="empty-pane-add-btn" onClick={onSelectSession} title="Assign a session to this panel">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <p className="empty-pane-text">Click to assign a session</p>
      </div>
      {onClose && (
        <button
          className="pane-action-btn pane-close-btn empty-pane-close"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          title="Close pane"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      )}
    </div>
  );
}
