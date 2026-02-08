# Canvas Colaborativos Open Source para Colaboração Humano-IA

**Análise Estratégica para o SquadX.dev**

IntegrAllTech | Fevereiro 2026 | CONFIDENCIAL

---

## 1. Resumo Executivo

O ecossistema de whiteboards colaborativos open source amadureceu significativamente. Três projetos se destacam claramente: **tldraw** (~40.000 stars), **Excalidraw** (~116.000 stars) e **AFFiNE** (~50.200 stars). O ponto crítico para o SquadX.dev é que **apenas o tldraw oferece um framework nativo para agentes de IA** — seu Agent Starter Kit permite que agentes interpretem e interajam com o canvas como participantes de primeira classe.

A convergência do ecossistema em torno do **MCP (Model Context Protocol)** como protocolo padrão e do **Yjs/CRDT** como camada de sincronização significa que a escolha de base não é irreversível. O trade-off principal é licenciamento: o tldraw tem licença comercial, enquanto Excalidraw e AFFiNE são MIT.

---

## 2. Projetos Tier-1: Análise Detalhada

### 2.1 tldraw — O Mais Preparado para IA

- **GitHub:** github.com/tldraw/tldraw
- **Stars:** ~40.000
- **Licença:** Comercial (gratuito para dev, requer licença comercial para produção)

O tldraw é o único projeto que trata agentes de IA como caso de uso central. Seu **Agent Starter Kit** fornece a API `useTldrawAgent(editor)` com um simples `agent.prompt('Desenhe um fluxograma')`, suportando Anthropic, OpenAI e Google nativamente.

**Recursos-chave para o SquadX:**

- **Contexto dual para agentes:** screenshots do canvas (compreensão espacial) + dados JSON estruturados (manipulação precisa)
- **Editor API completa:** `createShapes()`, `updateShape()`, `deleteShapes()`, controle de câmera, gerenciamento de seleção
- **Sync em tempo real:** WebSocket via `@tldraw/sync-core`, com starter kits para Cloudflare Durable Objects e Node.js
- **Make Real:** funcionalidade onde esboços se transformam em código funcional via modelos de visão
- **Workflow Starter Kit:** pipelines visuais de IA no estilo ComfyUI
- **Modelo de dados:** JSON limpo em store reativo, trivialmente parsável por LLMs

> ⚠️ **Ressalva importante:** o tldraw usa licença customizada. É gratuito para desenvolvimento, mas requer licença comercial para uso em produção (ou exibição de watermark "Made with tldraw").

### 2.2 Excalidraw — O Mais Popular e Totalmente Aberto

- **GitHub:** github.com/excalidraw/excalidraw
- **Stars:** ~116.000
- **Licença:** MIT ✅

O Excalidraw é a opção mais popular e totalmente open source. O pacote npm `@excalidraw/excalidraw` fornece uma API imperativa com `updateScene()`, `getSceneElements()` e `convertToExcalidrawElements()` para manipulação programática.

**Recursos-chave para o SquadX:**

- **Formato JSON aberto:** o formato `.excalidraw` é direto para agentes de IA lerem e escreverem
- **4 servidores MCP:** destaque para `yctimlin/mcp_excalidraw` (~692 stars) com sync em tempo real via WebSocket
- **Text-to-diagram:** conversão via Mermaid e funcionalidades de wireframe-to-code integradas
- **Ecossistema massivo:** integrações com Obsidian, VS Code, Notion, Logseq

> ⚠️ **Limitação crítica:** a colaboração em tempo real NÃO está incluída no pacote npm. É necessário implementá-la usando soluções da comunidade como `excalidraw-yjs-starter` ou o servidor WebSocket `excalidraw-room`.

### 2.3 AFFiNE — O Workspace Integrado

- **GitHub:** github.com/toeverything/AFFiNE
- **Stars:** ~50.200
- **Licença:** MIT ✅

O AFFiNE adota uma abordagem diferente, fundindo docs, whiteboards e databases em um único "Edgeless Mode". Construído sobre engine CRDT em Rust (y-octo/Yjs), é local-first com sincronização automática sem conflitos.

**Recursos-chave para o SquadX:**

- **Modo Edgeless:** canvas infinito integrado com editor de documentos e base de dados
- **AI Copilot:** geração de mind maps, sumarização de sticky notes, criação de conteúdo
- **BlockSuite:** framework de editor programável open source separável
- **Local-first:** CRDT nativo com sync automático, ideal para soberania de dados

> ⚠️ **Nota:** os recursos de IA são parcialmente fechados (plano pago). Melhor para workspaces completos do que para canvas puro de desenho.

---

## 3. Tabela Comparativa dos Projetos Tier-1

