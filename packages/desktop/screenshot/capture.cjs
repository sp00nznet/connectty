/**
 * Headless screenshot harness for Connectty.
 *
 * Loads the mock-data bundle (screenshot/main.tsx -> dist/screenshot) in an
 * Electron window, drives the real UI into each documented state by dispatching
 * synthetic DOM events, and writes a PNG per state with capturePage().
 *
 * Build the bundle first:
 *   npx vite build --config screenshot/vite.config.ts
 * Then:
 *   npx electron screenshot/capture.cjs [shotName ...]
 *
 * With no args it runs every shot. Pass shot names to run a subset.
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.commandLine.appendSwitch('in-process-gpu');
// Electron's Wayland surface path SIGTRAPs in this environment; pin to X11
// (Xwayland at :0), which gives capturePage() a real backing surface.
app.commandLine.appendSwitch('ozone-platform', 'x11');

const DIST = path.join(__dirname, '..', 'dist', 'screenshot', 'index.html');
const OUT = process.env.CONNECTTY_SHOT_OUT
  ? path.resolve(process.env.CONNECTTY_SHOT_OUT)
  : path.join(__dirname, '..', '..', '..', 'screen');
const W = 1440;
const H = 900;

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const DEBUG = process.argv.includes('--debug');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Run JS in the page and return its (serializable) result. */
const run = (win, js) => win.webContents.executeJavaScript(js, true);

/** Dispatch a window-level keydown (drives App.tsx global shortcuts). */
function key(win, k, { ctrl = false, shift = false, alt = false } = {}) {
  return run(
    win,
    `window.dispatchEvent(new KeyboardEvent('keydown', {key:${JSON.stringify(k)},ctrlKey:${ctrl},shiftKey:${shift},altKey:${alt},bubbles:true}));`
  );
}

/** Click a <button> by its trimmed visible text. */
function clickButtonByText(win, text) {
  return run(
    win,
    `(() => {
      const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === ${JSON.stringify(text)});
      if (b) { b.click(); return true; }
      return false;
    })()`
  );
}

/** Click the first element matching selector whose text contains `text`. */
function clickByText(win, selector, text) {
  return run(
    win,
    `(() => {
      const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(x => (x.textContent||'').includes(${JSON.stringify(text)}));
      if (el) { el.click(); return true; }
      return false;
    })()`
  );
}

/** Fire a right-click on the idx-th element matching selector (opens context menus). */
function contextMenu(win, selector, idx = 0) {
  return run(
    win,
    `(() => {
      const el = document.querySelectorAll(${JSON.stringify(selector)})[${idx}];
      if (!el) return false;
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent('contextmenu', {bubbles:true, clientX: Math.round(r.left+12), clientY: Math.round(r.bottom-8)}));
      return true;
    })()`
  );
}

/** Set a controlled input's value (React-aware) and optionally press Enter. */
function typeInto(win, selector, value, enter = false) {
  return run(
    win,
    `(() => {
      const i = document.querySelector(${JSON.stringify(selector)});
      if (!i) return false;
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      set.call(i, ${JSON.stringify(value)});
      i.dispatchEvent(new Event('input', {bubbles:true}));
      ${enter ? `i.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true}));` : ''}
      return true;
    })()`
  );
}

/** Open the command palette, type a query, and run the top match via Enter. */
async function palette(win, query) {
  await key(win, 'k', { ctrl: true, shift: true });
  await wait(220);
  const setQ = await run(
    win,
    `(() => {
      const i = document.querySelector('.command-palette-input');
      if (!i) return false;
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      set.call(i, ${JSON.stringify(query)});
      i.dispatchEvent(new Event('input', {bubbles:true}));
      return true;
    })()`
  );
  if (!setQ) throw new Error('command palette did not open');
  await wait(180);
  await run(
    win,
    `document.querySelector('.command-palette-input').dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true}));`
  );
  await wait(120);
}

/** Reload to a clean slate and wait for the app to finish its initial load. */
async function reset(win) {
  win.webContents.reload();
  await new Promise((r) => win.webContents.once('did-finish-load', r));
  // Wait for React mount + loadData() to populate the sidebar.
  for (let i = 0; i < 60; i++) {
    const ready = await run(
      win,
      `!!document.querySelector('.connection-item, .sidebar-section, [class*="connection"]')`
    ).catch(() => false);
    if (ready) break;
    await wait(100);
  }
  await wait(400);
}

async function capture(win, name) {
  const img = await win.webContents.capturePage();
  const file = path.join(OUT, `${name}.png`);
  fs.writeFileSync(file, img.toPNG());
  console.log('  ✓', name, '->', path.relative(process.cwd(), file));
}

// --------------------------------------------------------------------------
// Shots
// --------------------------------------------------------------------------

