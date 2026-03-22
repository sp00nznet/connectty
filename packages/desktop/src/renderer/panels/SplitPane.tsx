import React, { useRef, useCallback } from 'react';
import { PanelSplit } from '@connectty/shared';

interface SplitPaneProps {
  node: PanelSplit;
  onRatioChange: (splitId: string, newRatio: number) => void;
  renderNode: (node: import('@connectty/shared').PanelNode) => React.ReactNode;
}

export function SplitPane({ node, onRatioChange, renderNode }: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;

    const container = containerRef.current;
    if (!container) return;

    const startPos = node.direction === 'vertical' ? e.clientX : e.clientY;
    const containerRect = container.getBoundingClientRect();
    const containerSize = node.direction === 'vertical' ? containerRect.width : containerRect.height;
    const startRatio = node.ratio;

    const divider = e.currentTarget as HTMLElement;
    divider.classList.add('dragging');

    const onMouseMove = (e: MouseEvent) => {
      const currentPos = node.direction === 'vertical' ? e.clientX : e.clientY;
      const delta = (currentPos - startPos) / containerSize;
      const newRatio = Math.max(0.1, Math.min(0.9, startRatio + delta));
      onRatioChange(node.id, newRatio);
    };

    const onMouseUp = () => {
      isDragging.current = false;
      divider.classList.remove('dragging');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [node.direction, node.ratio, node.id, onRatioChange]);

  const isVertical = node.direction === 'vertical';

  return (
    <div
      ref={containerRef}
      className={`split-pane ${isVertical ? 'vertical' : 'horizontal'}`}
    >
      <div
        className="split-pane-child"
        style={{ flexBasis: `calc(${node.ratio * 100}% - 2px)` }}
      >
        {renderNode(node.first)}
      </div>
      <div
        className="split-divider"
        onMouseDown={handleDividerMouseDown}
      />
      <div
        className="split-pane-child"
        style={{ flexBasis: `calc(${(1 - node.ratio) * 100}% - 2px)` }}
      >
        {renderNode(node.second)}
      </div>
    </div>
  );
}
