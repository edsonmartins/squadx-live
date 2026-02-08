# SquadX Whiteboard — Projeto Técnico Detalhado

**Módulo do SquadX Live | Canvas Colaborativo para Equipes + Agentes de IA**

Baseado em Excalidraw (MIT) — Opção A

IntegrAllTech | Fevereiro 2026 | v1.0 | CONFIDENCIAL

---

## 1. Decisão Arquitetural: Módulo do SquadX Live

> **🎯 DECISÃO:** O SquadX Whiteboard será um MÓDULO do SquadX Live, não um produto separado. A equipe já está em reunião (voz, vídeo, chat, screen share) — o whiteboard é a evolução natural das annotations, integrado ao mesmo contexto de sessão.

### 1.1 Por que Módulo do SquadX Live?

A análise da arquitetura existente do SquadX Live revela que toda a infraestrutura necessária já está em operação. O Live já possui: sessões colaborativas via WebRTC, chat integrado via Supabase Realtime, sistema de presença (awareness de quem está online), annotations básicas via WebRTC Data Channel, e autenticação/RBAC completos. Criar o whiteboard como produto separado duplicaria toda essa infraestrutura sem benefício.

**Razões determinantes:**

- **Contexto natural:** a equipe já está na sessão Live conversando — abrir o whiteboard deve ser tão simples quanto clicar uma aba
- **Infra reutilizada:** Supabase Realtime (presença, persistência), WebRTC (data channel para sync), e JWT auth já existem
- **Agentes já conectados:** os agentes de IA já são "peers" na sessão Live — estender para o whiteboard é incremental
- **UX unificada:** o usuário não precisa sair do fluxo de trabalho; canvas, chat, voz e live view coexistem
- **Monetização:** adiciona valor ao plano Live sem fragmentar a oferta comercial

### 1.2 Posicionamento no Ecossistema SquadX

| SquadX Dashboard | SquadX Live | SquadX Agents |
|---|---|---|
| Kanban, projetos, analytics, settings | Sessões ao vivo, chat, calendar, screen share, **WHITEBOARD** | Execução local, Docker, LangGraph, VNC |

O Whiteboard se torna o quinto pilar do SquadX Live, ao lado de Live View, Chat, Calendar e Screen Share. Dentro de uma sessão Live, o usuário acessa o whiteboard por uma aba/panel lateral, mantendo todo o contexto da reunião.

---

## 2. Arquitetura Técnica

### 2.1 Stack Tecnológico

| Camada | Tecnologia | Justificativa |
|---|---|---|
| **Canvas Engine** | `@excalidraw/excalidraw` (MIT) | 116K stars, API imperativa, JSON format, MIT license |
| **Sync em Tempo Real** | Yjs (CRDT) + y-websocket | 900K+ downloads/semana, padrão do setor, conflict-free |
| **Transport Layer** | WebSocket (Supabase) + WebRTC DC | Reutiliza infra Live existente, fallback duplo |
| **Persistência** | Supabase PostgreSQL + Storage | Já usado pelo Live, snapshots em JSONB + S3 |
| **Agente IA Bridge** | MCP Server customizado | Padrão emergente, compatível com Claude/Copilot/Gemini |
| **Frontend** | React + TypeScript (Next.js 15) | Mesmo stack do SquadX Live Viewer (PWA) |
| **Desktop (Host)** | Tauri 2.0 (Rust + React) | Mesmo stack do SquadX Live Host |

### 2.2 Diagrama de Arquitetura

```
┌──────────────────────────────────────────────────────────────────┐
│              SQUADX LIVE SESSION                                 │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────┐  │
│  │  Live View  │ │    Chat     │ │ WHITEBOARD  │ │ Calendar│  │
│  │  (WebRTC)   │ │ (Supabase)  │ │ (Excalidraw)│ │         │  │
│  └─────────────┘ └─────────────┘ └─────┬───────┘ └─────────┘  │
│                                        │                        │
└────────────────────────────────────────┼────────────────────────┘
                                         │
                            Yjs CRDT Document
                         (y-excalidraw binding)
                                         │
              ┌──────────────────────────┼───────────────────────┐
              │                          │                       │
     ┌────────┴──────────┐  ┌───────────┴──────┐  ┌────────────┴───────┐
     │ y-websocket       │  │ WebRTC Data      │  │ AI Agent           │
     │ Provider           │  │ Channel Provider │  │ MCP Bridge         │
     └────────┬──────────┘  └───────┬──────────┘  └───────┬────────────┘
              │                     │                      │
              ▼                     ▼                      ▼
     ┌────────────────┐  ┌──────────────┐  ┌───────────────────────┐
     │ WS Server      │  │ Outros Peers │  │ SquadX Agent          │
     │ (Supabase Edge)│  │ (Browsers)   │  │ (Docker/LLM)          │
     └────────┬───────┘  └──────────────┘  └───────────────────────┘
              │
              ▼
     ┌────────────────┐
     │ Supabase DB    │  Persistência: snapshots JSONB
     │ + S3 Storage   │  + export PNG/SVG/PDF
     └────────────────┘
```

