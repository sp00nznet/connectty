import React, { useEffect, useMemo, useRef, useState } from 'react';

export interface PaletteCommand {
  id: string;
  /** Primary label shown in the list. */
  title: string;
  /** Optional category/group label shown dimmed before the title. */
  category?: string;
  /** Optional right-aligned hint (e.g. a keyboard shortcut or hostname). */
  hint?: string;
  /** Extra space-separated search terms that aren't shown. */
  keywords?: string;
  run: () => void;
}

interface CommandPaletteProps {
  commands: PaletteCommand[];
  onClose: () => void;
}

/**
 * A VS Code-style command palette overlay. Fuzzy-ish substring search across
 * title/category/hint/keywords with multi-term AND matching, full keyboard
 * navigation (↑/↓/Enter/Esc). Opened via Ctrl+Shift+K from App.tsx.
 */
export function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    const terms = q.split(/\s+/);
    return commands.filter(c => {
      const hay = `${c.category || ''} ${c.title} ${c.hint || ''} ${c.keywords || ''}`.toLowerCase();
      return terms.every(t => hay.includes(t));
    });
  }, [query, commands]);

  // Reset selection whenever the result set changes.
  useEffect(() => {
    setSelected(0);
  }, [query]);

  // Keep the selected row scrolled into view.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.children[selected] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected, filtered]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected(s => (filtered.length ? Math.min(s + 1, filtered.length - 1) : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected(s => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[selected];
      if (cmd) {
        onClose();
        cmd.run();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="modal-overlay command-palette-overlay" onClick={onClose}>
      <div className="command-palette" onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="command-palette-input"
          placeholder="Type a command, host, or shell…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="command-palette-list" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="command-palette-empty">No matching commands</div>
          ) : (
            filtered.map((c, i) => (
              <div
                key={c.id}
                className={`command-palette-item ${i === selected ? 'selected' : ''}`}
                onMouseEnter={() => setSelected(i)}
                onMouseDown={e => {
                  // mousedown (not click) so the input doesn't lose focus first
                  e.preventDefault();
                  onClose();
                  c.run();
                }}
              >
                <span className="command-palette-item-label">
                  {c.category && <span className="command-palette-item-cat">{c.category}</span>}
                  {c.title}
                </span>
                {c.hint && <span className="command-palette-item-hint">{c.hint}</span>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
