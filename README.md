<p align="center">
  <img src="apps/web/public/logo.png" alt="SquadX Live Logo" width="120" />
</p>

<h1 align="center">SquadX Live</h1>

<p align="center">
  <strong>Plataforma de Desenvolvimento Colaborativo com Agentes de IA</strong><br>
  Compartilhamento de tela, controle remoto, whiteboard em tempo real e agentes de IA trabalhando junto com sua equipe.
</p>

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## Visão

O SquadX Live transforma o desenvolvimento de software em uma experiência verdadeiramente colaborativa onde humanos e agentes de IA trabalham juntos em tempo real. Seja programando em par, projetando arquitetura ou fazendo brainstorming de soluções, o SquadX Live oferece as ferramentas que seu squad precisa.

---

## Funcionalidades

### Sessões ao Vivo
- **Compartilhamento de tela em tempo real** - Streaming WebRTC de baixa latência
- **Controle remoto** - Mouse + teclado com aprovação explícita do host
- **Entrada simultânea** - Host e viewer podem controlar ao mesmo tempo
- **Voz e vídeo** - Comunicação de áudio/vídeo integrada
- **Chat com menções** - Comunicação da equipe com @menções

### Whiteboard Colaborativo
- **Canvas infinito** - Powered by Excalidraw
- **Sincronização em tempo real** - Colaboração baseada em CRDT via Yjs
- **Templates** - Diagramas C4, ERD, fluxogramas, sprint boards
- **Paleta de componentes** - Componentes de arquitetura arrastar e soltar
- **Histórico de snapshots** - Controle de versão para seus desenhos

### Agentes de IA
- **Integração MCP Server** - Agentes conectam via Model Context Protocol
- **Desenho colaborativo** - IA pode criar diagramas e esboços
- **Sistema de permissões** - Agentes devem "levantar a mão" para acesso de desenho
- **Presença visual** - Veja cursores e status dos agentes em tempo real
- **Histórico de ações** - Acompanhe o que cada agente contribuiu

### Segurança
- **Criptografia E2E** - Toda mídia criptografada via WebRTC DTLS-SRTP
- **Sem armazenamento no servidor** - Dados de tela nunca tocam nossos servidores
- **Consentimento explícito** - Host deve aprovar todas as solicitações de controle
- **Revogação de emergência** - `Ctrl+Shift+Escape` revoga controle instantaneamente
- **Code signed** - Todos os builds são assinados e notarizados

---

## Stack Tecnológica

| Componente | Tecnologia |
|-----------|------------|
| Frontend | Next.js 16, React 19, TypeScript |
| Desktop | Tauri 2.0 (Rust), Electron (legado) |
| Whiteboard | Excalidraw, Yjs (CRDT) |
| Tempo real | y-websocket, Supabase Realtime |
| Mídia | WebRTC (P2P nativo), LiveKit SFU |
| Integração IA | MCP Server, Anthropic SDK |
| Backend | Supabase (Auth, PostgreSQL, Storage) |
| Build | pnpm, Turborepo |

---

## Início Rápido

### Instalar o App Desktop

<details>
<summary><strong>macOS</strong></summary>

```bash
# Homebrew (Recomendado)
brew tap squadx/homebrew-squadx-live
brew install --cask squadx-live

# Ou baixe diretamente dos releases
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

### Entrar como Viewer

Basta abrir o link da sessão em qualquer navegador moderno. O viewer é uma **Progressive Web App** - instale para acesso rápido sem baixar nada.

---

## Estrutura do Projeto

```
squadx-live/
├── apps/
│   ├── web/                 # App web Next.js + PWA viewer
│   ├── desktop-tauri/       # App desktop Tauri 2.0 (Rust)
│   ├── desktop/             # App desktop Electron (legado)
│   ├── mcp-whiteboard/      # MCP Server para integração IA whiteboard
│   └── installer/           # Serviço de instalação CLI
├── packages/
│   └── shared-types/        # Definições de tipos TypeScript
└── docs/                    # Documentação técnica
```

---

## Desenvolvimento

### Pré-requisitos

- Node.js 24+
- pnpm 9+
- Rust (para Tauri)

### Setup

```bash
# Clone o repositório
git clone https://github.com/squadx/squadx-live.git
cd squadx-live