### 2.3 Fluxo de Dados: Sincronização CRDT

O coração técnico do whiteboard é o documento Yjs compartilhado. Cada participante (humano ou agente IA) mantém uma réplica local do CRDT document, e todas as alterações são mescladas automaticamente sem conflitos.

```
FLUXO: Dev1 desenha retângulo + AI Agent adiciona label

Dev1 (Browser)          Yjs Doc          AI Agent (Docker)
     |                    |                    |
     |-- createRect() --> |                    |
     |   [local apply]    |                    |
     |                    |-- sync update ---> |
     |                    |   [via WebSocket]  |
     |                    |                    |
     |                    | <-- addLabel() --- |
     |                    |   [via MCP Bridge] |
     | <-- sync update --|                    |
     |   [auto-merge]     |                    |
     |                    |                    |
Resultado: Ambos veem retângulo + label, sem conflitos
Latência típica: 50-150ms
```

### 2.4 Integração com a Sessão Live Existente

O whiteboard se conecta à mesma session do SquadX Live que o usuário já está participando. Não há login separado, sala separada, ou link separado.

| Aspecto | Live View (atual) | Whiteboard (novo) |
|---|---|---|
| **Session ID** | `session_id: "XYZ789"` | ✅ Mesmo `session_id: "XYZ789"` |
| **Auth** | JWT token do Live | ✅ Mesmo JWT token |
| **Presence** | Supabase Presence | ✅ Yjs Awareness (extends Presence) |
| **Data Channel** | WebRTC DC (annotations) | ✅ Yjs sobre WebRTC DC + WS fallback |
| **Persistência** | Supabase DB (sessions) | ✅ Supabase DB (boards JSONB) + S3 |

---

## 3. Modelo de Dados

### 3.1 Schema do Banco (Supabase PostgreSQL)

```sql
-- Tabela principal de boards
CREATE TABLE whiteboard_boards (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID REFERENCES live_sessions(id) ON DELETE CASCADE,
  project_id    UUID REFERENCES projects(id),
  title         VARCHAR(255) NOT NULL DEFAULT 'Untitled Board',
  thumbnail_url TEXT,
  yjs_state     BYTEA,              -- Yjs document state (binary)
  elements_json JSONB,              -- Excalidraw elements (snapshot)
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  is_archived   BOOLEAN DEFAULT FALSE
);

-- Versionamento de snapshots
CREATE TABLE whiteboard_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id      UUID REFERENCES whiteboard_boards(id) ON DELETE CASCADE,
  elements_json JSONB NOT NULL,
  thumbnail_url TEXT,
  label         VARCHAR(100),        -- 'Sprint Planning v2'
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Atividade de agentes no board
CREATE TABLE whiteboard_agent_actions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id      UUID REFERENCES whiteboard_boards(id) ON DELETE CASCADE,
  agent_id      VARCHAR(100) NOT NULL,  -- 'backend-agent-01'
  action_type   VARCHAR(50) NOT NULL,    -- 'create_shape', 'add_label'
  action_data   JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- RLS (Row Level Security)
ALTER TABLE whiteboard_boards ENABLE ROW LEVEL SECURITY;
CREATE POLICY boards_team_access ON whiteboard_boards
  USING (project_id IN (
    SELECT project_id FROM team_members
    WHERE user_id = auth.uid()
  ));
```

### 3.2 Formato de Dados Excalidraw

Cada elemento no canvas é um objeto JSON com estrutura padronizada. Este formato é o que os agentes de IA leem e escrevem:

```json
{
  "type": "rectangle",
  "id": "rect_abc123",
  "x": 100, "y": 200,
  "width": 300, "height": 150,
  "strokeColor": "#1a73e8",
  "backgroundColor": "#e8f0fe",
  "fillStyle": "solid",
  "label": { "text": "Auth Service" },
  "customData": {
    "createdBy": "ai-agent:backend-01",
    "linkedTask": "TASK-456",
    "agentConfidence": 0.92
  }
}
```