| Característica | tldraw | Excalidraw | AFFiNE |
|---|---|---|---|
| **GitHub Stars** | ~40.000 | ~116.000 | ~50.200 |
| **Licença** | Comercial | MIT | MIT |
| **Framework de Agentes IA** | ✅ Agent Starter Kit | ❌ (DIY via MCP) | Parcial (AI Copilot) |
| **API Programática** | Editor (CRUD completo) | Imperativa (updateScene) | BlockSuite API |
| **Sync Tempo Real** | ✅ Nativo (WebSocket) | ❌ Não no npm (DIY) | ✅ Nativo (CRDT) |
| **Formato de Dados** | JSON records | JSON elements | CRDT blocks |
| **Self-hostable** | Sim (CF/Node) | Sim (room server) | Sim (Docker) |
| **Servidores MCP** | Comunidade | 4+ implementações | Nenhum encontrado |

---

## 4. Alternativas de Segundo Nível

### Drawnix (~10K stars, MIT)

Projeto de crescimento mais rápido, construído sobre o framework **Plait** com arquitetura de plugins real suportando React e Angular. Oferece mind maps, fluxogramas e desenho livre com conversão Mermaid/Markdown. **Porém, atualmente NÃO possui colaboração multi-usuário em tempo real**, tornando-o inadequado sem trabalho significativo de backend.

### draw.io/diagrams.net (~3.500 stars, Apache 2.0)

A ferramenta de diagramas mais completa com centenas de stencils e integrações (VS Code, Confluence, Notion). Porém, é **arquiteturalmente incompatível** com colaboração humano-IA em tempo real: modelo de dados XML, embedding apenas via iframe/postMessage, e ausência total de sync nativo.

### WBO/Whitebophir (~2.500 stars, AGPL-3.0)

A opção self-hosted mais simples — um único comando Docker deploy um whiteboard colaborativo via Socket.IO. Extremamente leve, mas sem API programática além de export SVG.

### cracker0dks/whiteboard (~806 stars, MIT)

Destaque entre ferramentas leves por ter **REST API completa com documentação Swagger/OpenAPI** — recurso raro que torna a interação programática de IA viável. Suporta colaboração via Socket.IO e integração WebDAV para Nextcloud.

### Spacedeck Open (~1.100 stars, AGPL-3.0)

Whiteboard colaborativo com suporte a rich media (imagens, vídeos, áudio). Projeto relativamente inativo, mas com boa base de funcionalidades. Self-hostable via Node.js.

---

## 5. Catálogo Completo de Projetos

| Projeto | Stars | Licença | Collab RT | IA Ready | Self-host | Melhor para |
|---|---|---|---|---|---|---|
| **Excalidraw** | ~116K | MIT | DIY | Alto (4 MCP) | Sim | Canvas aberto + IA custom |
| **AFFiNE** | ~50K | MIT | Sim (CRDT) | Médio | Sim | Workspace integrado |
| **tldraw** | ~40K | Comercial | Sim (WS) | Excelente | Sim | Caminho mais rápido |
| **Drawnix** | ~10K | MIT | Não | Baixo | Sim | Plugins + mind maps |
| **Lorien** | ~6.3K | MIT | Não | Nenhum | N/A | Sketch pessoal |
| **draw.io** | ~3.5K | Apache 2.0 | Não | Baixo | Sim | Diagramas estáticos |
| **WBO** | ~2.5K | AGPL-3.0 | Sim (Socket) | Nenhum | Sim | Whiteboard simples |
| **Spacedeck** | ~1.1K | AGPL-3.0 | Sim (WS) | Nenhum | Sim | Rich media board |
| **whiteboard** | ~806 | MIT | Sim (Socket) | Baixo-Médio | Sim | Leve c/ REST API |
| **Ourboard** | ~806 | Custom | Sim (WS) | Baixo | Sim | UX estilo Miro |

---

## 6. Integração IA-Canvas: O Ecossistema MCP

A tendência mais significativa para o SquadX é a rápida emergência de **servidores MCP (Model Context Protocol)** como ponte padrão entre agentes de IA e ferramentas de canvas. Todas as plataformas principais estão ganhando suporte MCP:

- **Excalidraw:** 4 implementações MCP; destaque para `yctimlin/mcp_excalidraw` com sync via WebSocket, suportando Claude Desktop, Cursor, VS Code e Gemini CLI
- **Miro:** servidor MCP oficial (`miroapp/miro-ai`) em beta público, permitindo geração de diagramas a partir de PRDs
- **tldraw:** servidor MCP da comunidade (`@talhaorak/tldraw-mcp`) para manipulação de arquivos `.tldr`
- **draw.io:** `drawio-mcp` para geração de diagramas baseada em arquivos
- **Microsoft:** demo com Azure Web PubSub + MCP onde GPT-4o desenha em whiteboard colaborativo via VS Code Copilot

**MCP permite que qualquer assistente de IA interaja com ferramentas de canvas através de interface padronizada**, eliminando a necessidade de integrações customizadas por provedor de modelo. Para o SquadX, construir ou adotar um servidor MCP significa compatibilidade instantânea com Claude, Copilot, Gemini e futuros assistentes.

Além do MCP, a **sintaxe Mermaid tornou-se o formato intermediário universal** entre LLMs e diagramas visuais. LLMs produzem código Mermaid válido de forma confiável, e tanto Excalidraw quanto tldraw suportam import de Mermaid.

---

