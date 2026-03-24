# Sub-Applications

Ottomate embeds four full applications as persistent iframes within the main Next.js shell. They stay mounted forever — navigating away doesn't destroy their state.

---

## App Builder (bolt-diy)

**URL inside app:** `/computer/app-builder`  
**Dev port:** `5173`  
**Access via proxy:** `/bolt/:path*` → `localhost:5173`  
**Source directory:** `bolt-diy/`  
**Tech:** Remix + Vite + pnpm + WebContainers

### What it does
A full-stack AI app builder that runs Node.js/npm **entirely in the browser** via WebContainers (StackBlitz runtime). Describe an app and it scaffolds, installs dependencies, runs the dev server, and lets you iterate — all without leaving the browser.

### Starting it
```bash
# Manual
cd bolt-diy && pnpm run dev

# Via npm script
npm run dev:all

# Via pm2
pm2 start pm2.config.cjs
```

### Requirements
Requires WebContainer-compatible browser (Chrome/Edge recommended). Needs `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` on the parent frame — these are configured in `next.config.ts` and `middleware.ts`.

### Health check
The `BoltPersistentIframe` component `fetch`es `http://localhost:5173/` (no-cors) — status becomes `running` if it responds.

---

## Coding Companion (code-server)

**URL inside app:** `/computer/coding-companion`  
**Dev port:** `3100` → proxied to `3101`  
**Access via proxy:** `/kilocode/:path*` → `localhost:3100`  
**Proxy script:** `scripts/code-server-proxy.mjs`  
**Tech:** VS Code running in browser via code-server

### What it does
A full VS Code instance running in the browser. The proxy script handles path rewriting between the Next.js proxy layer (3100) and the actual code-server process (3101).

### Starting it
```bash
# The proxy (required)
node scripts/code-server-proxy.mjs

# code-server must already be running on port 3101
code-server --port 3101 --auth none

# Or via pm2 (starts proxy; you still need code-server installed)
pm2 start pm2.config.cjs
```

### Health check
Unlike other iframes, code-server uses a **server-side health check** at `/api/health/code-server` which fetches `localhost:3101` directly — this reliably detects "proxy up but code-server down" without CORS opaqueness. The iframe component polls this endpoint every 30 seconds while the Coding Companion tab is active.

---

## 3D Studio (Blockbench)

**URL inside app:** `/computer/3d-studio`  
**Dev port:** `3001`  
**Source directory:** `blockbench/`  
**Tech:** Custom JavaScript/Vite 3D model editor

### What it does
Blockbench is a free, open-source 3D model creator primarily designed for Minecraft-style voxel models but also supporting general polygon models. Running it embedded allows the AI agent to interact with and describe 3D model creation tasks.

### Starting it
```bash
# Manual
cd blockbench && npm run serve

# Or via pm2
pm2 start pm2.config.cjs
```

### Health check
The `BlenderPersistentIframe` component fetches `http://localhost:3001/` (no-cors).

---

## openDAW — Audio Studio

**URL inside app:** (Audio Studio page uses `AudioStudioEmbed` — the AI-powered React component, not this iframe)  
**Dev port:** `8080`  
**Source directory:** `opendaw/`  
**Tech:** npm/Vite browser-native DAW  
**iframe component:** `LmmsPersistentIframe` (defined but not mounted in layout by default)

### What it does
openDAW is an open-source browser-based Digital Audio Workstation. It runs natively in the browser and provides a full piano roll, mixer, effects chain, and MIDI sequencer.

### Starting it
```bash
cd opendaw && npm run dev:studio
# or
npm run dev:opendaw   # from project root
```

### Relationship to Audio Studio page
The `/computer/audio-studio` page renders the **AI-powered `AudioStudioEmbed`** component (MusicGen, OpenAI TTS, browser recording) — not the openDAW iframe. openDAW (`LmmsPersistentIframe`) is a separate embedded app available at port 8080 for direct DAW access.

---

## pm2 Process Table

| Process name | Command | Port | Directory |
|---|---|---|---|
| `next` | `next dev` | 3000 | project root |
| `bolt-diy` | `pnpm run dev` | 5173 | `bolt-diy/` |
| `blockbench` | `node ./build.js --target=web --serve` | 3001 | `blockbench/` |
| `opendaw` | `npm run dev:studio` | 8080 | `opendaw/` |
| `code-server-proxy` | `node scripts/code-server-proxy.mjs` | 3100 | project root |

All processes have `autorestart: true`, `max_restarts: 10`, and `restart_delay` of 2–3 seconds.

```bash
# Start all
pm2 start pm2.config.cjs

# Status
pm2 status

# Live logs
pm2 logs

# Dashboard
pm2 monit

# Persist across reboot
pm2 save && pm2 startup
```