---

## 4. Integração com Agentes de IA

> **🤖 CORE DIFFERENTIATOR:** O SquadX Whiteboard permite que agentes de IA participem do canvas como peers visíveis, com cursor próprio, indicador de presença e capacidade de criar/modificar/comentar elementos em tempo real.

### 4.1 Arquitetura do MCP Server

O bridge entre agentes IA e o canvas será um servidor MCP (Model Context Protocol) customizado, inspirado no `yctimlin/mcp_excalidraw` mas integrado ao ecossistema SquadX.

```typescript
// squadx-whiteboard-mcp-server/src/tools.ts

// Tools expostas via MCP para os agentes
const WHITEBOARD_TOOLS = {

  // Leitura do canvas
  'get_board_elements': {
    description: 'Retorna todos elementos do whiteboard atual',
    params: { board_id: 'string', filter_type?: 'string' },
    returns: 'ExcalidrawElement[]'
  },

  'get_board_screenshot': {
    description: 'Captura PNG do estado atual do canvas',
    params: { board_id: 'string', viewport?: 'BoundingBox' },
    returns: 'base64_png'
  },

  // Criação de elementos
  'create_shapes': {
    description: 'Cria shapes no canvas',
    params: { board_id: 'string', elements: 'ExcalidrawElement[]' },
    returns: '{ created_ids: string[] }'
  },

  // Diagramas via Mermaid
  'create_diagram_from_mermaid': {
    description: 'Gera diagrama visual a partir de código Mermaid',
    params: { board_id: 'string', mermaid_code: 'string',
              position?: { x: number, y: number } },
    returns: '{ elements_created: number }'
  },

  // Anotações e comentários
  'add_annotation': {
    description: 'Adiciona sticky note com comentário do agente',
    params: { board_id: 'string', text: 'string',
              near_element_id?: 'string',
              color?: 'yellow'|'blue'|'red'|'green' },
    returns: '{ annotation_id: string }'
  },

  // Propor arquitetura
  'propose_architecture': {
    description: 'Gera diagrama de arquitetura baseado em descrição',
    params: { board_id: 'string', description: 'string',
              style?: 'c4'|'flowchart'|'sequence'|'erd' },
    returns: '{ elements_created: number, summary: string }'
  },
};
```

### 4.2 Fluxo de Interação Humano-Agente no Canvas

Cenário típico: Sprint Planning com equipe + agentes de IA

| # | Ator | Ação | Resultado no Canvas |
|---|---|---|---|
| 1 | **Tech Lead** | Esboça arquitetura básica (3 caixas: Frontend, API, DB) | 3 retângulos com labels aparecem |
| 2 | **🤖 AI Architect** | Recebe contexto via MCP, sugere microsserviços adicionais | Sticky notes amarelos com sugestões + setas pontilhadas |
| 3 | **Dev Backend** | Aceita sugestão de cache layer, move sticky para área de aprovados | Sticky muda cor para verde (aprovado) |
| 4 | **🤖 AI Architect** | Gera diagrama Mermaid completo da arquitetura aprovada | Diagrama formal com arrows, labels e cores |
| 5 | **PM** | Salva snapshot como "Sprint 12 - Architecture v1" | Versão persistida, linkável no Kanban |

### 4.3 Presença do Agente no Canvas

Agentes de IA aparecem como participantes visíveis no whiteboard, diferenciados visualmente dos humanos:

- **Cursor do agente:** cursor com ícone de robô + nome (ex: "🤖 Backend Agent"), cor distinta (roxo)
- **Badge de IA:** elementos criados por agentes recebem badge discreto "AI" no canto, com link para o prompt que gerou
- **Status indicator:** "Pensando...", "Desenhando...", "Aguardando aprovação" visível na barra de presença
- **Audit trail:** cada ação do agente é logada em `whiteboard_agent_actions` para rastreabilidade

---

## 5. Componentes do Frontend

### 5.1 Estrutura de Componentes React

