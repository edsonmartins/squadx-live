<p align="center">
  <img src="apps/web/public/logo.png" alt="SquadX Live Logo" width="120" />
</p>

<h1 align="center">SquadX Live</h1>

<p align="center">
  <strong>Collaborative Development Platform with AI Agents</strong><br>
  Screen sharing, remote control, real-time whiteboard, and AI agents working alongside your team.
</p>

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## Vision

SquadX Live transforms software development into a truly collaborative experience where humans and AI agents work together in real-time. Whether you're pair programming, designing architecture, or brainstorming solutions, SquadX Live provides the tools your squad needs.

---

## Features

### Live Sessions
- **Real-time screen sharing** - Low-latency WebRTC streaming
- **Remote control** - Mouse + keyboard with explicit host approval
- **Simultaneous input** - Host and viewer can control at the same time
- **Voice & video** - Integrated audio/video communication
- **Chat with mentions** - Team communication with @mentions

### Collaborative Whiteboard
- **Infinite canvas** - Powered by Excalidraw
- **Real-time sync** - CRDT-based collaboration via Yjs
- **Templates** - C4 diagrams, ERD, flowcharts, sprint boards
- **Component palette** - Drag-and-drop architecture components
- **Snapshot history** - Version control for your drawings

### AI Agents
- **MCP Server integration** - Agents connect via Model Context Protocol
- **Collaborative drawing** - AI can create diagrams and sketches
- **Permission system** - Agents must "raise hand" for drawing access
- **Visual presence** - See agent cursors and status in real-time
- **Action history** - Track what each agent has contributed

### Security
- **E2E encryption** - All media encrypted via WebRTC DTLS-SRTP
- **No server storage** - Screen data never touches our servers
- **Explicit consent** - Host must approve all control requests
- **Emergency revoke** - `Ctrl+Shift+Escape` instantly revokes control
- **Code signed** - All builds are signed and notarized

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 16, React 19, TypeScript |
| Desktop | Tauri 2.0 (Rust), Electron (legacy) |
| Whiteboard | Excalidraw, Yjs (CRDT) |
| Real-time | y-websocket, Supabase Realtime |
| Media | WebRTC (native P2P), LiveKit SFU |
| AI Integration | MCP Server, Anthropic SDK |
| Backend | Supabase (Auth, PostgreSQL, Storage) |
| Build | pnpm, Turborepo |

---

## Quick Start

### Install the Desktop App

<details>
<summary><strong>macOS</strong></summary>

```bash
# Homebrew (Recommended)
brew tap squadx/homebrew-squadx-live
brew install --cask squadx-live

# Or download directly from releases
```

</details>

<details>
<summary><strong>Windows</strong></summary>

```powershell
# WinGet
winget install SquadX.SquadXLive

# Scoop
scoop bucket add squadx https://github.com/squadx/scoop-squadx-live
scoop install squadx-live
```

</details>

<details>
<summary><strong>Linux</strong></summary>

```bash
# Debian/Ubuntu
curl -fsSL https://squadx.live/install.sh | bash

# AppImage
wget https://github.com/squadx/squadx-live/releases/latest/download/SquadX-Live.AppImage
chmod +x SquadX-Live.AppImage
./SquadX-Live.AppImage
```

</details>

### Join as a Viewer

Just open the session link in any modern browser. The viewer is a **Progressive Web App** - install it for quick access without downloading anything.

---

## Project Structure

```
squadx-live/
├── apps/
│   ├── web/                 # Next.js web app + PWA viewer
│   ├── desktop-tauri/       # Tauri 2.0 desktop app (Rust)
│   ├── desktop/             # Electron desktop app (legacy)
│   ├── mcp-whiteboard/      # MCP Server for AI whiteboard integration
│   └── installer/           # CLI installer service
├── packages/
│   └── shared-types/        # TypeScript type definitions
└── docs/                    # Technical documentation
```

---

## Development

### Prerequisites

- Node.js 24+
- pnpm 9+
- Rust (for Tauri)

### Setup

```bash
# Clone the repo
git clone https://github.com/squadx/squadx-live.git
cd squadx-live

# Install dependencies
pnpm install

# Start development
pnpm dev
```

### Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all apps in development mode |
| `pnpm dev:web` | Start web app only |
| `pnpm build` | Build all apps for production |
| `pnpm lint` | Run linting |
| `pnpm test` | Run tests |
| `pnpm typecheck` | Type check all packages |

---

## MCP Server for AI Agents

SquadX Live includes an MCP (Model Context Protocol) server that allows AI agents to participate in whiteboard sessions.

### Available Tools

| Tool | Description |
|------|-------------|
| `create_rectangle` | Draw rectangles on the canvas |
| `create_ellipse` | Draw circles and ellipses |
| `create_text` | Add text labels |
| `create_arrow` | Connect elements with arrows |
| `create_diagram_mermaid` | Generate diagrams from Mermaid syntax |
| `propose_architecture` | Create architecture diagrams |
| `apply_template` | Use predefined templates |
| `request_permission` | Ask host for drawing access |

### Starting the MCP Server

```bash
cd apps/mcp-whiteboard
pnpm build
pnpm start -- --session-id YOUR_SESSION_ID --board-id YOUR_BOARD_ID
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | System design and diagrams |
| [WebRTC Flow](docs/WEBRTC-FLOW.md) | Signaling and media flow |
| [Remote Control](docs/REMOTE-CONTROL.md) | Input injection system |
| [Security](docs/SECURITY.md) | Security model |
| [Whiteboard](docs/WHITEBOARD.md) | Collaborative canvas system |
| [MCP Integration](docs/MCP-INTEGRATION.md) | AI agent integration |

---

## Roadmap

### Current (v0.5)
- [x] Screen sharing with remote control
- [x] Multi-viewer support (P2P and SFU modes)
- [x] Session recording
- [x] Chat and annotations
- [x] Collaborative whiteboard (Excalidraw + Yjs)
- [x] MCP Server for AI agents
- [x] Agent permission system

### Next
- [ ] Voice/video integration
- [ ] Mobile viewer app
- [ ] File transfer
- [ ] Code snippets in whiteboard
- [ ] Agent task delegation

---

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Acknowledgments

- Inspired by [Screenhero](https://screenhero.com) (RIP)
- Built with [Tauri](https://tauri.app), [Next.js](https://nextjs.org), [Excalidraw](https://excalidraw.com), [Supabase](https://supabase.com)
- UI components from [shadcn/ui](https://ui.shadcn.com)
- Real-time sync powered by [Yjs](https://yjs.dev)

---

<p align="center">
  <strong>SquadX Live</strong> - Where humans and AI collaborate in real-time.
</p>
