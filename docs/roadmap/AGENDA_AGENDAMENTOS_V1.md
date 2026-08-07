# Spec — Agenda e Agendamentos v1

Status: **reconciliada em 2026-08-07, pronta para virar plano de
implementação**. Item #2 do roadmap de prioridade 2 (`docs/roadmap/ROADMAP.md`).
Escrita originalmente antes do hardening P0; esta revisão atualiza o que já
foi resolvido por aquele trabalho (ver `docs/superpowers/plans/2026-08-07-hardening-p0-timezone.md`)
para não repetir nem contradizer o que já existe no banco. Este documento
continua sendo a especificação, não a implementação — o código da Agenda em
si ainda não foi escrito.

## Problema

A Agenda hoje (`src/app/(app)/agenda/page.tsx`) é só uma grade visual:
colunas por profissional ativo, linhas de horário de 30 em 30 minutos, sem
nenhuma interação. A tabela `agendamentos` já existe no schema com todos os
campos necessários, mas nada na aplicação cria, edita ou exibe uma linha
dela. Esta é a lacuna nº 1 mais citada tanto no `README.md` original quanto
no roadmap consolidado.

## Entidades afetadas

- `agendamentos` (existente, sem mudança de coluna necessária) — campos:
  `empresa_id`, `cliente_id` (nullable no banco, **obrigatório na v1 pela
  Server Action/formulário** — a coluna fica nullable no schema de
  propósito, para não fechar a porta a um caso futuro tipo walk-in sem
  cliente cadastrado, mas a v1 em si sempre exige selecionar um), `profissional_id`,
  `servico_id`, `inicio`, `fim`, `status`, `observacoes`.
- `profissionais`, `servicos`, `clientes` — só leitura, para popular os
  seletores do formulário de criação.
- Nenhuma tabela nova proposta para v1.

## Pré-requisito de segurança — **concluído em 2026-08-07**

O risco #2 (`agendamentos.profissional_id`/`servico_id`/`cliente_id` sem
validação de que a linha referenciada pertence à mesma `empresa_id`) foi
fechado no hardening P0, antes desta feature começar — não é mais um
pré-requisito pendente, é uma garantia já existente no banco que a Agenda
v1 apenas consome.

**Decisão registrada**: a correção usa **trigger** (`before insert or
update`), não FK composta — `validar_tenant_agendamento()` em
`supabase/migrations/20260807034459_validar_tenant_agendamentos.sql`, que
valida `cliente_id` (quando não nulo), `profissional_id` e `servico_id`
contra o `empresa_id` do agendamento, com uma mensagem de erro em português
por campo. A mesma proteção existe para `movimentacoes_caixa.agendamento_id`
via `validar_tenant_movimentacao_agendamento()`. Nenhuma tabela ganhou
`unique (id, empresa_id)` nem FK composta — decisão deliberada para não
tocar em `profissionais`/`servicos`/`clientes` só por causa da Agenda.

**Nota de implementação herdada da revisão final do hardening**: ao
contrário de `clientes`/`servicos`/`produtos`/`profissionais`, a tabela
`agendamentos` **não tem** um trigger `set_empresa_id` que preenche o campo
automaticamente quando o client não envia. Isso é intencional para a Agenda
v1: a criação de agendamento passa por uma Server Action (não um insert
direto do client, ver "Fluxo proposto" abaixo), e essa Server Action sempre
vai buscar o `empresa_id` do usuário autenticado no servidor e enviá-lo
explicitamente — o mesmo padrão já usado em `caixa/actions.ts`. Não é
necessário adicionar esse trigger a `agendamentos` só para a Agenda v1.

Também já implementado (não é mais trabalho desta feature, é pré-requisito
pronto): a exclusion constraint contra sobreposição de horário — ver "Regra
de conflito" abaixo.

## Fluxo proposto

1. Usuário clica num horário vazio na grade (coluna = profissional já
   conhecida, linha = horário de início já conhecido).
2. Abre um formulário (modal ou painel lateral — decisão de UI na
   implementação) pré-preenchido com profissional e horário do clique.
3. Usuário busca e seleciona um cliente existente (busca por nome).
4. Usuário seleciona um serviço — o horário de fim é `inicio +
   servicos.duracao_minutos`. **Confirmado para v1**: fim não é editável
   manualmente (a spec original previa isso, mas nem o formulário nem o
   plano de implementação ofereciam esse campo — a duração fica presa ao
   serviço selecionado). Editar a duração manualmente é um fast-follow
   natural, não v1. **A duração nunca é enviada pelo client**: a Server
   Action busca `duracao_minutos` no servidor a partir do `servicoId`, para
   um usuário não conseguir adulterar o valor e criar um atendimento com
   duração arbitrária.
5. Ao salvar, a Server Action busca a duração do serviço no servidor,
   calcula o fim, e tenta o insert diretamente — sem pré-checagem de
   conflito. A validação de tenant (trigger) e de sobreposição (exclusion
   constraint) já estão garantidas pelo banco; a Server Action só traduz o
   erro `23P01` (violação da exclusion constraint) para uma mensagem
   amigável caso a escrita falhe. Cria o agendamento com `status =
   'agendado'` quando bem-sucedida.
