# Roadmap — Alva

Prioridades consolidadas de três fontes: "próximos passos" originais do
`README.md`, ponderações arquiteturais do ChatGPT (verificadas — ver
`docs/architecture/ARCHITECTURE.md#riscos-técnicos`), e o inventário de
paridade funcional em `docs/backlog-referencia-gestorsim.md`. Cada item tem
uma seção de origem; nada aqui é uma promessa de prazo, é ordem relativa de
prioridade.

## Como priorizar

1. **Hardening que protege dados já existentes** vem antes de features
   novas — um bug de integridade em produção com dados reais é muito mais
   caro de corrigir depois do que antes.
2. **Features que desbloqueiam o próximo módulo** vêm antes de polish —
   Agenda funcional desbloqueia Comissionamento e mais Relatórios; polish
   de UI não desbloqueia nada.
3. **Nada do backlog de paridade GestorSim entra sem passar por um ciclo de
   brainstorming próprio** — é referência, não fila de tarefas.

## Prioridade 0 — Bloqueadores antes da Agenda v1 (definido em 2026-08-07)

Classificados como bloqueantes pelo product owner — nenhum trabalho de
Agenda v1 começa antes destes 5 itens estarem resolvidos:

| Item | Risco que resolve | Onde |
|---|---|---|
| RLS de `perfis`: impedir escalada de papel e alteração indevida entre usuários | #8 | policy `crud_perfis` |
| Restringir `criar_empresa_e_perfil` a usuários autenticados | #10 | função `criar_empresa_e_perfil` |
| Corrigir obtenção de perfil/empresa no caixa para vincular explicitamente ao usuário autenticado | #9 | `caixa/actions.ts:8` |
| Migrations versionadas — **feito** (Supabase CLI adotado, ver `docs/database/DATABASE.md#estratégia-de-migrations`) | #1 | `supabase/migrations/` |
| Proteção cross-tenant em `agendamentos` (via migration) | #2 | `agendamentos` |
| Exclusion constraint contra conflito de agenda (via migration) | — (pré-requisito da spec da Agenda v1) | `agendamentos` |
| Único caixa aberto por empresa (via migration) | #3 | `caixas` |

## Prioridade 1 — Hardening técnico adicional (antes ou junto da próxima feature)

| Item | Risco que resolve | Esforço estimado |
|---|---|---|
| Gerar tipos TypeScript do Supabase | — (produtividade + classe de bug) | Pequeno, repetir a cada mudança de schema |

## Prioridade 2 — Próxima feature de produto

**Agenda e Agendamentos v1** — spec completa em
`docs/roadmap/AGENDA_AGENDAMENTOS_V1.md`. É o item #2 do "próximos passos"
original do README, e o que mais outras features dependem (Comissionamento
precisa de agendamento vinculado a movimentação; Relatórios de ocupação
precisam de agendamento com status real).

## Prioridade 3 — Itens já conhecidos do README original

Do "Ainda não implementado" do `README.md` (após a autenticação, que já foi
concluída):

- Fechar caixa na UI (action `fecharCaixa` já existe, falta o botão).
- Comissionamento (campo `percentual_comissao` já existe em
  `profissionais`; ver seção de comissionamento no backlog GestorSim para
  os parâmetros que um concorrente maduro usa — grupo de comissão por
  produto vs. percentual por serviço×profissional).
- Relatórios adicionais (DRE, ticket médio, ranking de profissionais),
  seguindo o padrão de view materializada como `v_faturamento_diario` —
  **lembrar de `security_invoker = on`** em toda view nova.

## Prioridade 4 — Lacunas estruturais (sem bloquear nada hoje, mas crescem com o produto)

- Validação centralizada (zod) nas Server Actions.
- Organização modular por feature — aplicar a partir da Agenda v1, não
  retrofitar módulos simples existentes sem necessidade.
- **Fundamentos mobile-first — decidido, ainda não implementado**: layout,
  navegação, tabelas e formulários recebem a base responsiva agora, antes
  da Agenda v1; a Agenda recebe a implementação responsiva detalhada na
  sprint dela (ver `docs/roadmap/AGENDA_AGENDAMENTOS_V1.md#ux-responsiva`).
  Não é mais uma decisão pendente — é trabalho a sequenciar.
- Timezone — **decidido**: um fuso por empresa, coluna `empresas.timezone`
  (string IANA, default `America/Sao_Paulo`), nunca depender do timezone do
  navegador. Implica corrigir também `/caixa` e `/relatorios`, que hoje
  formatam data/hora via `toLocaleString`/`toLocaleDateString` dependente do
  browser — escopo exato (só Agenda nova, ou também esses dois já
  existentes) ainda em confirmação com o product owner.
- `crud_perfis` restritiva por papel — só vira urgente quando "convite de
  profissional/recepção" (login próprio de staff) entrar em escopo. A
  correção imediata (Prioridade 0) impede escalada de papel; restrição fina
  por papel em cada operação é trabalho futuro, separado.

## Visão de longo prazo (ERP / automações / IA)

Não especificado em detalhe aqui — fora de escopo para este ciclo de
documentação. Registrado como direção declarada do produto (ver
`docs/PROJECT_BIBLE.md`), a ser detalhado em specs próprias quando o core
operacional (Agenda, Caixa, Comissionamento, Relatórios) estiver maduro.
Candidatos naturais, pela paridade com o backlog GestorSim: automação de
lembrete de agendamento, sugestão de horário por IA, orçamento prévio antes
de virar agendamento/venda, metas por profissional.

## Pendências de decisão de produto (não assumidas neste documento)

- ~~Adotar Supabase CLI local?~~ **Decidido 2026-08-07: sim.** Ver
  `docs/database/DATABASE.md#estratégia-de-migrations`.
- ~~Mobile-first geral agora, ou responsividade módulo a módulo?~~
  **Decidido 2026-08-07: fundamentos mobile-first agora** (layout, nav,
  tabelas, formulários); Agenda recebe o detalhamento responsivo na própria
  sprint.
- ~~Permissões da Agenda v1?~~ **Decidido 2026-08-07:** gestor e recepção
  operam a agenda completa; restrição de profissional ao próprio calendário
  fica modelada mas não implementada até existir vínculo usuário↔profissional.
- ~~Timezone?~~ **Decidido 2026-08-07:** um fuso por empresa, IANA,
  `America/Sao_Paulo` como default, nunca depender do browser. Aberto ainda:
  corrigir `/caixa` e `/relatorios` (já usam timezone do browser hoje) junto
  com esta mudança, ou só a partir da Agenda?
- Quando priorizar "convite de profissional/recepção" (login próprio de
  staff) — antes ou depois de Comissionamento? Comissionamento hoje só
  precisa que `profissionais` exista, não que o profissional tenha login.
