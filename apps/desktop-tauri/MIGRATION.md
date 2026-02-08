# PairUX Desktop - Migração Electron → Tauri

## Resumo Executivo

Este documento descreve o progresso da migração do aplicativo desktop PairUX de **Electron** para **Tauri 2.0** com backend Rust. O objetivo é reduzir o tamanho do binário (~90%), consumo de memória (~84%) e tempo de startup (~88%).

---

## Status Atual

| Componente | Status | Observações |
|------------|--------|-------------|
| Estrutura do projeto | ✅ Completo | `apps/desktop-tauri/` criado |
| Código Rust (backend) | ✅ Compila | Todos os módulos implementados |
| Frontend React | ✅ Completo | UI básica funcional |
| Build completo | ⏸️ Pendente | Requer macOS 11+ (Big Sur) |

---

## O Que Foi Criado

### Estrutura de Diretórios

```
apps/desktop-tauri/
├── package.json                 # Configuração npm/pnpm
├── vite.config.ts               # Build tool (Vite 6)
├── tsconfig.json                # TypeScript config
├── tsconfig.node.json           # TypeScript config (Node)
├── tailwind.config.js           # Tailwind CSS
├── postcss.config.js            # PostCSS
├── index.html                   # Entry point HTML
├── dist/                        # Build output (placeholder)
├── public/
│   └── pairux.svg               # Logo
├── src/                         # Frontend React
│   ├── main.tsx                 # Entry point React
│   ├── App.tsx                  # Componente raiz com rotas
│   ├── index.css                # Estilos globais + Tailwind
│   └── components/
│       ├── auth/
│       │   └── Login.tsx        # Tela de login
│       ├── Dashboard.tsx        # Dashboard principal
│       └── session/
│           ├── HostSession.tsx  # UI do host (streaming)
│           └── ViewSession.tsx  # UI do viewer
└── src-tauri/                   # Backend Rust
    ├── Cargo.toml               # Dependências Rust
    ├── tauri.conf.json          # Configuração Tauri
    ├── build.rs                 # Script de build
    ├── icons/
    │   └── icon.png             # Ícone da aplicação (RGBA)
    └── src/
        ├── main.rs              # Entry point binário
        ├── lib.rs               # Biblioteca principal + setup Tauri
        ├── error.rs             # Tipos de erro customizados
        ├── state.rs             # Estado global da aplicação
        ├── capture.rs           # Captura de tela (xcap)
        ├── input.rs             # Injeção de input (enigo)
        └── commands/
            ├── mod.rs           # Módulo de comandos
            ├── auth.rs          # Login/logout/session
            ├── capture.rs       # get_sources, start/stop_capture
            ├── input.rs         # inject_mouse/keyboard_event
            └── session.rs       # create/join/end_session
```

---

## Dependências Rust (Cargo.toml)

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
thiserror = "1"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }

# Screen capture
xcap = "0.8"

# Input injection
enigo = { version = "0.2", features = ["serde"] }

# Secure storage
keyring = "3"

# Utilities
uuid = { version = "1", features = ["v4"] }
image = "0.25"

[target.'cfg(target_os = "macos")'.dependencies]
cocoa = "0.26"
objc = "0.2"
```

---

## Dependências Frontend (package.json)

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.47.0",
    "@tauri-apps/api": "^2.0.0",
    "@tauri-apps/plugin-shell": "^2.0.0",
    "lucide-react": "^0.468.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.1.0",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
```

---

## Comandos Tauri Implementados

### Autenticação
| Comando | Parâmetros | Descrição |
|---------|------------|-----------|
| `login` | email, access_token, refresh_token, user_id | Salva tokens no keychain |
| `logout` | - | Limpa tokens e estado |
| `get_session` | - | Recupera sessão salva |

### Captura de Tela
| Comando | Parâmetros | Descrição |
|---------|------------|-----------|
| `get_sources` | - | Lista monitores/janelas disponíveis |
| `start_capture` | source_id | Inicia captura do source |
| `stop_capture` | - | Para captura |

### Injeção de Input
| Comando | Parâmetros | Descrição |
|---------|------------|-----------|
| `inject_mouse_event` | event_type, x, y, button?, delta_x?, delta_y? | Move/click/scroll mouse |
| `inject_keyboard_event` | event_type, key, ctrl?, alt?, shift?, meta? | Press/release teclas |
| `set_input_enabled` | enabled | Habilita/desabilita injeção |

### Sessão
| Comando | Parâmetros | Descrição |
|---------|------------|-----------|
| `create_session` | - | Cria nova sessão como host |
| `join_session` | join_code | Entra em sessão existente |
| `end_session` | - | Encerra sessão atual |
| `get_session_status` | - | Retorna info da sessão |

---

## Requisitos do Sistema

| Requisito | Mínimo | Recomendado |
|-----------|--------|-------------|
| macOS | 11.0 (Big Sur) | 13.0+ (Ventura) |
| Rust | 1.70+ | 1.93+ (latest) |
| Node.js | 18+ | 20+ |
| pnpm | 8+ | 9.15+ |

**Importante:** A biblioteca `xcap` (captura de tela) utiliza frameworks do macOS que requerem Big Sur ou superior (AVFAudio, etc.).

---

## Variáveis de Ambiente

Para habilitar a integração com Supabase, configure as seguintes variáveis no arquivo `.env` na raiz do monorepo:

```bash
# Supabase (obrigatórias para autenticação real)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Ou use o prefixo VITE_ para o frontend Tauri
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**Nota:** Se as variáveis não estiverem configuradas, o app funcionará em modo "mock" com autenticação local.

---

## Como Continuar no Novo Mac

### 1. Pré-requisitos

```bash
# Instalar Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Verificar instalação
rustc --version  # Deve mostrar 1.70+
cargo --version

