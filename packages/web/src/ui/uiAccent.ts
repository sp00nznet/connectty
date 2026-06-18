// UI Accent palette — brand/primary color. Mirrors the desktop app.
// Each drives --accent, --accent-hover, and --accent-ink (color placed ON the accent).
export interface UiAccent {
  id: string;
  name: string;
  accent: string;
  hover: string;
  ink: string;
}

export const UI_ACCENTS: UiAccent[] = [
  { id: 'teal',   name: 'Teal',   accent: '#22c3a6', hover: '#3ed8bc', ink: '#042722' },
  { id: 'coral',  name: 'Coral',  accent: '#f15f7a', hover: '#ff7088', ink: '#1a0d10' },
  { id: 'azure',  name: 'Azure',  accent: '#4f9dff', hover: '#6fb2ff', ink: '#06101e' },
  { id: 'violet', name: 'Violet', accent: '#9b87fb', hover: '#b3a3ff', ink: '#160d2e' },
  { id: 'amber',  name: 'Amber',  accent: '#f0a93f', hover: '#ffbd5e', ink: '#2a1c05' },
];

const STORAGE_KEY = 'connectty-ui-accent';

export function getUiAccent(): string {
  return localStorage.getItem(STORAGE_KEY) || 'teal';
}

export function applyUiAccent(id: string): void {
  const a = UI_ACCENTS.find(x => x.id === id) || UI_ACCENTS[0];
  const root = document.documentElement;
  root.style.setProperty('--accent', a.accent);
  root.style.setProperty('--accent-hover', a.hover);
  root.style.setProperty('--accent-ink', a.ink);
  root.setAttribute('data-ui-accent', a.id);
  localStorage.setItem(STORAGE_KEY, a.id);
}