6. O bloco aparece na grade imediatamente, com cor/estilo por status.
7. Usuário pode alterar o status do agendamento (ao menos: confirmar,
   cancelar) a partir de um clique no bloco já criado.

## Critérios de aceite

- **AC1**: clicar num horário vazio abre o formulário de criação
  pré-preenchido com o profissional da coluna e o horário da linha
  clicados.
- **AC2**: o formulário exige cliente (busca entre os já cadastrados —
  **confirmado como obrigatório na v1**, sem opção de agendamento sem
  cliente vinculado nem criação de cliente novo inline, ver "Fora de
  escopo") e serviço (a duração do serviço define o fim automaticamente,
  **fixa, não editável na v1** — ver "Fluxo proposto"); profissional vem
  pré-selecionado mas é editável.
- **AC3**: submeter um horário que sobrepõe outro agendamento não-cancelado
  do mesmo profissional é rejeitado com uma mensagem clara, sem criar linha
  nenhuma.
- **AC4**: submeter com cliente/serviço/profissional de outra empresa (não
  deveria ser possível pela UI, mas a Server Action valida de qualquer
  forma) é rejeitado.
- **AC5**: agendamento criado aparece na grade sem precisar de reload
  manual da página (via `revalidatePath` ou equivalente).
- **AC6**: é possível cancelar um agendamento existente a partir da grade.
- **AC7**: numa tela estreita, a grade é substituída pela visão "um
  profissional por vez" (seletor de profissional + lista vertical do dia)
  — ver "UX responsiva" abaixo.

## Regra de conflito (dupla reserva)

Duas camadas: a de banco, **concluída** no hardening P0; a de aplicação,
**definida** nesta reconciliação (2026-08-07) e no plano de implementação,
ainda pendente de execução:

1. **Camada de banco — concluída em 2026-08-07 (hardening P0).** Exclusion
   constraint via `btree_gist`, aplicada em
   `supabase/migrations/20260807035205_prevenir_conflito_agenda.sql`:

   ```sql
   create extension if not exists btree_gist;

   alter table agendamentos add constraint sem_sobreposicao_profissional
     exclude using gist (
       profissional_id with =,
       tstzrange(inicio, fim) with &&
     ) where (status not in ('cancelado', 'faltou'));
   ```

   Isso impede a sobreposição **no banco**, mesmo que duas requisições
   cheguem simultaneamente. Já testado ao vivo com inserts
   sobrepostos/adjacentes durante o hardening — a Agenda v1 só precisa
   consumir essa garantia, não recriá-la.
2. **Camada de aplicação (UX) — decisão de design confirmada, implementação
   pendente (ver `docs/superpowers/plans/2026-08-07-agenda-v1.md`, Task 2):
   sem pré-checagem.** `criarAgendamento` e `atualizarStatusAgendamento` vão
   fazer **uma única tentativa de escrita** (insert/update) e traduzir o erro
   `23P01` (exclusion violation) do Postgres para a mensagem amigável
   `"Este profissional já tem um agendamento nesse horário."` — não haverá
   nenhum `select` de conflito antes da escrita. Essa é uma decisão
   deliberada, não uma simplificação temporária: um pré-check teria a
   mesma janela de corrida que a exclusion constraint existe pra fechar
   (dois requests podem passar pelo `select` antes de qualquer um dos dois
   fazer o `insert`), então ele não adicionaria garantia nenhuma — só
   duplicaria a checagem. Mesmo padrão já usado e aprovado em `abrirCaixa`
   (hardening P0) para o índice único de caixa aberto.
   `atualizarStatusAgendamento` precisa desse mesmo tratamento porque
   reativar um agendamento `cancelado`/`faltou` pode reconflitar com algo
   criado nesse meio-tempo.

Cancelar ou marcar "faltou" libera o horário automaticamente (a constraint
já exclui esses status via `where`).

## Permissões — **confirmado em 2026-08-07**

Decisão do product owner: para v1, **gestor e recepção operam a agenda
completa** (criar/editar/cancelar qualquer agendamento da empresa) — mesmo
padrão de acesso já usado em todo o resto do sistema hoje. A restrição de
"profissional vê só o próprio calendário" fica **modelada, mas não
implementada**: não existe ainda vínculo entre um `auth.users` e uma linha
de `profissionais` (profissional hoje é só um registro de cadastro, sem
login próprio), então não há como aplicar essa restrição de forma real
ainda. Ela entra junto com o trabalho futuro de "convite de
profissional/recepção" (já no roadmap), não nesta feature.

## UX responsiva — **fallback confirmado em 2026-08-07**

