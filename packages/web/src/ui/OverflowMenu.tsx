import { useState, useEffect, useRef } from 'react';

export interface OverflowItem {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  confirmLabel?: string;
}

/**
 * Row overflow (⋯) menu. Holds secondary/destructive actions so list rows stay
 * quiet. Destructive items reveal a red confirm step before firing.
 */
export default function OverflowMenu({ items }: { items: OverflowItem[] }) {
  const [open, setOpen] = useState(false);
  const [confirmIdx, setConfirmIdx] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirmIdx(null);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="overflow-wrap" ref={ref}>
      <button
        type="button"
        className="btn-overflow"
        onClick={() => { setOpen(o => !o); setConfirmIdx(null); }}
        title="More actions"
        aria-label="More actions"
      >
        ⋯
      </button>
      {open && (
        <div className="overflow-menu">
          {items.map((it, i) => {
            if (it.destructive && confirmIdx === i) {
              return (
                <button
                  key={i}
                  type="button"
                  className="overflow-menu-item confirm-delete"
                  onClick={() => { it.onClick(); setOpen(false); setConfirmIdx(null); }}
                >
                  {it.confirmLabel || `Confirm ${it.label.toLowerCase()}`}
                </button>
              );
            }
            return (
              <button
                key={i}
                type="button"
                className={`overflow-menu-item${it.destructive ? ' destructive' : ''}`}
                onClick={() => {
                  if (it.destructive) { setConfirmIdx(i); }
                  else { it.onClick(); setOpen(false); }
                }}
              >
                {it.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