```
src/modules/whiteboard/
├── components/
│   ├── WhiteboardPanel.tsx        // Panel principal (tab no Live)
│   ├── WhiteboardCanvas.tsx       // Wrapper do Excalidraw
│   ├── WhiteboardToolbar.tsx      // Tools extras (AI, export, snap)
│   ├── AgentPresenceOverlay.tsx   // Cursores + status dos agentes
│   ├── BoardSidebar.tsx           // Lista de boards, snapshots
│   ├── SnapshotManager.tsx        // Salvar/restaurar versões
│   ├── MermaidImporter.tsx        // Converter Mermaid → shapes
│   └── AIAssistPanel.tsx          // Chat lateral com agente
├── hooks/
│   ├── useWhiteboardSync.ts       // Yjs sync + awareness
│   ├── useAgentBridge.ts          // Comunicação com MCP server
│   ├── useBoardPersistence.ts     // Auto-save Supabase
│   └── useExcalidrawAPI.ts        // Wrapper da API imperativa
├── providers/
│   ├── YjsProvider.tsx            // CRDT document + providers
│   └── WhiteboardContext.tsx      // State management
├── lib/
│   ├── yjs-excalidraw-binding.ts  // Bind Yjs <> Excalidraw state
│   ├── mermaid-to-excalidraw.ts   // Mermaid parser
│   ├── export-utils.ts            // PNG, SVG, PDF export
│   └── agent-element-factory.ts   // Criar elementos com metadata IA
└── types/
    └── whiteboard.types.ts        // TypeScript interfaces
```

### 5.2 Integração na UI do SquadX Live

O whiteboard aparece como uma aba/panel dentro da sessão Live, com três modos de visualização:

| Modo | Layout | Caso de Uso |
|---|---|---|
| **Tab Mode** | Whiteboard ocupa toda a área principal, substituindo Live View temporariamente | Sprint planning dedicado, brainstorm com foco total no canvas |
| **Split Mode** | Tela dividida: Live View (50%) + Whiteboard (50%), redimensionável | Discutir arquitetura enquanto vê agente codando; pair programming visual |
| **Overlay Mode** | Whiteboard como camada semi-transparente sobre o Live View | Annotations rápidas sobre o código do agente, code review visual |

### 5.3 Wireframe: Split Mode (Live View + Whiteboard)

```
┌────────────────────────────────────────────────────────────┐
│  SquadX Live  |  Session: Sprint 12  |  📹 🎙 💬 📋      │
├───────────────────────────┬────────────────────────────────┤
│  [Live View] [Whiteboard] │  [Tab] [Split] [Overlay]      │
├───────────────────────────┼────────────────────────────────┤
│                           │                                │
│   🎥 AGENT LIVE VIEW      │   🎨 WHITEBOARD                │
│                           │                                │
│   agent-backend-01        │   ┌──────┐  ┌──────┐          │
│   ┌───────────────────┐   │   │ API  │→→│  DB  │          │
│   │ VS Code            │  │   └──────┘  └──────┘          │
│   │                    │  │        ↑                       │
│   │  auth.service.ts   │  │   ┌──────┐                    │
│   │  ████████████████  │  │   │ Auth │  📌 AI badge       │
│   │  ████████████      │  │   └──────┘                    │
│   │  ██████████████    │  │                                │
│   └───────────────────┘   │   🤖 cursor agent             │
│                           │   👤 cursor João              │
│   🟢 Online: 4 viewers    │   👤 cursor Maria             │
│                           │                                │
├───────────────────────────┴────────────────────────────────┤
│  💬 Chat: João: "Agente, adiciona cache layer"             │
│  🤖 AI: "Adicionando Redis cache ao diagrama..."          │
└────────────────────────────────────────────────────────────┘
```

---

## 6. Especificação do MCP Server

### 6.1 Visão Geral

O `squadx-whiteboard-mcp` é um servidor MCP que expõe o canvas do whiteboard para qualquer agente IA compatível (Claude, Copilot, Gemini, modelos locais). Ele se conecta ao documento Yjs compartilhado como um peer adicional.

### 6.2 Ferramentas (Tools) Expostas

| Tool | Categoria | Descrição |
|---|---|---|
| `get_board_elements` | Leitura | Retorna elementos do canvas com filtros opcionais por tipo, área, ou criador |
| `get_board_screenshot` | Leitura | Screenshot PNG do viewport atual ou área específica (para LLMs multimodais) |
| `get_board_context` | Leitura | Resumo estruturado: shapes, conexões, labels, metadata — otimizado para prompt |
| `create_shapes` | Escrita | Cria shapes no canvas: retângulos, elipses, setas, textos, sticky notes |
| `update_shapes` | Escrita | Modifica propriedades de shapes existentes (posição, cor, label, tamanho) |
| `delete_shapes` | Escrita | Remove shapes por ID ou filtro |
| `create_diagram_mermaid` | Geração | Converte código Mermaid em elementos visuais posicionados automaticamente |
| `propose_architecture` | Geração | Gera diagrama de arquitetura (C4, flowchart, ERD, sequence) a partir de descrição |
| `add_annotation` | Anotação | Sticky note do agente próximo a um elemento, com cor e link para contexto |
| `create_snapshot` | Gestão | Salva snapshot nomeado do estado atual do board |