const shots = {
  async SSH(win) {
    await palette(win, 'connect web-01');
    await wait(2800); // let the fake terminal stream render + the toast fade
    await capture(win, 'SSH');
  },

  async MultipleShell(win) {
    await palette(win, 'connect web-01');
    await wait(900);
    await palette(win, 'shell bash');
    await wait(500);
    await palette(win, 'connect rack-console');
    await wait(500);
    await palette(win, 'sftp api-01');
    await wait(700);
    await palette(win, 'connect web-01'); // make a terminal the active tab
    await wait(1300);
    await capture(win, 'MultipleShell');
  },

  async WelcomeScreen(win) {
    await wait(400); // fresh load already shows the welcome screen
    await capture(win, 'WelcomeScreen');
  },

  async CredentialManager(win) {
    await clickButtonByText(win, 'Credentials');
    await wait(700);
    await capture(win, 'CredentialManager');
  },

  async Providers(win) {
    await clickButtonByText(win, 'Providers');
    await wait(700);
    await capture(win, 'Providers');
  },

  async RepeatedActions(win) {
    await clickButtonByText(win, 'Bulk Run');
    await wait(700);
    // Fill the command box so the modal reads as mid-task.
    await run(win, `(() => {
      const t = document.querySelector('.modal-overlay textarea');
      if (!t) return;
      const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      set.call(t, 'sudo systemctl restart nginx && systemctl is-active nginx');
      t.dispatchEvent(new Event('input', {bubbles:true}));
    })()`);
    await wait(300);
    await capture(win, 'RepeatedActions');
  },

  async Themes(win) {
    await run(win, `(() => {
      const b = document.querySelector('.sidebar-settings-btn')
        || [...document.querySelectorAll('button')].find(x => x.textContent.trim().startsWith('Settings'));
      if (b) b.click();
    })()`);
    await wait(600);
    // Switch to the Themes tab inside the settings modal (best-effort).
    await run(
      win,
      `(() => {
        const el = [...document.querySelectorAll('button, .settings-tab, [role="tab"], a')]
          .find(x => /theme/i.test(x.textContent || ''));
        if (el) el.click();
      })()`
    );
    await wait(600);
    await capture(win, 'Themes');
  },

  async CommandPalette(win) {
    await key(win, 'k', { ctrl: true, shift: true });
    await wait(350);
    await capture(win, 'CommandPalette');
  },

  async AiSessions(win) {
    await key(win, 'a', { ctrl: true, shift: true });
    await wait(700);
    await capture(win, 'AiSessions');
  },

  async AiSearch(win) {
    await key(win, 'y', { ctrl: true, shift: true });
    await wait(350);
    await typeInto(win, '.ai-prompt-search .command-palette-input', 'screenshot harness', true);
    await wait(600);
    await capture(win, 'AiSearch');
  },

  async SFTP(win) {
    await palette(win, 'sftp web-01');
    await wait(1400);
    await capture(win, 'SFTP-FXP');
  },

  async Import(win) {
    await clickButtonByText(win, 'Providers');
    await wait(700);
    await clickButtonByText(win, 'Import Hosts'); // first provider's discover -> host selection
    await wait(1100);
    // Tick every checkbox in the modal so the import looks active.
    await run(win, `document.querySelectorAll('.modal-overlay input[type=checkbox]').forEach(c => { if (!c.checked) c.click(); });`);
    await wait(300);
    await capture(win, 'Import');
  },

  async TabGroups(win) {
    await palette(win, 'connect web-01');
    await wait(900);
    await palette(win, 'connect web-02');
    await wait(700);
    await palette(win, 'connect pg-primary');
    await wait(900);
    // Create a "Production" group from the first tab.
    await contextMenu(win, '.session-tab', 0);
    await wait(250);
    await clickByText(win, '.tab-context-menu-item', 'New Tab Group');
    await wait(350);
    await typeInto(win, '.rename-tab-modal input', 'Production', true);
    await wait(400);
    // Add the second tab to the same group.
    await contextMenu(win, '.session-tab', 1);
    await wait(250);
    await clickByText(win, '.tab-context-menu-item', 'Add to: Production');
    await wait(400);
    await capture(win, 'TabGroups');
  },

  async PanelMode(win) {
    await palette(win, 'connect web-01');
    await wait(900);
    await palette(win, 'connect web-02');
    await wait(900);
    // Toggle panel mode, then split so two panes show (active pane is ringed).
    await key(win, 't', { ctrl: true, shift: true });
    await wait(500);
    await key(win, '\\', { ctrl: true, shift: true });
    await wait(900);
    await capture(win, 'PanelMode');
  },

  async LayoutPicker(win) {
    await palette(win, 'connect web-01');
    await wait(700);
    await key(win, 't', { ctrl: true, shift: true });
    await wait(400);
    await key(win, 'p', { ctrl: true, shift: true });
    await wait(450);
    await capture(win, 'LayoutPicker');
  },

  async CollapsedRail(win) {
    await wait(300);
    await key(win, 'b', { ctrl: true });
    await wait(500);
    await capture(win, 'CollapsedRail');
  },
};

// --------------------------------------------------------------------------

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    width: W,
    height: H,
    show: true,
    frame: false,
    backgroundColor: '#0b0c11',
    webPreferences: { backgroundThrottling: false },
  });
  win.webContents.setBackgroundThrottling(false);
  await win.loadFile(DIST);

  const names = only.length ? only : Object.keys(shots);
  console.log('Capturing:', names.join(', '));
  for (const name of names) {
    const fn = shots[name];
    if (!fn) {
      console.log('  ? unknown shot:', name);
      continue;
    }
    try {
      await reset(win);
      await fn(win);
    } catch (e) {
      console.error('  ✗', name, '-', e.message);
    }
  }

  win.destroy();
  app.quit();
}

app.whenReady().then(main);