# Instalar Node.js (via nvm recomendado)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.zshrc  # ou ~/.bashrc
nvm install 20
nvm use 20

# Instalar pnpm
npm install -g pnpm
```

### 2. Clonar/Copiar o Projeto

```bash
# Se clonar do git
git clone https://github.com/profullstack/pairux.com.git
cd pairux.com

# Ou copiar a pasta existente para o novo Mac
```

### 3. Instalar Dependências

```bash
# Na raiz do monorepo
pnpm install

# Ou apenas no projeto Tauri
cd apps/desktop-tauri
pnpm install
```

### 4. Executar em Modo Dev

```bash
cd apps/desktop-tauri
pnpm tauri dev
```

Isso irá:
1. Iniciar o servidor Vite (frontend)
2. Compilar o código Rust
3. Abrir a janela do aplicativo

### 5. Build de Produção

```bash
pnpm tauri build
```

Output em: `src-tauri/target/release/bundle/`

---

## Próximos Passos da Migração

### Fase 1: Funcionalidades Core (Completa)
- [x] Estrutura do projeto
- [x] Comandos básicos (auth, capture, input, session)
- [x] UI básica (Login, Dashboard, Host, View)
- [x] **Build funcional** (macOS 11+)

### Fase 2: Integração Supabase (Completa)
- [x] Implementar cliente Supabase no Rust (`src-tauri/src/supabase.rs`)
- [x] Autenticação real (login/logout/validate_token)
- [x] Cliente Supabase no frontend (`src/lib/supabase.ts`)
- [x] Realtime para signaling WebRTC (`src-tauri/src/realtime.rs`)
- [x] Comandos de signaling (`src-tauri/src/commands/signaling.rs`)
- [x] Hook useSignaling no frontend (`src/hooks/useSignaling.ts`)
- [x] Chat em tempo real (`src/components/chat/Chat.tsx`)

### Fase 3: WebRTC (Em Progresso)
- [x] Implementar hook useWebRTC para gerenciar RTCPeerConnection
- [x] Captura de tela via getDisplayMedia() API
- [x] Signaling via Supabase Realtime
- [x] Integrar WebRTC com signaling existente
- [x] Atualizar HostSession para streaming com preview
- [x] Atualizar ViewSession para receber stream e controle remoto
- [ ] Testar conexão peer-to-peer completa
- [ ] Adaptative bitrate
- [ ] Multiple viewers

### Fase 4: Recursos Avançados
- [ ] System tray
- [ ] Gravação (FFmpeg)
- [ ] RTMP streaming
- [ ] Auto-updater
- [ ] Notarização macOS

### Fase 5: Multi-plataforma
- [ ] Build Windows
- [ ] Build Linux
- [ ] Testes E2E

---

## Arquivos Críticos para Revisão

Ao continuar o desenvolvimento, revise estes arquivos:

### Backend Rust
1. **`src-tauri/src/lib.rs`** - Setup principal do Tauri
2. **`src-tauri/src/supabase.rs`** - Cliente HTTP para Supabase API
3. **`src-tauri/src/realtime.rs`** - Cliente WebSocket para Supabase Realtime
4. **`src-tauri/src/commands/auth.rs`** - Comandos de autenticação
5. **`src-tauri/src/commands/signaling.rs`** - Comandos de signaling WebRTC
6. **`src-tauri/src/capture.rs`** - Lógica de captura de tela
7. **`src-tauri/src/input.rs`** - Injeção de mouse/teclado

### Frontend React
8. **`src/lib/supabase.ts`** - Cliente Supabase
9. **`src/hooks/useSignaling.ts`** - Hook para signaling WebRTC e chat
10. **`src/hooks/useWebRTC.ts`** - Hook para gerenciar RTCPeerConnection e streaming
11. **`src/components/session/HostSession.tsx`** - UI do host com streaming, controle de viewers e chat
12. **`src/components/session/ViewSession.tsx`** - UI do viewer com recepção de stream, controle remoto e chat
13. **`src/components/chat/Chat.tsx`** - Componente de chat em tempo real
14. **`src/App.tsx`** - Roteamento React
15. **`src/components/Dashboard.tsx`** - UI principal

---

## Comparação: Electron vs Tauri

| Métrica | Electron (atual) | Tauri (esperado) | Melhoria |
|---------|-----------------|------------------|----------|
| Tamanho do binário | ~180 MB | ~18 MB | -90% |
| RAM em idle | ~250 MB | ~40 MB | -84% |
| Tempo de startup | ~2.5s | ~0.3s | -88% |
| CPU em idle | ~3-5% | ~0.5% | -85% |

---

## Troubleshooting

### Erro: "framework not found AVFAudio"
**Causa:** macOS < 11.0
**Solução:** Atualizar para macOS Big Sur ou superior

### Erro: "Port 5173 is already in use"
**Causa:** Outro processo usando a porta
**Solução:** `kill $(lsof -t -i:5173)` ou alterar porta em `vite.config.ts`

### Erro: "icon is not RGBA"
**Causa:** Ícone PNG sem canal alpha
**Solução:** Usar PNG com transparência (RGBA, 4 canais)

### Erro de compilação Rust
**Solução:** Limpar cache e recompilar:
```bash
cd src-tauri
rm -rf target
cargo build
```

---

## Contato

Para dúvidas sobre a migração, consulte:
- Documentação Tauri: https://tauri.app/v2/
- Repositório: https://github.com/profullstack/pairux.com

---

*Documento gerado em: 2026-02-06*
*Versão do projeto: 0.1.0*