### 6.3 Resources (Contexto para o Agente)

Além das tools, o MCP server expõe resources que dão contexto ao agente:

- `board://current/elements` — lista completa de elementos do board ativo
- `board://current/summary` — resumo textual do que está no canvas (para economia de tokens)
- `board://current/participants` — quem está online (humanos + agentes)
- `board://history/actions` — últimas 50 ações no board (para contexto temporal)

---

## 7. Roadmap de Implementação

> **⏱ TIMELINE TOTAL: 10 Semanas** — Inserido após a Phase 2 do SquadX Live (Week 18 do roadmap geral). O whiteboard segue o mesmo padrão iterativo: PoC funcional primeiro, depois refinar.

### 7.1 Fase 1: Fundação (Semanas 1-3)

**Objetivo:** Canvas funcional integrado ao SquadX Live com sync básico

| Sem. | Entregável | Tarefas | Dependências |
|---|---|---|---|
| **1** | Excalidraw integrado como tab no Live | Instalar `@excalidraw/excalidraw`, criar WhiteboardPanel, integrar no layout Live | SquadX Live UI |
| **2** | Yjs sync funcionando multi-usuário | Configurar Yjs document, y-excalidraw binding, y-websocket provider no Supabase Edge | Supabase infra |
| **3** | Persistência + awareness de presença | Schema DB, auto-save, cursores de outros usuários visíveis, lista de boards por sessão | Schema DB pronto |

**Marco Fase 1:** Equipe consegue desenhar junto no whiteboard durante sessão Live, vendo cursores uns dos outros em tempo real.

### 7.2 Fase 2: Integração IA (Semanas 4-6)

**Objetivo:** Agentes de IA participam do canvas como peers visíveis

| Sem. | Entregável | Tarefas | Dependências |
|---|---|---|---|
| **4** | MCP Server básico + bridge Yjs | Implementar `squadx-whiteboard-mcp` com tools de leitura (`get_elements`, `screenshot`) | Fase 1 completa |
| **5** | Agente cria/modifica shapes no canvas | Tools de escrita (`create_shapes`, `update`, `delete`), cursor do agente visível, badge AI | MCP server running |
| **6** | Mermaid-to-diagram + propose_architecture | Parser Mermaid, layout automático, tool de proposta de arquitetura via LLM | Mermaid lib |

**Marco Fase 2:** Agente de IA desenha diagrama de arquitetura no canvas enquanto equipe assiste e discute via chat.

### 7.3 Fase 3: Produtização (Semanas 7-10)

**Objetivo:** Recurso production-ready com polimento de UX, export e versionamento

| Sem. | Entregável | Tarefas | Dependências |
|---|---|---|---|
| **7** | Modos Split/Overlay + responsividade | Implementar os 3 modos de visualização, drag-to-resize, mobile-friendly | UI framework |
| **8** | Snapshots + versionamento + export | Snapshot manager, diff visual entre versões, export PNG/SVG/PDF, linkável no Kanban | Storage S3 |
| **9** | Templates + biblioteca de componentes | Templates pré-definidos (C4, ERD, sprint board, user story map), paleta de componentes dev | Design system |
| **10** | QA, performance, docs, launch | Testes E2E, otimização CRDT para boards grandes, documentação, beta release | Tudo acima |

**Marco Fase 3:** Whiteboard em produção como feature do SquadX Live, com templates dev-friendly e integração completa com agentes.

---

## 8. Dependências e Pacotes NPM

| Pacote | Versão | Licença | Propósito |
|---|---|---|---|
| `@excalidraw/excalidraw` | latest | MIT | Canvas engine principal |
| `@excalidraw/mermaid-to-excalidraw` | latest | MIT | Converter Mermaid → shapes |
| `yjs` | ^13.x | MIT | CRDT document sync |
| `y-websocket` | ^2.x | MIT | WebSocket provider para Yjs |
| `y-protocols` | ^1.x | MIT | Awareness protocol (cursores) |
| `@anthropic-ai/sdk` | latest | MIT | SDK Anthropic (MCP server) |
| `@modelcontextprotocol/sdk` | latest | MIT | MCP server framework |
| `lib0` | ^0.2.x | MIT | Utilitários Yjs (encoding/decoding) |
| `mermaid` | ^11.x | MIT | Parser Mermaid diagrams |

