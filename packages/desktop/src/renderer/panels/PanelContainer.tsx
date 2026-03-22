import React, { useCallback, useEffect } from 'react';
import { PanelNode, PanelLayout, SplitDirection, PresetLayout } from '@connectty/shared';
import { SplitPane } from './SplitPane';
import { TerminalPane } from './TerminalPane';
import { EmptyPane } from './EmptyPane';
import { splitPane, removePane, updateRatio, getAdjacentPane, countLeaves } from './layoutUtils';
import type { Terminal } from 'xterm';
import type { FitAddon } from 'xterm-addon-fit';

// A session with terminal capabilities (SSH, Serial, LocalShell)
interface TerminalSession {
  id: string;
  type: 'ssh' | 'serial' | 'localShell';
  terminal: Terminal;
  fitAddon: FitAddon;
  connectionName?: string;
  shellName?: string;
}

// Any session type
interface AnySession {
  id: string;
  type: string;
  terminal?: Terminal;
  fitAddon?: FitAddon;
  connectionName?: string;
  shellName?: string;
}

interface PanelContainerProps {
  layout: PanelLayout;
  sessions: AnySession[];
  onLayoutChange: (layout: PanelLayout) => void;
  onActivePanelChange: (panelId: string) => void;
  onSessionSelect: (panelId: string) => void;
  onResize?: (sessionId: string, cols: number, rows: number, sessionType: string) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function PanelContainer({
  layout,
  sessions,
  onLayoutChange,
  onActivePanelChange,
  onSessionSelect,
  onResize,
  onContextMenu,
}: PanelContainerProps) {
  const { root, activePanelId } = layout;

  const handleRatioChange = useCallback((splitId: string, newRatio: number) => {
    onLayoutChange({
      ...layout,
      root: updateRatio(root, splitId, newRatio),
    });
  }, [layout, root, onLayoutChange]);

  const handleSplit = useCallback((panelId: string, direction: SplitDirection) => {
    onLayoutChange({
      ...layout,
      root: splitPane(root, panelId, direction),
    });
  }, [layout, root, onLayoutChange]);

  const handleClose = useCallback((panelId: string) => {
    const newRoot = removePane(root, panelId);
    if (!newRoot) return; // Don't remove the last pane

    // If the active panel was removed, activate the first available
    let newActiveId = activePanelId;
    if (activePanelId === panelId) {
      const findFirstLeaf = (node: PanelNode): string => {
        if (node.type === 'leaf') return node.id;
        return findFirstLeaf(node.first);
      };
      newActiveId = findFirstLeaf(newRoot);
    }

    onLayoutChange({
      root: newRoot,
      activePanelId: newActiveId,
    });
  }, [layout, root, activePanelId, onLayoutChange]);

  // Keyboard shortcuts for panel navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.shiftKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      switch (e.key) {
        case '|':
        case '\\': {
          e.preventDefault();
          handleSplit(activePanelId, 'vertical');
          break;
        }
        case '-':
        case '_': {
          e.preventDefault();
          handleSplit(activePanelId, 'horizontal');
          break;
        }
        case 'X':
        case 'x': {
          if (countLeaves(root) > 1) {
            e.preventDefault();
            handleClose(activePanelId);
          }
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          const adj = getAdjacentPane(root, activePanelId, 'left');
          if (adj) onActivePanelChange(adj);
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          const adj = getAdjacentPane(root, activePanelId, 'right');
          if (adj) onActivePanelChange(adj);
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const adj = getAdjacentPane(root, activePanelId, 'up');
          if (adj) onActivePanelChange(adj);
          break;
        }
        case 'ArrowDown': {
          e.preventDefault();
          const adj = getAdjacentPane(root, activePanelId, 'down');
          if (adj) onActivePanelChange(adj);
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePanelId, root, handleSplit, handleClose, onActivePanelChange]);

  const renderNode = useCallback((node: PanelNode): React.ReactNode => {
    if (node.type === 'split') {
      return (
        <SplitPane
          key={node.id}
          node={node}
          onRatioChange={handleRatioChange}
          renderNode={renderNode}
        />
      );
    }

    // Leaf node
    const session = node.sessionId ? sessions.find(s => s.id === node.sessionId) : null;
    const isActive = node.id === activePanelId;
    const canClose = countLeaves(root) > 1;

    if (!session || !session.terminal || !session.fitAddon) {
      return (
        <EmptyPane
          key={node.id}
          panelId={node.id}
          isActive={isActive}
          onActivate={() => onActivePanelChange(node.id)}
          onSelectSession={() => onSessionSelect(node.id)}
          onClose={canClose ? () => handleClose(node.id) : undefined}
        />
      );
    }

    return (
      <TerminalPane
        key={node.id}
        panelId={node.id}
        terminal={session.terminal}
        fitAddon={session.fitAddon}
        sessionId={session.id}
        sessionType={session.type as 'ssh' | 'serial' | 'localShell'}
        isActive={isActive}
        onActivate={() => onActivePanelChange(node.id)}
        onResize={onResize}
        onSplit={(direction) => handleSplit(node.id, direction)}
        onClose={canClose ? () => handleClose(node.id) : undefined}
        onContextMenu={onContextMenu}
      />
    );
  }, [sessions, activePanelId, root, handleRatioChange, handleSplit, handleClose, onActivePanelChange, onSessionSelect, onResize, onContextMenu]);

  return (
    <div className="panel-container">
      {renderNode(root)}
    </div>
  );
}