# Instale as dependências
pnpm install

# Inicie o desenvolvimento
pnpm dev
```

### Comandos

| Comando | Descrição |
|---------|-----------|
| `pnpm dev` | Inicia todos os apps em modo desenvolvimento |
| `pnpm dev:web` | Inicia apenas o app web |
| `pnpm build` | Build de todos os apps para produção |
| `pnpm lint` | Executa linting |
| `pnpm test` | Executa testes |
| `pnpm typecheck` | Verifica tipos de todos os pacotes |

---

## MCP Server para Agentes de IA

O SquadX Live inclui um servidor MCP (Model Context Protocol) que permite que agentes de IA participem de sessões de whiteboard.

### Ferramentas Disponíveis

| Ferramenta | Descrição |
|------------|-----------|
| `create_rectangle` | Desenha retângulos no canvas |
| `create_ellipse` | Desenha círculos e elipses |
| `create_text` | Adiciona rótulos de texto |
| `create_arrow` | Conecta elementos com setas |
| `create_diagram_mermaid` | Gera diagramas a partir de sintaxe Mermaid |
| `propose_architecture` | Cria diagramas de arquitetura |
| `apply_template` | Usa templates predefinidos |
| `request_permission` | Solicita acesso de desenho ao host |

### Iniciando o MCP Server

```bash
cd apps/mcp-whiteboard
pnpm build
pnpm start -- --session-id SEU_SESSION_ID --board-id SEU_BOARD_ID
```

---

## Documentação

| Documento | Descrição |
|-----------|-----------|
| [Arquitetura](docs/ARCHITECTURE.md) | Design do sistema e diagramas |
| [Fluxo WebRTC](docs/WEBRTC-FLOW.md) | Sinalização e fluxo de mídia |
| [Controle Remoto](docs/REMOTE-CONTROL.md) | Sistema de injeção de entrada |
| [Segurança](docs/SECURITY.md) | Modelo de segurança |
| [Whiteboard](docs/WHITEBOARD.md) | Sistema de canvas colaborativo |
| [Integração MCP](docs/MCP-INTEGRATION.md) | Integração de agentes de IA |

---

## Roadmap

### Atual (v0.5)
- [x] Compartilhamento de tela com controle remoto
- [x] Suporte multi-viewer (modos P2P e SFU)
- [x] Gravação de sessão
- [x] Chat e anotações
- [x] Whiteboard colaborativo (Excalidraw + Yjs)
- [x] MCP Server para agentes de IA
- [x] Sistema de permissões para agentes

### Próximo
- [ ] Integração de voz/vídeo
- [ ] App viewer mobile
- [ ] Transferência de arquivos
- [ ] Snippets de código no whiteboard
- [ ] Delegação de tarefas para agentes

---

## Contribuindo

Contribuições são bem-vindas! Veja [CONTRIBUTING.md](CONTRIBUTING.md) para diretrizes.

1. Faça fork do repositório
2. Crie uma branch de feature
3. Faça suas alterações
4. Envie um pull request

---

## Licença

Licença MIT - veja [LICENSE](LICENSE) para detalhes.

---

## Agradecimentos

- Inspirado pelo [Screenhero](https://screenhero.com) (RIP)
- Construído com [Tauri](https://tauri.app), [Next.js](https://nextjs.org), [Excalidraw](https://excalidraw.com), [Supabase](https://supabase.com)
- Componentes de UI do [shadcn/ui](https://ui.shadcn.com)
- Sincronização em tempo real powered by [Yjs](https://yjs.dev)

---

<p align="center">
  <strong>SquadX Live</strong> - Onde humanos e IA colaboram em tempo real.
</p>
