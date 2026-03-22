# Deep Technical Research: OpenSandbox & WebVM

## Table of Contents
- [1. alibaba/OpenSandbox](#1-alibabaopensandbox)
- [2. leaningtech/webvm](#2-leaningtechwebvm)
- [3. Comparison Matrix](#3-comparison-matrix)

---

# 1. alibaba/OpenSandbox

**Stars:** ~9k | **Language mix:** Python 48%, Go 23%, C# 9%, TypeScript 7%, Kotlin 7% | **License:** Apache 2.0 | **CNCF Landscape listed**

## 1.1 Architecture Overview

OpenSandbox is a **server-side sandbox platform** with four distinct layers:

```
┌─────────────────────────────────────────────────────────┐
│  SDK Layer (Python, Java/Kotlin, TypeScript, C#/.NET)   │
│  ─ High-level async client abstractions                 │
├─────────────────────────────────────────────────────────┤
│  Specs Layer (OpenAPI)                                  │
│  ─ sandbox-lifecycle.yml   (control plane)              │
│  ─ execd-api.yaml          (data plane / in-sandbox)    │
│  ─ egress-api.yaml          (sidecar policy)            │
├─────────────────────────────────────────────────────────┤
│  Runtime Layer (FastAPI Server)                         │
│  ─ Docker Runtime  (production-ready)                   │
│  ─ Kubernetes Runtime (BatchSandbox / agent-sandbox)    │
│  ─ Ingress Gateway + Egress Sidecar                    │
├─────────────────────────────────────────────────────────┤
│  Sandbox Instance Layer                                │
│  ─ User Container (any OCI image)                      │
│  ─ execd (Go HTTP daemon, injected at runtime)         │
│  ─ Jupyter Server (for code interpretation)            │
│  ─ Egress Sidecar (optional, if networkPolicy set)     │
└─────────────────────────────────────────────────────────┘
```

### Key architectural decisions:
- **Protocol-first design**: All interactions defined by OpenAPI specs before implementation
- **Separation of control plane vs. data plane**: Lifecycle API (server) vs. Execution API (execd inside container)
- **Sidecar injection pattern**: execd binary injected into ANY OCI container at runtime — no image modification required
- **Pluggable runtimes**: Docker and Kubernetes are first-class; custom runtimes implementable via spec conformance

## 1.2 How Sandboxing / Isolation Works

### Container-level isolation
Each sandbox is an isolated OCI container with:
- **Resource quotas**: Kubernetes-style CPU/memory/GPU limits (`"cpu": "500m", "memory": "512Mi"`)
- **Capability dropping**: `AUDIT_WRITE`, `MKNOD`, `NET_ADMIN`, `NET_RAW`, `SYS_ADMIN`, `SYS_MODULE`, `SYS_PTRACE`, `SYS_TIME`, `SYS_TTY_CONFIG`
- **No new privileges**: `no_new_privileges = true`
- **PID limits**: Default 512 (fork bomb protection)
- **AppArmor/seccomp**: Configurable profiles
- **Optional read-only rootfs**

### Secure container runtimes (enhanced isolation)
Beyond runc, OpenSandbox supports:
| Runtime | Isolation Model | Config |
|---------|----------------|--------|
| **gVisor (runsc)** | User-space kernel — syscalls intercepted by Sentry | `type = "gvisor"` |
| **Kata Containers** | Lightweight VM per container | `type = "kata"` |
| **Firecracker microVM** | MicroVM (Kubernetes only) | `type = "firecracker"` |

### Network isolation
- **Bridge mode**: Isolated Docker networking with HTTP routing — containers don't share host network
- **Egress sidecar**: Shares network namespace with sandbox, DNS-level + nftables enforcement
- **IPv6 disabled** in shared namespace for consistent enforcement

### Authentication
- **Lifecycle API**: `OPEN-SANDBOX-API-KEY` header
- **Execution API (execd)**: `X-EXECD-ACCESS-TOKEN` header
- **Egress sidecar**: `OPENSANDBOX-EGRESS-AUTH` header

## 1.3 The execd Daemon (Core Innovation)

`execd` is the **in-sandbox execution agent** — a Go HTTP daemon built on Beego, injected into every sandbox container.

### Injection mechanism (Docker):
```
1. Pull execd image (opensandbox/execd:v1.0.x)
2. Extract binary from image to temp location
3. Volume mount execd binary + start.sh into target container
4. Override container entrypoint → start.sh
5. start.sh does:
   a. Start Jupyter Server on port 54321
   b. Start execd on port 44772
   c. exec user's original entrypoint
```

### execd package structure:
```
components/execd/
├── main.go                    # Entry point
├── pkg/flag/                  # CLI + env configuration
├── pkg/web/                   # HTTP layer
│   ├── controller/            # Handlers: files, code, commands, metrics
│   ├── model/                 # Request/response + SSE event types
│   └── router/                # Route registration
├── pkg/runtime/               # Dispatcher to Jupyter and shell executors
├── pkg/jupyter/               # Jupyter kernel client (WebSocket)
│   ├── execute/               # Result types, stream parsers
│   └── session/               # Session lifecycle
└── pkg/util/                  # Safe goroutine helpers, glob
```

### Performance benchmarks (localhost):
| Endpoint | Latency |
|----------|---------|
| `/ping` | < 1ms |
| `/files/info` | < 5ms |
| Code execution (Python) | 50-200ms |
| File upload (1MB) | 10-50ms |
| Metrics snapshot | < 10ms |
| Idle memory | ~50MB |
| Idle goroutines | ~15 |

## 1.4 API Design & SDK Patterns

### Two-API architecture:

**1. Lifecycle API** (server, port 8080):
```
POST   /v1/sandboxes                        # Create sandbox
GET    /v1/sandboxes                        # List (filter, paginate)
GET    /v1/sandboxes/{id}                   # Get details
DELETE /v1/sandboxes/{id}                   # Terminate
POST   /v1/sandboxes/{id}/pause             # Pause
POST   /v1/sandboxes/{id}/resume            # Resume
POST   /v1/sandboxes/{id}/renew-expiration  # Extend TTL
GET    /v1/sandboxes/{id}/endpoints/{port}  # Get public URL for a port
```

**2. Execution API** (execd inside sandbox, port 44772):
```
# Code Interpreter
POST   /code/context    # Create execution context (session)
POST   /code            # Execute code (SSE streaming)
DELETE /code            # Interrupt execution
GET    /code/contexts   # List contexts

# Commands
POST   /command         # Run shell command (SSE streaming)
DELETE /command         # Interrupt command
GET    /command/status/{session}  # Background command status
GET    /command/output/{session}  # Accumulated output

# Filesystem
GET    /files/info      # File metadata
POST   /files/upload    # Multipart upload
GET    /files/download  # Download (range requests)
POST   /files/mv        # Move/rename
DELETE /files           # Delete files
POST   /files/permissions  # chmod
GET    /files/search    # Glob search
POST   /files/replace   # Batch content replace

# Directories
POST   /directories     # mkdir -p
DELETE /directories     # rm -rf

# Monitoring
GET    /metrics         # CPU, memory, uptime snapshot
GET    /metrics/watch   # SSE stream (1s cadence)
```

### SDK design patterns:
- **Async-first**: All SDKs use async/await (Python: asyncio + httpx, Kotlin: coroutines)
- **Sync wrappers**: `SandboxSync` / `SandboxManagerSync` for simpler use cases
- **Context manager protocol**: `async with sandbox:` for automatic cleanup
- **SSE streaming**: Real-time output via Server-Sent Events with typed event handlers
- **Connection pooling**: Shared `httpx.AsyncHTTPTransport` across instances
- **Health check hooks**: Custom `health_check` callables for readiness detection
- **Structured errors**: `SandboxException` with error codes and request IDs

```python
# Canonical SDK usage pattern
sandbox = await Sandbox.create(
    "python:3.11",
    connection_config=config,
    timeout=timedelta(minutes=30),
    resource={"cpu": "2", "memory": "4Gi"},
    network_policy=NetworkPolicy(
        defaultAction="deny",
        egress=[NetworkRule(action="allow", target="pypi.org")],
    ),
)
async with sandbox:
    result = await sandbox.commands.run("echo hello")
    await sandbox.files.write_files([WriteEntry(path="/tmp/f.txt", data="content")])
    content = await sandbox.files.read_file("/tmp/f.txt")
await sandbox.kill()
```

## 1.5 Code Execution Model

### Jupyter-based execution:
```
SDK → POST /code → execd → WebSocket → Jupyter Server → Kernel (Python/Java/JS/TS/Go/Bash)
                      ↓
              SSE stream back to SDK
```

- **Sessions are stateful**: Variables persist across `POST /code` calls within the same context
- **Context lifecycle**: Create → Execute (N times) → Delete
- **Multi-language**: IPython, IJava, IJavaScript, ITypeScript, gophernotes, Bash kernel
- **Display data**: Multiple MIME types (text, HTML, images)
- **Execution metrics**: Timing, execution counts

### Shell-based execution:
```
SDK → POST /command → execd → os/exec → shell process
                        ↓
                  SSE stdout/stderr
```

- **Foreground mode**: Synchronous with streaming
- **Background mode**: Detached processes, poll via `/command/status/{session}`
- **Signal forwarding**: Process groups for proper cleanup
- **Working directory**: Configurable per command

## 1.6 File System Management

- **Full CRUD**: Read, write (multipart upload), delete, move/rename
- **Bulk operations**: Upload/download multiple files
- **Chunked transfer**: Resume support for large files
- **Glob search**: `GET /files/search?path=/tmp&pattern=*.py`
- **Permission management**: Unix chmod/chown (owner, group, mode)
- **Metadata**: Size, timestamps, permissions
- **Direct filesystem access**: execd reads/writes the container's filesystem directly

## 1.7 Networking Architecture

### Ingress (inbound to sandbox):

The **Ingress Gateway** (`components/ingress/`) is a Go-based HTTP/WebSocket reverse proxy for Kubernetes deployments:

**Routing modes:**
| Mode | Format | Use Case |
|------|--------|----------|
| **Header** | `OpenSandbox-Ingress-To: <sandbox-id>-<port>` | Default, flexible |
| **URI** | `/<sandbox-id>/<port>/<path>` | When headers can't be modified |
| **Wildcard** | `<sandbox-id>-<port>.example.com` | Domain-based routing |

- Watches Kubernetes CRs (BatchSandbox or AgentSandbox) via informer cache
- Auto-renew on access (OSEP-0009): publishes renew-intent events to Redis

### Egress (outbound from sandbox):

The **Egress Sidecar** (`components/egress/`) shares the sandbox's network namespace:

**Two-layer enforcement:**
1. **DNS Proxy (Layer 1)**: Runs on `127.0.0.1:15353`, iptables redirects all port 53 traffic. Returns NXDOMAIN for denied domains.
2. **nftables (Layer 2)**: `dns+nft` mode adds IP-level allow/deny rules. Dynamically adds resolved IPs with TTL.

**Features:**
- FQDN wildcards (`*.pypi.org`)
- IP/CIDR rules (in `dns+nft` mode)
- DoH/DoT blocking (ports 853, optionally 443)
- Runtime policy mutation via `PATCH /policy`
- Webhook on denied hostnames
- Graceful degradation (if `CAP_NET_ADMIN` missing, warns instead of crashing)

### Docker networking modes:
- **Host mode**: Container shares host network (single sandbox at a time, max performance)
- **Bridge mode**: Isolated networking with HTTP routing (required for egress sidecar)

## 1.8 Security Model

| Layer | Mechanism |
|-------|-----------|
| **API Authentication** | API key header for lifecycle; token header for execd |
| **Container isolation** | OCI containers with dropped capabilities |
| **Secure runtimes** | gVisor (user-space kernel), Kata (VM), Firecracker (microVM) |
| **Network policy** | DNS-based egress control + nftables |
| **Process limits** | PID cap (512), no new privileges |
| **Seccomp/AppArmor** | Configurable profiles |
| **TTL/auto-expiry** | Mandatory timeout with renewal API |
| **IPv6 disabled** | Consistent enforcement in egress namespace |
| **Privilege isolation** | Only egress sidecar gets `CAP_NET_ADMIN`; sandbox runs unprivileged |

## 1.9 Key Files and Roles

| Path | Role |
|------|------|
| `server/src/main.py` | FastAPI entrypoint |
| `server/src/api/` | HTTP request handling, validation |
| `server/src/services/` | Business logic for lifecycle operations |
| `server/src/config.py` | TOML configuration management |
| `components/execd/main.go` | execd entry point |
| `components/execd/pkg/web/` | HTTP controllers, SSE helpers |
| `components/execd/pkg/jupyter/` | Jupyter WebSocket client |
| `components/execd/pkg/runtime/` | Execution dispatcher |
| `components/ingress/main.go` | Ingress proxy entry point |
| `components/ingress/pkg/proxy/` | HTTP/WebSocket proxy logic |
| `components/egress/pkg/dnsproxy/` | DNS server + policy matching |
| `components/egress/pkg/nftables/` | nftables rule management |
| `specs/sandbox-lifecycle.yml` | Lifecycle OpenAPI spec |
| `specs/execd-api.yaml` | Execution OpenAPI spec |
| `specs/egress-api.yaml` | Egress sidecar OpenAPI spec |
| `sdks/sandbox/python/src/opensandbox/` | Python SDK source |
| `sdks/sandbox/kotlin/` | Kotlin/Java SDK |
| `sdks/sandbox/javascript/` | TypeScript SDK |
| `sdks/sandbox/csharp/` | C#/.NET SDK |
| `kubernetes/` | Helm charts, BatchSandbox CRD, controller |

## 1.10 Embedding in Web Apps

OpenSandbox is designed as a **backend service**. To embed:

1. **Run the server** (`opensandbox-server` or deploy on K8s)
2. **Use an SDK** from your web app's backend (Python, TypeScript, etc.)
3. **Create sandboxes** via REST API with any OCI image
4. **Stream output** via SSE to your frontend (commands, code execution)
5. **Access sandbox services** via ingress gateway endpoints (`GET /sandboxes/{id}/endpoints/{port}`)
6. **Embed sandbox UIs** (VNC for desktop, WebSocket for terminal) via port forwarding

The ingress gateway generates public URLs for any port exposed in a sandbox, enabling iframe embedding of VS Code Server, VNC desktops, web apps running inside sandboxes, etc.

---

# 2. leaningtech/webvm

**Stars:** ~16.6k | **Language mix:** JavaScript 44%, Svelte 43%, CSS 9% | **License:** Apache 2.0 (code); CheerpX has commercial restrictions

## 2.1 Architecture Overview

WebVM is a **fully client-side Linux virtual machine** running in the browser. It is a thin Svelte/SvelteKit application that wraps the **CheerpX** x86 virtualization engine.

```
┌──────────────────────────────────────────────────────────┐
│  Browser Tab                                              │
│  ┌────────────────────────────────────────────────────┐  │
│  │  SvelteKit App (WebVM)                              │  │
│  │  ├── WebVM.svelte (main orchestrator)              │  │
│  │  ├── xterm.js (terminal emulator)                  │  │
│  │  ├── SideBar.svelte (networking, CPU, disk panels) │  │
│  │  ├── AnthropicTab.svelte (Claude AI integration)   │  │
│  │  └── network.js (Tailscale integration)            │  │
│  ├────────────────────────────────────────────────────┤  │
│  │  CheerpX Engine (@leaningtech/cheerpx NPM)        │  │
│  │  ├── x86 → WebAssembly JIT compiler               │  │
│  │  ├── x86 interpreter (cold code path)              │  │
│  │  ├── Linux syscall emulator                        │  │
│  │  ├── Virtual block device layer                    │  │
│  │  ├── Ext2 filesystem driver                        │  │
│  │  └── Process management (fork, exec, signals)      │  │
│  ├────────────────────────────────────────────────────┤  │
│  │  Service Worker (cross-origin isolation)           │  │
│  │  ├── Injects COEP/COOP/CORP headers               │  │
│  │  └── Handles redirect URL preservation             │  │
│  ├────────────────────────────────────────────────────┤  │
│  │  Web APIs                                          │  │
│  │  ├── SharedArrayBuffer (requires cross-origin iso) │  │
│  │  ├── IndexedDB (persistent writable storage)       │  │
│  │  ├── WebSocket (disk image streaming, Tailscale)   │  │
│  │  └── WebAssembly (JIT compilation target)          │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Key architectural decisions:
- **100% client-side**: No server executes any code — everything runs in the browser
- **CheerpX is closed-source**: The npm package `@leaningtech/cheerpx` is a compiled binary, not open source
- **Immutable builds**: Every CheerpX version is a permanent, immutable CDN artifact
- **Config-driven**: `config_public_terminal.js` defines disk image, command, env — no code changes needed to customize

## 2.2 How Sandboxing / Isolation Works

### Browser sandbox model:
- **All execution is within the browser's sandbox** — JavaScript/WebAssembly isolation
- **No server-side attack surface** — code never reaches a remote machine
- **Same-origin policy**: CheerpX runs in the page's origin context
- **Cross-origin isolation**: Required via Service Worker headers (COEP + COOP + CORP)
- **SharedArrayBuffer**: Used for shared memory between the JIT engine's workers

### CheerpX virtualization:
- Implements a **Linux syscall interface** in WebAssembly — not hardware emulation
- User-space emulation only (no kernel-mode code)
- The "guest" x86 code is translated to WebAssembly at runtime by the JIT
- Self-modifying code and runtime code generation (like V8's JIT inside Node.js running inside CheerpX) are handled

### Key difference from server-side sandboxes:
The isolation boundary is the **browser itself**. There's no container, no VM, no gVisor — the browser's WebAssembly sandbox IS the security boundary. Malicious code running inside WebVM cannot escape the browser tab.

## 2.3 CheerpX Engine (Core Technology)

### Two-tier emulation:
1. **Interpreter**: Handles cold code paths, infrequently-executed instructions
2. **JIT compiler**: Hot code is compiled from x86 → WebAssembly on the fly

Both are implemented in C++ and compiled to JavaScript/WebAssembly via the [Cheerp](https://cheerp.io/) compiler (Leaning Technologies' C++-to-Web compiler).

### Key capabilities:
- Runs **unmodified 32-bit x86 Linux binaries** (i386 architecture)
- Handles self-modifying code and runtime code generation
- Can run complex software: Node.js (with V8 JIT), Python, GCC, Vim, etc.
- Process management: fork(), exec(), signals
- Linux ABI compatible syscall layer

### CheerpX API:

```javascript
// Core lifecycle
const cx = await CheerpX.Linux.create({
  mounts: [...],           // Filesystem configuration
  networkInterface: {...}, // Tailscale networking
});

// Execute binaries
await cx.run("/bin/bash", ["--login"], {
  env: ["HOME=/home/user", "TERM=xterm", ...],
  cwd: "/home/user",
  uid: 1000,
  gid: 1000,
});

// Console I/O
cx.setConsole(element);              // HTML element as terminal
cx.setCustomConsole(writeCb, cols, rows); // Custom I/O callbacks
cx.setKmsCanvas(canvas, w, h);       // Graphical display (KMS)
cx.setActivateConsole(vtSwitchCb);   // VT switching

// Event monitoring
cx.registerCallback("cpuActivity", cb);
cx.registerCallback("diskActivity", cb);
cx.registerCallback("diskLatency", cb);
cx.registerCallback("processCreated", cb);
```

## 2.4 File System Management

CheerpX implements a **layered virtual filesystem** using multiple device backends:

### Device types:

| Device | Class | Description |
|--------|-------|-------------|
| **CloudDevice** | `CheerpX.CloudDevice.create(url)` | Streams ext2 blocks on-demand via WebSocket from a remote server. Only fetches blocks that are actually accessed. |
| **HttpBytesDevice** | `CheerpX.HttpBytesDevice.create(url)` | Fetches ext2 blocks via HTTP range requests. For self-hosted images. |
| **IDBDevice** | `CheerpX.IDBDevice.create(name)` | IndexedDB-backed block storage. Persists writes across sessions. Used as cache AND writable layer. |
| **OverlayDevice** | `CheerpX.OverlayDevice.create(base, overlay)` | Union mount — reads go to overlay first, writes go to overlay. Base remains read-only. |
| **WebDevice** | `CheerpX.WebDevice.create(path)` | Maps HTTP server directory structure as read-only files. |
| **DataDevice** | `CheerpX.DataDevice.create()` | In-memory filesystem for JavaScript-provided data. |
| **GitHubDevice** | `CheerpX.GitHubDevice.create(url)` | Reads from GitHub releases (for CI/CD disk image distribution). |

### WebVM's mount configuration:
```javascript
var mountPoints = [
    {type: "ext2",   dev: overlayDevice,    path: "/"},         // Root FS (cloud + IDB overlay)
    {type: "dir",    dev: webDevice,        path: "/web"},      // HTTP server files
    {type: "dir",    dev: dataDevice,       path: "/data"},     // JS-injected data
    {type: "devs",                          path: "/dev"},      // Device files
    {type: "devpts",                        path: "/dev/pts"},  // Pseudo-terminals
    {type: "proc",                          path: "/proc"},     // Process info
    {type: "sys",                           path: "/sys"},      // Sysfs
    {type: "dir",    dev: documentsDevice,  path: "/home/user/documents"},  // User docs
];
```

### Key filesystem innovations:
- **Lazy block loading**: The ~2GB Debian image is NOT downloaded upfront. Blocks are fetched via WebSocket as the guest OS accesses them.
- **Persistent overlay**: Writes go to IndexedDB. On reload, your changes are still there.
- **Reset capability**: `blockCache.reset()` wipes the IDB overlay, reverting to pristine state.
- **Three-way storage**: Remote cloud image (read-only) → IDB cache/overlay (read-write) → OverlayDevice (union)

## 2.5 Networking Approach

### The fundamental constraint:
Browsers provide **no raw TCP/UDP socket API**. This is the biggest limitation for any in-browser VM.

### Solution: Tailscale VPN over WebSocket

WebVM integrates with [Tailscale](https://tailscale.com/), which uses WebSocket as a transport layer:

```javascript
// Configuration passed to CheerpX.Linux.create()
export const networkInterface = {
    authKey: authKey,           // Pre-auth key (optional)
    controlUrl: controlUrl,     // Self-hosted headscale URL (optional)
    loginUrlCb: loginUrlCb,     // Handles Tailscale login URL
    stateUpdateCb: stateUpdateCb,  // Connection state changes
    netmapUpdateCb: netmapUpdateCb, // Network topology updates
};
```

### Networking stack:
```
Guest Linux Process (e.g., curl)
        ↓ syscall
CheerpX syscall emulator
        ↓
lwIP TCP/IP stack (compiled to Wasm via Cheerp)
        ↓
Tailscale client (Wasm)
        ↓ WebSocket
Tailscale coordination server
        ↓ WireGuard (over WebSocket)
Exit Node → Internet
```

**Components:**
- **lwIP**: Lightweight TCP/IP stack, compiled for the Web via Cheerp
- **Tailscale Wasm module**: Handles VPN tunnel, WireGuard protocol
- **Exit Node**: A Tailscale device on your network that routes traffic to the internet

### Limitations:
- `ping` doesn't work (ICMP requires kernel-level features unavailable in browsers)
- Requires Tailscale account and exit node setup for internet access
- Local Tailscale network access works without exit node
- Alternative: Headscale (self-hosted) with CORS proxy

## 2.6 WebVM Application Architecture

### Build system:
- **SvelteKit** with Vite (static adapter — no server-side rendering needed in prod)
- **npm** for dependencies
- **GitHub Actions** for CI/CD (builds ext2 images from Dockerfiles, deploys to GitHub Pages)

### Key source files:

| File | Role |
|------|------|
| `src/lib/WebVM.svelte` | **Main orchestrator** — initializes xterm.js, CheerpX, wires up I/O, manages resize, process tracking |
| `src/lib/network.js` | Tailscale integration — auth flow, state management, IP display |
| `src/lib/anthropic.js` | Claude AI integration — API calls, tool use (terminal + screenshots) |
| `src/lib/activities.js` | CPU/disk activity tracking (writable Svelte stores) |
| `src/lib/messages.js` | Intro/error messages displayed in terminal |
| `src/lib/SideBar.svelte` | Collapsible sidebar with tabs (CPU, Disk, Networking, Claude, etc.) |
| `src/lib/NetworkingTab.svelte` | Tailscale connection UI |
| `src/lib/CpuTab.svelte` | CPU activity display |
| `src/lib/DiskTab.svelte` | Disk activity + latency display |
| `src/lib/AnthropicTab.svelte` | Claude AI chat interface |
| `src/routes/+page.svelte` | Terminal page — loads config, creates `<WebVM>` component |
| `src/routes/alpine/` | Alpine Linux graphical variant (i3 window manager) |
| `config_public_terminal.js` | Configuration: disk image URL, command, env, cwd |
| `config_public_alpine.js` | Alpine graphical environment config |
| `serviceWorker.js` | Cross-origin isolation (COEP/COOP/CORP headers) |
| `dockerfiles/debian_mini` | Dockerfile for the minimal Debian disk image |
| `dockerfiles/debian_large` | Dockerfile for the full Debian disk image |
| `nginx.conf` | Self-hosted server config |

### WebVM.svelte initialization flow:
```
1. onMount → initTerminal()
2. Create xterm.js Terminal
3. Print intro message
4. initCheerpX():
   a. Create block device (CloudDevice/HttpBytesDevice/GitHubDevice)
   b. Create IDBDevice cache
   c. Create OverlayDevice (block + cache)
   d. Create WebDevice, DataDevice
   e. Build mount point array
   f. CheerpX.Linux.create({ mounts, networkInterface })
   g. Register callbacks (CPU, disk, process)
   h. Wire custom console (xterm ↔ CheerpX)
   i. Set KMS canvas (if graphical mode)
   j. while(true) { await cx.run(cmd, args, opts) }  // restart shell on exit
```

### Configuration system:
```javascript
// config_public_terminal.js
export const diskImageUrl = "wss://disks.webvm.io/debian_large_20230522_5044875331_2.ext2";
export const diskImageType = "cloud";   // "cloud" | "bytes" | "github"
export const printIntro = true;
export const needsDisplay = false;      // true for graphical environments
export const cmd = "/bin/bash";
export const args = ["--login"];
export const opts = {
    env: ["HOME=/home/user", "TERM=xterm", "USER=user", "SHELL=/bin/bash", ...],
    cwd: "/home/user",
    uid: 1000,
    gid: 1000
};
```

## 2.7 Service Worker (Critical Infrastructure)

The Service Worker handles a fundamental browser requirement:

```javascript
// serviceWorker.js — core logic
async function handleFetch(request) {
    var r = await fetch(request);
    const newHeaders = new Headers(r.headers);
    
    // Required for SharedArrayBuffer (used by CheerpX's JIT)
    newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp");
    newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
    newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
    
    // Handle redirects (CheerpOS needs resolved URL)
    if (r.redirected === true) newHeaders.set("location", r.url);
    
    return new Response(r.redirected ? null : r.body, {
        headers: newHeaders,
        status: r.redirected ? 301 : r.status,
    });
}
```

**Why this matters:**
- `SharedArrayBuffer` requires cross-origin isolation
- Cross-origin isolation requires `COEP: require-corp` + `COOP: same-origin` headers
- The Service Worker intercepts ALL fetches and adds these headers
- This means WebVM works on ANY static hosting (GitHub Pages, etc.) without server config
- On first load, the SW registers and forces a page reload to take control

## 2.8 Custom Disk Images

WebVM supports building custom environments from Dockerfiles:

1. Write a Dockerfile (must use `i386` base image)
2. Build with `buildah` (cross-platform, i386 target)
3. Extract filesystem with `podman`
4. Create `ext2` image with `mkfs.ext2 -d`
5. Host the `.ext2` file (HTTP server, GitHub Releases, or Leaning Technologies' cloud)
6. Update config to point to your image

The GitHub Actions workflow automates this: push a Dockerfile, get a deployed WebVM.

## 2.9 Performance Considerations

### CheerpX performance model:
- **JIT compilation**: Hot x86 code compiled to optimized WebAssembly — approaches native performance for compute-bound code
- **Interpreter fallback**: Cold code runs through interpreter (slower but always works)
- **Self-modifying code**: Handled but expensive (cache invalidation)
- **Memory**: Limited by browser tab memory (typically 2-4GB depending on browser)

### Disk I/O:
- **Lazy loading**: Only accessed blocks are fetched — initial load is fast
- **WebSocket streaming**: Low-latency block delivery from cloud backend
- **IndexedDB caching**: Accessed blocks cached locally — second access is instant
- **Latency tracking**: Average block fetch latency exposed via callbacks (visible in UI)

### Startup time:
- CheerpX engine download: ~few MB from CDN
- Initial disk blocks: fetched on-demand (first `ls` triggers block reads)
- Full boot to bash prompt: typically 5-15 seconds depending on network

### Limitations:
- **32-bit only**: CheerpX currently supports i386 (32-bit x86)
- **No GPU access**: No graphics acceleration
- **Single-threaded emulation**: The JIT engine is single-threaded (browser threading model)
- **No raw sockets**: ICMP, raw TCP/UDP not available (browser limitation)
- **Memory ceiling**: Browser tab memory limits apply

## 2.10 Embedding in Web Apps

WebVM can be embedded via multiple approaches:

### 1. iframe embedding:
```html
<iframe src="https://webvm.io/" style="width:100%; height:600px;"></iframe>
```
**Caveat**: Cross-origin isolation (COEP/COOP) can break iframe embedding. The embedding page also needs cross-origin isolation headers, OR the iframe needs careful configuration.

### 2. CheerpX as a library:
```html
<script src="https://cxrtnc.leaningtech.com/1.2.8/cx.js"></script>
<script type="module">
    const cloudDevice = await CheerpX.CloudDevice.create("wss://...");
    const idbDevice = await CheerpX.IDBDevice.create("cache1");
    const overlay = await CheerpX.OverlayDevice.create(cloudDevice, idbDevice);
    
    const cx = await CheerpX.Linux.create({
        mounts: [
            { type: "ext2", path: "/", dev: overlay },
            { type: "devs", path: "/dev" },
        ],
    });
    cx.setConsole(document.getElementById("terminal"));
    await cx.run("/bin/bash", ["--login"], { env: [...], cwd: "/home/user" });
</script>
```

### 3. BrowserPod (commercial):
Leaning Technologies offers [BrowserPod](https://browserpod.io/) — a managed, embeddable CheerpX deployment.

### Requirements for embedding:
- Cross-origin isolation headers (COEP + COOP)
- HTTPS (except localhost)
- Modern browser with WebAssembly + SharedArrayBuffer support

---

# 3. Comparison Matrix

| Dimension | OpenSandbox | WebVM/CheerpX |
|-----------|-------------|---------------|
| **Execution location** | Server-side (Docker/K8s containers) | Client-side (browser, WebAssembly) |
| **Architecture** | x86-64 native in OCI containers | x86 (i386) emulated via JIT to Wasm |
| **Isolation model** | Linux containers + optional gVisor/Kata/Firecracker | Browser WebAssembly sandbox |
| **OS support** | Any Linux (full native) | Linux (user-space syscall emulation) |
| **Language support** | Any (native execution) | Any 32-bit x86 Linux binary |
| **Startup time** | Seconds (container pull + start) | 5-15s (engine + on-demand block fetch) |
| **Performance** | Native speed | Near-native for compute (JIT), I/O bottlenecked by network |
| **Filesystem** | Real container filesystem | Layered virtual FS (cloud + IDB + overlay) |
| **Networking** | Full Linux networking (+ egress control) | Tailscale VPN over WebSocket only |
| **Persistence** | Container lifetime (+ optional volumes) | IndexedDB (browser-local, resettable) |
| **Multi-user** | Yes (separate sandboxes per user) | No (single-user browser tab) |
| **Scaling** | Horizontal (K8s pods) | Client-side (scales with users, zero server cost) |
| **Cost model** | Server infrastructure costs | Free compute (client pays via their browser) |
| **Privacy** | Data on your servers | Data never leaves the browser |
| **Security boundary** | Container + optional secure runtime | Browser sandbox (Wasm) |
| **SDK/API** | Python, Java/Kotlin, TypeScript, C#/.NET SDKs | JavaScript API (CheerpX.Linux.create/run) |
| **Code execution** | Jupyter kernels (stateful) + shell commands | Direct binary execution via `cx.run()` |
| **Graphical support** | VNC (via sandbox port forwarding) | KMS canvas (native graphical output) |
| **Embeddability** | Backend service + port-forwarded iframes | Direct JavaScript library embed |
| **Open source** | Fully open source | WebVM open source; CheerpX is proprietary |
| **License** | Apache 2.0 | Apache 2.0 (code); CheerpX needs commercial license for org use |
| **Best for** | AI code execution, coding agents, CI/CD, batch processing | Interactive demos, tutorials, offline VMs, educational tools |
