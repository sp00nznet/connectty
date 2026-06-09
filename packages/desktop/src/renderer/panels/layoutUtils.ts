import { PanelNode, PanelLeaf, PanelSplit, PanelLayout, SplitDirection, PresetLayout } from '@connectty/shared';

// Generate a unique panel ID
let counter = 0;
const panelId = (): string => `p${Date.now().toString(36)}${(counter++).toString(36)}`;

/**
 * Create a leaf node
 */
export function createLeaf(sessionId: string | null = null): PanelLeaf {
  return { type: 'leaf', id: panelId(), sessionId };
}

/**
 * Split a leaf pane into two panes.
 * The existing session stays in the `position === 'first' ? 'first' : 'second'` slot,
 * and the new session goes in the other slot.
 */
export function splitPane(
  root: PanelNode,
  targetPanelId: string,
  direction: SplitDirection,
  newSessionId: string | null = null,
  position: 'first' | 'second' = 'second'
): PanelNode {
  return mapNode(root, (node) => {
    if (node.type !== 'leaf' || node.id !== targetPanelId) return node;
    const newLeaf = createLeaf(newSessionId);
    const split: PanelSplit = {
      type: 'split',
      id: panelId(),
      direction,
      ratio: 0.5,
      first: position === 'second' ? node : newLeaf,
      second: position === 'second' ? newLeaf : node,
    };
    return split;
  });
}

/**
 * Remove a pane. Its sibling replaces the parent split.
 * Returns null if the root itself is removed.
 */
export function removePane(root: PanelNode, targetPanelId: string): PanelNode | null {
  if (root.type === 'leaf') {
    return root.id === targetPanelId ? null : root;
  }

  // Check if either direct child is the target
  if (root.first.type === 'leaf' && root.first.id === targetPanelId) {
    return root.second;
  }
  if (root.second.type === 'leaf' && root.second.id === targetPanelId) {
    return root.first;
  }

  // Recurse into children
  const newFirst = removePane(root.first, targetPanelId);
  const newSecond = removePane(root.second, targetPanelId);

  if (newFirst === null) return root.second;
  if (newSecond === null) return root.first;

  if (newFirst === root.first && newSecond === root.second) return root;
  return { ...root, first: newFirst, second: newSecond };
}

/**
 * Update the split ratio of a specific split node
 */
export function updateRatio(root: PanelNode, splitId: string, newRatio: number): PanelNode {
  const clamped = Math.max(0.1, Math.min(0.9, newRatio));
  return mapNode(root, (node) => {
    if (node.type === 'split' && node.id === splitId) {
      return { ...node, ratio: clamped };
    }
    return node;
  });
}

/**
 * Find a panel node by ID
 */
export function findPanel(root: PanelNode, panelId: string): PanelNode | null {
  if (root.id === panelId) return root;
  if (root.type === 'split') {
    return findPanel(root.first, panelId) || findPanel(root.second, panelId);
  }
  return null;
}

/**
 * Count leaf nodes in the tree
 */
export function countLeaves(root: PanelNode): number {
  if (root.type === 'leaf') return 1;
  return countLeaves(root.first) + countLeaves(root.second);
}

/**
 * Get all session IDs in the layout
 */
export function getSessionIds(root: PanelNode): (string | null)[] {
  if (root.type === 'leaf') return [root.sessionId];
  return [...getSessionIds(root.first), ...getSessionIds(root.second)];
}

/**
 * Get all leaf nodes in order
 */
export function getLeaves(root: PanelNode): PanelLeaf[] {
  if (root.type === 'leaf') return [root];
  return [...getLeaves(root.first), ...getLeaves(root.second)];
}

/**
 * Assign a session to a specific panel
 */
export function assignSession(root: PanelNode, panelId: string, sessionId: string | null): PanelNode {
  return mapNode(root, (node) => {
    if (node.type === 'leaf' && node.id === panelId) {
      return { ...node, sessionId };
    }
    return node;
  });
}

/**
 * Navigate to an adjacent pane in the given direction.
 * Returns the panel ID of the adjacent pane, or null if none.
 */
export function getAdjacentPane(
  root: PanelNode,
  currentPanelId: string,
  direction: 'up' | 'down' | 'left' | 'right'
): string | null {
  const leaves = getLeaves(root);
  const currentIdx = leaves.findIndex(l => l.id === currentPanelId);
  if (currentIdx === -1) return null;

  // Simple linear navigation for now - left/up goes to previous, right/down goes to next
  if (direction === 'left' || direction === 'up') {
    return currentIdx > 0 ? leaves[currentIdx - 1].id : null;
  }
  return currentIdx < leaves.length - 1 ? leaves[currentIdx + 1].id : null;
}