## 7. Como Agentes de IA Participam em Canvas Hoje

Os experimentos do PartyKit + tldraw demonstraram o padrão mais avançado: **agentes como "NPCs" (non-player characters)** conectando a sessões colaborativas como peers independentes com seus próprios cursores, indicadores de presença e capacidade de manipular o estado compartilhado do canvas em tempo real.

O Agent Starter Kit do tldraw formaliza isso em uma arquitetura production-ready. Agentes recebem contexto através de dois canais:

- **Screenshots visuais:** para compreensão espacial e de layout
- **Dados estruturados de shapes:** em três granularidades — `BlurryShape` (visão geral), `FocusedShape` (detalhe) e `PeripheralShapeCluster` (contexto fora do viewport)

O agente responde com ações como `create_shape`, `update_shape`, `delete_shape`, `draw_freehand`, `align_shapes`, executadas pela Editor API. Uma camada de sanitização corrige erros comuns de LLMs (IDs inválidos, coordenadas fora dos limites) antes de aplicar as mudanças.

O projeto open source **Brainstormer** (Excalidraw + Ollama) adota uma abordagem mais simples: o whiteboard é exportado como imagem para análise por LLM multimodal, com o agente respondendo como assistente de chat.

---

## 8. Arquitetura Recomendada para o SquadX.dev

A arquitetura ótima para colaboração humano-IA em canvas segue o padrão comprovado pelo tldraw + PartyKit:

```
[AI Agent Server] ←WebSocket→ [Yjs/CRDT Sync Server] ←WebSocket→ [Browser Clients]
       ↕                              ↕
  [LLM Provider]              [Persistence Layer]
```

Agentes de IA conectam como peers ao mesmo room CRDT-backed que os usuários humanos ocupam. **Yjs** (900K+ downloads semanais no npm) é a biblioteca CRDT dominante, com integrações comprovadas tanto para tldraw (exemplo oficial) quanto Excalidraw (`y-excalidraw` da comunidade). O protocolo awareness do Yjs fornece presença do agente — posição do cursor, identidade e status — visível para os colegas humanos.

---

## 9. Árvore de Decisão para o SquadX.dev

### Opção A: Flexibilidade de Licenciamento → Excalidraw (MIT)

Usar `@excalidraw/excalidraw` como componente de canvas, implementar colaboração via Yjs + WebSocket, adotar ou estender o servidor MCP `mcp_excalidraw` para interação de agentes, e construir framework de agentes customizado usando a API imperativa. Mais trabalho de engenharia, mas propriedade total.

### Opção B: Velocidade de Entrega → tldraw SDK

O Agent Starter Kit, sync multiplayer nativo e Editor API abrangente reduzem drasticamente o tempo de desenvolvimento. Incluir o custo da licença comercial no orçamento. A API `store.mergeRemoteChanges()` torna a integração de agentes server-side direta.

### Opção C: Workspace Completo → AFFiNE BlockSuite

Se o produto precisar ir além do canvas puro (docs + canvas + database), avaliar o BlockSuite do AFFiNE como fundação, combinando docs, canvas e databases com sync CRDT.

---

## 10. Conclusão e Oportunidade

O espaço de whiteboards open source amadureceu significativamente. O **Agent Starter Kit do tldraw representa o estado da arte atual** para integração IA-canvas — compreensão de contexto dual, ações de agente em streaming e suporte multi-provedor em pacote production-ready. A **licença MIT e ecossistema massivo do Excalidraw** (116K stars, múltiplos servidores MCP, integrações Obsidian/VS Code/Notion) fazem dele a fundação open source mais forte, embora demande engenharia customizada para colaboração e interação de agentes.

**A lacuna mais clara no mercado — e a oportunidade do SquadX — é que nenhum projeto existente combina colaboração de equipe em tempo real, participação de agentes de IA no canvas com presença visível, e workflows de desenvolvimento de software em um único produto.** Os experimentos de NPC do tldraw provaram o conceito; o SquadX pode produtizá-lo.

---

## 11. Links e Referências

### Repositórios Principais

- tldraw: https://github.com/tldraw/tldraw
- tldraw Agent Template: https://github.com/tldraw/agent-template
- Excalidraw: https://github.com/excalidraw/excalidraw
- AFFiNE: https://github.com/toeverything/AFFiNE
- Drawnix: https://github.com/plait-board/drawnix
- draw.io: https://github.com/jgraph/drawio
- WBO: https://github.com/lovasoa/whitebophir
- Whiteboard (REST API): https://github.com/cracker0dks/whiteboard
- Brainstormer: https://github.com/shivangdoshi07/brainstormer

### Servidores MCP

- Excalidraw MCP: https://github.com/yctimlin/mcp_excalidraw
- tldraw MCP: https://github.com/talhaorak/tldraw-mcp

### Documentação

- tldraw AI Docs: https://tldraw.dev/docs/ai
- tldraw Sync Docs: https://tldraw.dev/docs/sync
- tldraw Agent Starter Kit: https://tldraw.dev/starter-kits/agent
- Yjs Docs: https://docs.yjs.dev
