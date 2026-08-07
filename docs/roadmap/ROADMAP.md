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

## Prioridade 1 — Hardening técnico (antes ou junto da próxima feature)

| Item | Risco que resolve | Esforço estimado |
|---|---|---|
| Índice único parcial: 1 caixa aberto por empresa | #3 | Pequeno (1 migration + 1 checagem em `abrirCaixa`) |
| FK/trigger tenant-scoped em `agendamentos` | #2 | Médio — bloqueante para Agenda v1 ser segura, ver spec |
| Fechar `criar_empresa_e_perfil` para `anon` | #10 | Trivial |
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

- Estratégia de migrations versionadas (`docs/database/DATABASE.md#estratégia-de-migrations`) —
  decisão de produto pendente sobre adotar Supabase CLI local.
- Validação centralizada (zod) nas Server Actions.
- Organização modular por feature — aplicar a partir da Agenda v1, não
  retrofitar módulos simples existentes sem necessidade.
- Estratégia responsiva — ver `docs/CODING_STANDARDS.md#responsividade`.
  Decisão pendente: mobile-first redesign geral, ou só garantir que Agenda
  v1 (o módulo mais crítico para uso no salão, potencialmente em tablet/
  celular no balcão) nasça responsiva e o resto migra depois?
- `crud_perfis` restritiva por papel — só vira urgente quando "convite de
  profissional/recepção" (login próprio de staff) entrar em escopo.
- `.single()` sem `.eq("id", user.id)` em `caixa/actions.ts:8` — só vira
  bug ativo quando uma empresa tiver 2+ usuários logando.

## Visão de longo prazo (ERP / automações / IA)

Não especificado em detalhe aqui — fora de escopo para este ciclo de
documentação. Registrado como direção declarada do produto (ver
`docs/PROJECT_BIBLE.md`), a ser detalhado em specs próprias quando o core
operacional (Agenda, Caixa, Comissionamento, Relatórios) estiver maduro.
Candidatos naturais, pela paridade com o backlog GestorSim: automação de
lembrete de agendamento, sugestão de horário por IA, orçamento prévio antes
de virar agendamento/venda, metas por profissional.

## Pendências de decisão de produto (não assumidas neste documento)

- Adotar Supabase CLI local ou continuar com o fluxo atual de migration via
  MCP?
- Mobile-first geral agora, ou responsividade módulo a módulo começando
  pela Agenda?
- Quando priorizar "convite de profissional/recepção" (login próprio de
  staff) — antes ou depois de Comissionamento? Comissionamento hoje só
  precisa que `profissionais` exista, não que o profissional tenha login.
