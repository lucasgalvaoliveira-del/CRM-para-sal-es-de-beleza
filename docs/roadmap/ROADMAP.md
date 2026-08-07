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

Classificados como bloqueantes pelo product owner — **todos os itens abaixo
foram resolvidos em 2026-08-07** (ver
`docs/superpowers/plans/2026-08-07-hardening-p0-timezone.md` e o ledger em
`.superpowers/sdd/2026-08-07-hardening-p0-timezone/`); nada mais bloqueia o
início da Agenda v1 por este critério:

| Item | Risco que resolve | Onde |
|---|---|---|
| RLS de `perfis`: impedir escalada de papel e alteração indevida entre usuários — **feito** | #8 | policy `crud_perfis` → `select_perfis_da_empresa`/`update_proprio_perfil` + trigger `bloquear_escalada_papel`, migration `20260807033342_harden_perfis_rls.sql` |
| Restringir `criar_empresa_e_perfil` a usuários autenticados — **feito** | #10 | função `criar_empresa_e_perfil`, migration `20260807034032_restrict_criar_empresa_e_perfil.sql` |
| Corrigir obtenção de perfil/empresa no caixa para vincular explicitamente ao usuário autenticado — **feito** | #9 | `caixa/actions.ts` |
| Migrations versionadas — **feito** (Supabase CLI adotado, ver `docs/database/DATABASE.md#estratégia-de-migrations`) | #1 | `supabase/migrations/` |
| Proteção cross-tenant em `agendamentos` (via migration) — **feito** | #2 | `agendamentos`, migration `20260807034459_validar_tenant_agendamentos.sql` |
| Exclusion constraint contra conflito de agenda (via migration) — **feito** | — (pré-requisito da spec da Agenda v1) | `agendamentos`, migration `20260807035205_prevenir_conflito_agenda.sql` |
| Único caixa aberto por empresa (via migration) — **feito** | #3 | `caixas`, migration `20260807035633_unico_caixa_aberto.sql` |

## Prioridade 1 — Hardening técnico adicional (antes ou junto da próxima feature)

| Item | Risco que resolve | Esforço estimado |
|---|---|---|
| Gerar tipos TypeScript do Supabase | — (produtividade + classe de bug) | Pequeno, repetir a cada mudança de schema |

## Prioridade 2 — Agenda e Agendamentos v1 — **concluída em 2026-08-07**

Spec em `docs/roadmap/AGENDA_AGENDAMENTOS_V1.md`, plano de implementação em
`docs/superpowers/plans/2026-08-07-agenda-v1.md` (6 tarefas, revisão final
de branch, e uma rodada de correções pós-revisão — todas com verificação ao
vivo contra o Supabase real, mesclada em `master`). Era o item #2 do
"próximos passos" original do README, e o que mais outras features
dependiam (Comissionamento precisa de agendamento vinculado a movimentação;
Relatórios de ocupação precisam de agendamento com status real) — essa
dependência agora está desbloqueada.

Uma lacuna conhecida ficou registrada, não é bloqueante: o shell do app
(`layout.tsx`/`Sidebar.tsx`) ainda não tem breakpoints responsivos, então a
visão mobile da Agenda (correta em isolamento) só fica de fato utilizável
quando "Fundamentos mobile-first" (abaixo, Prioridade 4) for implementado.

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
- Timezone — **decidido e implementado 2026-08-07**: um fuso por empresa,
  coluna `empresas.timezone` (string IANA, default `America/Sao_Paulo`),
  nunca depender do timezone do navegador. `/caixa` e `/relatorios` (que
  formatavam data/hora via `toLocaleString`/`toLocaleDateString` dependente
  do browser) já foram corrigidos junto com a fundação — não é mais trabalho
  pendente, ver `docs/superpowers/plans/2026-08-07-hardening-p0-timezone.md`.
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
  `America/Sao_Paulo` como default, nunca depender do browser. **Implementado
  2026-08-07:** coluna `empresas.timezone` adicionada (migration
  `20260807035933_timezone_empresa.sql`), `v_faturamento_diario` agrupando
  por dia local da empresa, e tanto `/caixa` quanto `/relatorios` corrigidos
  para não depender mais do timezone do browser — a pergunta "só Agenda nova,
  ou também esses dois já existentes" foi resolvida a favor de corrigir os
  dois já existentes junto com a fundação.
- Quando priorizar "convite de profissional/recepção" (login próprio de
  staff) — antes ou depois de Comissionamento? Comissionamento hoje só
  precisa que `profissionais` exista, não que o profissional tenha login.