> **Nota:** Todas as dependências são MIT, mantendo total liberdade de licenciamento para o SquadX. Zero custos de licença de terceiros.

---

## 9. Estimativa de Esforço e Recursos

| Componente | Horas Est. | Complexidade | Perfil Dev | Risco |
|---|---|---|---|---|
| Excalidraw integration | 40h | Média | Frontend Sr. | Baixo |
| Yjs sync + providers | 60h | Alta | Fullstack Sr. | Médio |
| MCP Server | 80h | Alta | Backend Sr. + IA | Médio |
| Schema DB + persistence | 24h | Baixa | Backend | Baixo |
| UI: modos Tab/Split/Overlay | 48h | Média | Frontend Sr. | Baixo |
| Agent presence + cursores | 32h | Média | Frontend | Baixo |
| Mermaid → Excalidraw | 24h | Média | Frontend | Baixo |
| Snapshots + export | 32h | Baixa | Fullstack | Baixo |
| Templates + componentes | 40h | Baixa | Design + Front | Baixo |
| Testes E2E + QA | 40h | Média | QA / Fullstack | Baixo |
| **TOTAL** | **420h** | — | — | — |

Com 1 dev fullstack sênior dedicado: ~10 semanas (2.5 meses). Com 2 devs em paralelo: ~6 semanas (1.5 meses).

---

## 10. Riscos e Mitigações

| Risco | Impacto | Mitigação | Plano B |
|---|---|---|---|
| Yjs-Excalidraw binding instável | Alto | Usar y-excalidraw-binding da comunidade + testes extensivos | Sync via polling JSON (perde tempo real, mas funciona) |
| Performance com boards grandes (500+ shapes) | Médio | Viewport culling, lazy loading, limitar shapes visíveis | Paginação de boards (múltiplas páginas) |
| Agente IA gera shapes inválidos | Médio | Camada de sanitização no MCP server, validação de schema | Sandbox: agente propõe, humano aprova antes de aplicar |
| Excalidraw breaking changes | Baixo | Pintar versão específica, wrapper de abstração | Fork interno se necessário (MIT permite) |
| Latência WebSocket alto (regiões remotas) | Baixo | Supabase Edge Functions (CDN global), P2P WebRTC como primary | Operação offline-first com sync eventual |

---

## 11. Métricas de Sucesso

| Métrica | Fase 1 (Sem. 3) | Fase 2 (Sem. 6) | Fase 3 (Sem. 10) |
|---|---|---|---|
| Sync latência (p95) | < 500ms | < 200ms | < 150ms |
| Shapes suportados por board | 100+ | 300+ | 500+ |
| Usuários simultâneos | 5 | 10 | 10+ |
| Ações de agente IA por sessão | — | 10+ | 50+ |
| Adoção (% sessões Live com whiteboard) | 20% | 40% | 60%+ |
| Satisfação (NPS feature) | — | +20 | +40 |

---

## 12. Conclusão e Próximos Passos

O SquadX Whiteboard como módulo do SquadX Live é a decisão arquitetural correta. A infraestrutura de sessões colaborativas já existe, os agentes de IA já são peers na sessão, e o whiteboard preenche a lacuna natural entre "assistir o agente codando" e "discutir arquitetura visualmente com o agente".

A Opção A (Excalidraw MIT) garante total liberdade de licenciamento, ecossistema massivo (116K stars), e múltiplos servidores MCP já disponíveis na comunidade. O investimento de ~420 horas (10 semanas com 1 dev ou 6 semanas com 2) produz uma funcionalidade que **nenhum competidor oferece hoje**: canvas colaborativo onde humanos e agentes de IA desenham, diagramam e debatem arquitetura juntos, em tempo real, dentro da mesma sessão de trabalho.

### 🚀 Próximos Passos Imediatos

1. Criar branch `feature/whiteboard` no repo SquadX Live
2. `npm install @excalidraw/excalidraw yjs y-websocket`
3. Implementar `WhiteboardPanel.tsx` como tab no Live
4. Configurar Yjs document + WebSocket provider
5. Primeiro teste: 2 browsers desenhando no mesmo canvas

**Meta da Semana 1:** Excalidraw renderizando dentro do SquadX Live com sync básico.

---

**SquadX Whiteboard: onde humanos e agentes pensam visualmente, juntos.**
