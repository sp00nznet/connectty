# Screenshot harness

Regenerates the marketing screenshots in `screen/` from **fake data** — no real
hosts, credentials, or cloud accounts. It renders the actual Connectty React UI
(the same `App.tsx` the Tauri app ships) against a mock `window.connectty`, then
drives it into each documented state in a headless Electron window and captures
a PNG per state.

## How it works

| File | Role |
|:-----|:-----|
| `mock.ts` | A fake `window.connectty` backed by believable fixtures. Streams canned terminal output through the `onEvent` callbacks so xterm renders a real-looking session. |
| `main.tsx` | Installs the mock, then mounts the real renderer (`../src/renderer/App`). |
| `vite.config.ts` | Builds the above to `../dist/screenshot` as static files. |
| `capture.cjs` | Loads that bundle in Electron, drives the UI (synthetic key/click/context-menu events + the command palette), and writes `screen/*.png`. |

The capture host is Chromium (Electron) acting purely as a headless renderer —
the pixels are the same DOM the Tauri WebView shows.

## Run

```bash
# from packages/desktop
npx vite build --config screenshot/vite.config.ts
ELECTRON_DISABLE_SANDBOX=1 npx electron screenshot/capture.cjs        # all shots
ELECTRON_DISABLE_SANDBOX=1 npx electron screenshot/capture.cjs SSH    # a subset
```

Output goes to `../../screen/` by default, or `$CONNECTTY_SHOT_OUT` if set.

On a headless/Wayland box you may also need `GDK_BACKEND=x11`. If Electron's
binary is missing, run `node ../../node_modules/electron/install.js`.

## Adding a shot

Add an `async NAME(win)` entry to the `shots` map in `capture.cjs` using the
`palette()`, `clickButtonByText()`, `contextMenu()`, `typeInto()`, and
`capture()` helpers, and add any fixtures it needs to `mock.ts`.

> The reusable engine behind this lives as a standalone tool — see
> [domshot](https://github.com/sp00nznet/domshot).
