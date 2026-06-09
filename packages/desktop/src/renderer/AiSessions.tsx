import React, { useMemo, useState } from 'react';

export interface AiSession {
  id: string;
  agent: string; // "claude" | "copilot"
  title: string;
  project: string;
  cwd: string;
  gitBranch?: string | null;
  messageCount: number;
  toolCount: number;
  lastPrompt?: string | null;
  lastActivity?: string | null;
  lastActivityMs: number;
  status: string; // "active" | "idle"
  filePath: string;
}

export interface AiTranscriptEntry {
  role: string; // "user" | "assistant"
  text: string;
  timestamp?: string | null;
}

export interface AiPromptMatch {
  sessionId: string;
  title: string;
  project: string;
  cwd: string;
  agent: string;
  filePath: string;
  snippet: string;
  timestamp?: string | null;
}

function relativeTime(ms: number): string {
  if (!ms) return '';
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Multi-term AND search across a session's visible/searchable fields. */
function matches(s: AiSession, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = `${s.title} ${s.project} ${s.gitBranch || ''} ${s.lastPrompt || ''}`.toLowerCase();
  return q.split(/\s+/).every(t => hay.includes(t));
}

interface PanelProps {
  sessions: AiSession[];
  onResume: (s: AiSession) => void;
  onOpenTranscript: (s: AiSession) => void;
  onClose: () => void;
}

export function AiSessionsPanel({ sessions, onResume, onOpenTranscript, onClose }: PanelProps) {
  const [filter, setFilter] = useState<'all' | 'claude' | 'copilot'>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(
    () => sessions.filter(s => (filter === 'all' || s.agent === filter) && matches(s, query)),
    [sessions, filter, query],
  );

  return (
    <div className="ai-panel">
      <div className="ai-panel-header">
        <h3>AI Sessions</h3>
        <button className="close-btn" onClick={onClose} title="Close (Ctrl+Shift+A)">×</button>
      </div>
      <div className="ai-panel-filters">
        {(['all', 'claude', 'copilot'] as const).map(f => (
          <button
            key={f}
            className={`ai-panel-filter ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f === 'claude' ? 'Claude' : 'Copilot'}
          </button>
        ))}
      </div>
      <input
        className="ai-panel-search"
        placeholder="Search title, project, branch, prompt…"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      <div className="ai-panel-list">
        {filtered.length === 0 ? (
          <div className="ai-panel-empty">No sessions</div>
        ) : (
          filtered.map(s => (
            <div className="ai-session-row" key={s.id + s.filePath}>
              <span
                className={`status-dot ${s.status === 'active' ? 'connected' : 'closed'}`}
                title={s.status === 'active' ? 'Active' : 'Idle'}
              />
              <div
                className="ai-session-main"
                onClick={() => onOpenTranscript(s)}
                title="View transcript"
              >
                <div className="ai-session-title">{s.title}</div>
                <div className="ai-session-meta">
                  <span className="ai-session-project">{s.project}</span>
                  {s.gitBranch && <span className="ai-session-branch">⎇ {s.gitBranch}</span>}
                  <span>{s.messageCount} msg</span>
                  {s.toolCount > 0 && <span>{s.toolCount} tools</span>}
                  <span className="ai-session-time">{relativeTime(s.lastActivityMs)}</span>
                </div>
              </div>
              <button
                className="ai-session-resume"
                onClick={() => onResume(s)}
                title="Resume in a new shell"
              >
                Resume
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

interface PromptSearchProps {
  onSearch: (query: string) => Promise<AiPromptMatch[]>;
  onResume: (m: AiPromptMatch) => void;
  onClose: () => void;
}

/** Cross-session prompt search (Ctrl+Shift+Y). Searches prompt text across
 *  every session log; clicking a result resumes that session. */
export function AiPromptSearchModal({ onSearch, onResume, onClose }: PromptSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AiPromptMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const run = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    try {
      setResults(await onSearch(q));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
      setSearched(true);
    }
  };

  return (
    <div className="modal-overlay command-palette-overlay" onClick={onClose}>
      <div className="command-palette ai-prompt-search" onClick={e => e.stopPropagation()}>
        <input
          className="command-palette-input"
          placeholder="Search prompts across all sessions (Enter to search; supports multiple terms)…"
          value={query}
          autoFocus
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') run();
            else if (e.key === 'Escape') onClose();
          }}
        />
        <div className="command-palette-list">
          {searching ? (
            <div className="command-palette-empty">Searching…</div>
          ) : results.length === 0 ? (
            <div className="command-palette-empty">{searched ? 'No matches' : 'Type a query and press Enter'}</div>
          ) : (
            results.map((m, i) => (
              <div
                key={m.filePath + i}
                className="ai-prompt-result"
                onMouseDown={e => { e.preventDefault(); onClose(); onResume(m); }}
                title="Resume this session"
              >
                <div className="ai-prompt-snippet">{m.snippet}</div>
                <div className="ai-prompt-meta">
                  <span className="ai-session-project">{m.project}</span>
                  <span>{m.title}</span>
                  {m.timestamp && <span>{new Date(m.timestamp).toLocaleString()}</span>}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

interface TranscriptProps {
  session: AiSession;
  entries: AiTranscriptEntry[];
  loading: boolean;
  onClose: () => void;
}

export function AiTranscriptModal({ session, entries, loading, onClose }: TranscriptProps) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return entries;
    return entries.filter(e => e.text.toLowerCase().includes(query));
  }, [entries, q]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ai-transcript-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{session.title}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="ai-transcript-search">
          <input
            className="form-control"
            placeholder="Find in transcript…"
            value={q}
            onChange={e => setQ(e.target.value)}
            autoFocus
          />
        </div>
        <div className="ai-transcript-body">
          {loading ? (
            <div className="ai-panel-empty">Loading transcript…</div>
          ) : shown.length === 0 ? (
            <div className="ai-panel-empty">No messages</div>
          ) : (
            shown.map((e, i) => (
              <div className={`ai-transcript-entry ${e.role}`} key={i}>
                <div className="ai-transcript-role">{e.role === 'user' ? 'You' : 'Claude'}</div>
                <div className="ai-transcript-text">{e.text}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