Decisão do product owner: abaixo do breakpoint mobile, a grade
(`grid-template-columns: 80px repeat(N profissionais, 1fr)` — não funciona
numa tela estreita com mais de 2-3 profissionais) é substituída pela visão
**"um profissional por vez"** — seletor de profissional + lista vertical dos
horários daquele dia. Isso é a implementação responsiva detalhada desta
feature, conforme já registrado em `docs/roadmap/ROADMAP.md` (a base
mobile-first geral do projeto — layout, navegação, tabelas, formulários —
é trabalho separado, sequenciado antes ou em paralelo a esta feature, não
uma pendência desta spec). O breakpoint exato (ex: `md:` do Tailwind) é
detalhe de implementação, não decisão de produto em aberto.

## Timezone — **implementado em 2026-08-07**

Já não é mais uma suposição: **um fuso horário por empresa**, persistido em
`empresas.timezone` (string IANA, default `America/Sao_Paulo`, coluna
adicionada em `supabase/migrations/20260807035933_timezone_empresa.sql`).
`agendamentos.inicio`/`fim` continuam `timestamptz` armazenados em UTC —
nenhuma mudança de schema necessária para a Agenda v1 nesse ponto.

**Convenção de exibição a seguir** (já estabelecida e documentada em
`docs/database/DATABASE.md#timezone-e-exibição-de-datas`): como
`inicio`/`fim` são `timestamptz` genuínos (não `date` puro como
`v_faturamento_diario.dia`), a Agenda deve formatá-los com o timezone
*real* da empresa (buscado de `empresas.timezone`, mesmo padrão já usado em
`caixa/page.tsx`) — **nunca** com o timezone do navegador/runtime, que é
exatamente o que a fundação de timezone existiu para eliminar. Não usar
`toLocaleString(...)` sem `timeZone` explícito em nenhum lugar novo desta
feature.

## Fora de escopo v1 (explicitamente adiado)

- Agendamento recorrente.
- Agendamento online (cliente final marcando sozinho, sem staff) — existe
  no backlog GestorSim como referência, não é v1.
- Geração automática de movimentação de caixa ao concluir um agendamento —
  acopla com Caixa/Comissionamento, fica para quando essas features
  avançarem.
- Cálculo de comissão do profissional sobre o agendamento.
- Notificações/lembretes.
- Criar cliente novo inline a partir do formulário de agendamento —
  **confirmado**: v1 exige que o cliente já exista, cadastrado via
  `/clientes`, sem atalho de criação inline. Candidato natural a
  fast-follow, mas não necessário para o fluxo funcionar.

## Riscos específicos desta feature

| Risco | Mitigação |
|---|---|
| Corrida entre duas criações simultâneas do mesmo profissional/horário | **Resolvido.** Exclusion constraint no banco (camada 1 da regra de conflito), testada ao vivo no hardening P0. |
| Regressão do risco #2 (referência cross-tenant) se a correção não entrar junto | **Resolvido.** Trigger `validar_tenant_agendamento` já aplicado antes desta feature começar, não é mais algo a lembrar. |
| Fuso horário incorreto se a empresa operar em múltiplas regiões | **Resolvido.** `empresas.timezone` implementado; a Agenda só precisa seguir a convenção de exibição já documentada (ver "Timezone" acima), não resolver isso de novo. |
| Grade inutilizável em mobile | Fallback decidido ("um profissional por vez") — falta implementar, não falta decidir. Ver "UX responsiva" acima. |

## Plano de implementação (fases)

1. ~~**Banco**~~ — **não é mais uma fase desta feature.** Extensão
   `btree_gist`, exclusion constraint de conflito, e a proteção cross-tenant
   já foram implementadas e aplicadas no hardening P0
   (`docs/superpowers/plans/2026-08-07-hardening-p0-timezone.md`). A Agenda
   v1 começa direto na Server Action.
2. **Server Action de criação**: `criarAgendamento`, validação de tenant +
   conflito espelhando as constraints do banco (para mensagens amigáveis,
   incluindo o código `23P01` da exclusion constraint), `revalidatePath("/agenda")`.
   Busca `empresa_id` do usuário autenticado no servidor (mesmo padrão de
   `caixa/actions.ts`) — não depende de nenhum trigger `set_empresa_id`.
3. **UI de criação**: clique no slot vazio → formulário → busca de cliente
   (obrigatório), seleção de serviço (auto-preenche fim), submit.
4. **Gestão de status**: alterar status a partir do bloco já criado
   (mínimo viável: cancelar; confirmar/em andamento/concluído podem ser a
   mesma UI reaproveitada).
5. **Exibição com timezone correto**: horários da grade e do formulário
   formatados com `empresas.timezone` (nunca timezone do navegador/runtime)
   — seguir a convenção já documentada, não é decisão nova.
6. **Responsivo**: implementar o fallback "um profissional por vez" abaixo
   do breakpoint mobile — decisão já tomada, esta fase é só a implementação.

Cada fase acima é candidata a virar uma task de um plano de implementação
formal (`docs/superpowers/plans/`) — próximo passo depois desta
reconciliação.
