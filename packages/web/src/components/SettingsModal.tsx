import { useState } from 'react';
import { UI_ACCENTS, getUiAccent, applyUiAccent } from '../ui/uiAccent';

interface SettingsModalProps {
  onClose: () => void;
}

/**
 * Lightweight settings panel for the web client. Currently hosts the UI Accent
 * picker (brand/primary color), mirroring the desktop Settings → Themes → UI Accent.
 */
export default function SettingsModal({ onClose }: SettingsModalProps) {
  const [accent, setAccent] = useState(getUiAccent());

  const choose = (id: string) => {
    setAccent(id);
    applyUiAccent(id);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Settings</h3>
          <button className="btn btn-icon" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          <label className="settings-eyebrow">UI Accent</label>
          <div className="ui-accent-row">
            {UI_ACCENTS.map(a => (
              <button
                key={a.id}
                type="button"
                className={`ui-accent-swatch ${accent === a.id ? 'active' : ''}`}
                style={{ background: a.accent }}
                onClick={() => choose(a.id)}
                title={a.name}
                aria-label={`${a.name} accent`}
              />
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