/**
 * Create a preset layout with the given session IDs.
 * If fewer sessions than needed, remaining panels get null.
 */
export function createPresetLayout(preset: PresetLayout, sessionIds: (string | null)[]): PanelNode {
  const s = (i: number) => sessionIds[i] ?? null;

  switch (preset) {
    case 'single':
      return createLeaf(s(0));

    case 'side-by-side':
      return makeSplit('vertical', 0.5, createLeaf(s(0)), createLeaf(s(1)));

    case 'top-bottom':
      return makeSplit('horizontal', 0.5, createLeaf(s(0)), createLeaf(s(1)));

    case '2x2':
      return makeSplit('horizontal', 0.5,
        makeSplit('vertical', 0.5, createLeaf(s(0)), createLeaf(s(1))),
        makeSplit('vertical', 0.5, createLeaf(s(2)), createLeaf(s(3)))
      );

    case '1-plus-2':
      return makeSplit('vertical', 0.6,
        createLeaf(s(0)),
        makeSplit('horizontal', 0.5, createLeaf(s(1)), createLeaf(s(2)))
      );

    case '2-plus-1':
      return makeSplit('vertical', 0.4,
        makeSplit('horizontal', 0.5, createLeaf(s(0)), createLeaf(s(1))),
        createLeaf(s(2))
      );

    case '3-column':
      return makeSplit('vertical', 0.333,
        createLeaf(s(0)),
        makeSplit('vertical', 0.5, createLeaf(s(1)), createLeaf(s(2)))
      );

    case '3x3': {
      const makeRow = (offset: number) =>
        makeSplit('vertical', 0.333,
          createLeaf(s(offset)),
          makeSplit('vertical', 0.5, createLeaf(s(offset + 1)), createLeaf(s(offset + 2)))
        );
      return makeSplit('horizontal', 0.333,
        makeRow(0),
        makeSplit('horizontal', 0.5, makeRow(3), makeRow(6))
      );
    }

    case '4x4': {
      const makeRow = (offset: number) =>
        makeSplit('vertical', 0.5,
          makeSplit('vertical', 0.5, createLeaf(s(offset)), createLeaf(s(offset + 1))),
          makeSplit('vertical', 0.5, createLeaf(s(offset + 2)), createLeaf(s(offset + 3)))
        );
      return makeSplit('horizontal', 0.5,
        makeSplit('horizontal', 0.5, makeRow(0), makeRow(4)),
        makeSplit('horizontal', 0.5, makeRow(8), makeRow(12))
      );
    }

    default:
      return createLeaf(s(0));
  }
}

/**
 * Create a PanelLayout from a preset
 */
export function createLayout(preset: PresetLayout, sessionIds: (string | null)[]): PanelLayout {
  const root = createPresetLayout(preset, sessionIds);
  const firstLeaf = getLeaves(root)[0];
  return {
    root,
    activePanelId: firstLeaf.id,
  };
}

/**
 * Clone a layout tree, regenerating all panel IDs and clearing every session.
 * Used to save a layout's topology (splits + ratios) without its live sessions.
 */
export function clearSessions(root: PanelNode): PanelNode {
  if (root.type === 'leaf') return { type: 'leaf', id: panelId(), sessionId: null };
  return { ...root, id: panelId(), first: clearSessions(root.first), second: clearSessions(root.second) };
}

/**
 * Clone a layout tree, regenerating all panel IDs and assigning the given
 * session IDs to leaves in left-to-right order (extras left null). Used to
 * apply a saved topology to the currently open sessions.
 */
export function assignSessionsInOrder(root: PanelNode, sessionIds: (string | null)[]): PanelNode {
  let i = 0;
  const walk = (node: PanelNode): PanelNode => {
    if (node.type === 'leaf') return { type: 'leaf', id: panelId(), sessionId: sessionIds[i++] ?? null };
    return { ...node, id: panelId(), first: walk(node.first), second: walk(node.second) };
  };
  return walk(root);
}

// ---- Internal helpers ----

function makeSplit(direction: SplitDirection, ratio: number, first: PanelNode, second: PanelNode): PanelSplit {
  return { type: 'split', id: panelId(), direction, ratio, first, second };
}

/**
 * Map over all nodes in the tree, replacing nodes as returned by the callback.
 */
function mapNode(root: PanelNode, fn: (node: PanelNode) => PanelNode): PanelNode {
  const result = fn(root);
  if (result.type === 'split') {
    const newFirst = mapNode(result.first, fn);
    const newSecond = mapNode(result.second, fn);
    if (newFirst !== result.first || newSecond !== result.second) {
      return { ...result, first: newFirst, second: newSecond };
    }
  }
  return result;
}
