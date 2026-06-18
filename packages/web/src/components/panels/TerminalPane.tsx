import React, { useRef, useEffect, useCallback } from 'react';
import type { Terminal } from 'xterm';
import type { FitAddon } from 'xterm-addon-fit';
import { SplitDirection } from '@connectty/shared';

interface TerminalPaneProps {
  panelId: string;
  terminal: Terminal;
  fitAddon: FitAddon;
  sessionId: string;
  sessionType: 'ssh' | 'serial' | 'localShell';
  isActive: boolean;
  onActivate: () => void;
  onResize?: (sessionId: string, cols: number, rows: number, sessionType: string) => void;
  onSplit?: (direction: SplitDirection) => void;
  onClose?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function TerminalPane({
  terminal,
  fitAddon,
  sessionId,
  sessionType,
  isActive,
  onActivate,
  onResize,
  onSplit,
  onClose,
  onContextMenu,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fitTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const mountedRef = useRef(false);

  // Mount terminal on first render
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mountedRef.current) return;

    // If terminal is already mounted elsewhere, detach it first
    if (terminal.element?.parentNode) {
      terminal.element.parentNode.removeChild(terminal.element);
    }

    container.innerHTML = '';
    terminal.open(container);
    mountedRef.current = true;

    // Initial fit
    requestAnimationFrame(() => {
      fitAddon.fit();
    });

    return () => {
      mountedRef.current = false;
    };
  }, [terminal, fitAddon]);

  // ResizeObserver for automatic refitting
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      clearTimeout(fitTimeoutRef.current);
      fitTimeoutRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        try {
          fitAddon.fit();
          const { cols, rows } = terminal;
          onResize?.(sessionId, cols, rows, sessionType);
        } catch {
          // Terminal may have been disposed
        }
      }, 50);
    });

    observer.observe(container);
    return () => {
      observer.disconnect();
      clearTimeout(fitTimeoutRef.current);
    };
  }, [fitAddon, terminal, sessionId, sessionType, onResize]);

  // Focus terminal when this pane becomes active
  useEffect(() => {
    if (isActive && mountedRef.current) {
      terminal.focus();
    }
  }, [isActive, terminal]);

  const handleClick = useCallback(() => {
    onActivate();
    terminal.focus();
  }, [onActivate, terminal]);

  return (
    <div
      className={`terminal-pane ${isActive ? 'active' : ''}`}
      onClick={handleClick}
      onContextMenu={onContextMenu}
    >
      <div className="terminal-pane-header">
        <span className="terminal-pane-label">{sessionType.toUpperCase()}</span>
        <div className="terminal-pane-actions">
          {onSplit && (
            <>
              <button
                className="pane-action-btn"
                onClick={(e) => { e.stopPropagation(); onSplit('vertical'); }}
                title="Split vertical"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/>
                </svg>
              </button>
              <button
                className="pane-action-btn"
                onClick={(e) => { e.stopPropagation(); onSplit('horizontal'); }}
                title="Split horizontal"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/>
                </svg>
              </button>
            </>
          )}
          {onClose && (
            <button
              className="pane-action-btn pane-close-btn"
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              title="Close pane"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
      </div>
      <div ref={containerRef} className="terminal-pane-content" />
    </div>
  );
}
