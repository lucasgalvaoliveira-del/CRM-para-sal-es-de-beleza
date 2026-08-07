# Banco de dados — Alva

Fonte de verdade hoje: `supabase/schema.sql` (arquivo único, rodado no SQL
Editor ou via `mcp__claude_ai_Supabase__apply_migration`). Este documento
explica o schema atual, não o substitui — sempre confira `schema.sql` para
o SQL exato.

## Tabelas

| Tabela | Chave estrangeira de tenant | Propósito |
|---|---|---|
| `empresas` | — (é o próprio tenant) | Um salão. `timezone` (IANA, default `America/Sao_Paulo`) desde `20260807035933_timezone_empresa.sql` — ver "Timezone e exibição de datas" abaixo. |
| `perfis` | `empresa_id` | 1:1 com `auth.users` (PK = FK). `papel`: gestor/profissional/recepcao — **campo existe, não é usado em nenhuma autorização ainda**. |
| `profissionais` | `empresa_id` | Cadastro de staff. `percentual_comissao` existe, sem lógica de comissionamento ainda. |
| `clientes` | `empresa_id` | — |
| `servicos` | `empresa_id` | — |
| `produtos` | `empresa_id` | Estoque + preço custo/venda. |
| `agendamentos` | `empresa_id` | Referencia `clientes`, `profissionais`, `servicos` — validação cross-tenant garantida por trigger desde `20260807034459_validar_tenant_agendamentos.sql` (risco #2, **resolvido**, ver abaixo). `fim > inicio` é validado; sobreposição de horário do mesmo profissional é impedida por exclusion constraint (`20260807035205_prevenir_conflito_agenda.sql`). |
| `caixas` | `empresa_id` | Sessão de caixa aberto/fechado. Único `status = 'aberto'` por empresa garantido por índice único parcial desde `20260807035633_unico_caixa_aberto.sql` (risco #3, **resolvido**). |
| `movimentacoes_caixa` | via `caixa_id → caixas.empresa_id` (indireto) | Entrada/saída. `agendamento_id` opcional — mesma validação cross-tenant do risco #2 (**resolvido**), via `validar_tenant_movimentacao_agendamento`. |

View: `v_faturamento_diario` — soma diária de `movimentacoes_caixa` por
`empresa_id`, usada em `/relatorios`. **Tinha `security_invoker` desligado
até a correção aplicada durante a implementação da autenticação** (rodava
como dono da view, ignorando RLS, vazando faturamento de todas as empresas
para qualquer holder da chave `anon`) — corrigido, `security_invoker = on`
desde então. Qualquer view nova **precisa** desse `alter view ... set
(security_invoker = on)` explícito, porque Postgres/Supabase não liga isso
por padrão.

## Timezone e exibição de datas

`empresas.timezone` (`text not null default 'America/Sao_Paulo'`, desde
`supabase/migrations/20260807035933_timezone_empresa.sql`) guarda o fuso
horário IANA (ex: `America/Sao_Paulo`) da empresa. Sem validação de formato
ainda — não há UI para escrevê-lo (fica no default para toda empresa hoje),
então não existe input não confiável a validar por enquanto. Validar (ex:
contra a lista de timezones do ICU/Postgres) quando uma tela de
configuração for adicionar essa escrita.

Essa coluna alimenta `v_faturamento_diario.dia` (`date(m.criado_em at time
zone e.timezone)`) — cada movimentação de caixa é bucketada no dia local
*real* da empresa, não no dia UTC.

**Convenção de exibição — por que `timestamptz` e `date` são tratados
diferente na UI:**

- Colunas `timestamptz` (ex: `movimentacoes_caixa.criado_em`) guardam um
  instante absoluto — exibir corretamente exige aplicar o timezone real da
  empresa (buscado de `empresas.timezone`) na formatação, ex:
  `new Date(m.criado_em).toLocaleTimeString("pt-BR", { timeZone: empresa.timezone })`
  (ver `src/app/(app)/caixa/page.tsx`).
- `v_faturamento_diario.dia`, por outro lado, é um `date` puro — a view já
  fez o bucketing para o dia local correto usando `at time zone` no SQL (
  acima). O valor que chega ao client é uma string `date`-only (`"2026-08-07"`),
  e `new Date("2026-08-07")` em JavaScript sempre faz parse como **meia-noite
  UTC**, independente do timezone do runtime. Se a UI reaplicasse o timezone
  real da empresa na formatação (ex: `timeZone: empresa.timezone`), estaria
  convertendo essa meia-noite UTC *de novo* para local, o que desloca o dia
  exibido em um para qualquer timezone de offset negativo (caso de
  `America/Sao_Paulo`) — bug já verificado ao vivo durante a implementação.
  A formatação correta para esse campo é sempre `timeZone: "UTC"`
  (ver `src/app/(app)/relatorios/page.tsx`), porque isso apenas lê de volta
  o dia que a view já calculou, sem reaplicar nenhum offset. Essa regra vale
  só para campos `date`-only que já passaram por bucketing local no SQL —
  não se aplica a um `timestamptz` genuíno, que precisa do timezone real
  para mostrar a hora local correta.

## RLS e multi-tenancy

Toda tabela de negócio tem `enable row level security` + uma policy
`for all using (empresa_id = empresa_do_usuario())` (ou equivalente
indireto para `movimentacoes_caixa`). `empresa_do_usuario()` é:

```sql
create or replace function empresa_do_usuario()
returns uuid
language sql stable security definer set search_path = public
as $$
  select empresa_id from perfis where id = auth.uid()
$$;
```

**Por que `security definer`**: sem isso, a policy de `perfis` (que também
usa essa função) recursiona infinitamente — para aplicar a policy em
`perfis`, o Postgres precisa avaliar `empresa_do_usuario()`, que consulta
`perfis`, que precisa aplicar a policy de novo. `security definer` faz essa
consulta interna pular a RLS, quebrando o ciclo. **Esse bug era
pré-existente no schema original e só foi descoberto durante a
implementação da autenticação**, porque nenhum código anterior fazia uma
consulta autenticada real contra `perfis`. Qualquer função nova usada
dentro de uma policy de uma tabela que ela também consulta precisa do mesmo
tratamento.

**`WITH CHECK` implícito**: as policies são `for all using (...)` sem
`with check` explícito — Postgres reusa a expressão do `using` como check
para INSERT/UPDATE. Isso é o que faz o trigger `preencher_empresa_id`
funcionar com segurança: o trigger roda (BEFORE INSERT) antes do check ser
avaliado, então mesmo que o client não envie `empresa_id`, o valor
preenchido pelo trigger é o que é validado — um client não consegue
inserir com `empresa_id` de outra empresa (o check rejeitaria), mas também
não precisa enviar o campo manualmente.

## Funções `security definer` — inventário completo

Duas no projeto, ambas deliberadas e documentadas inline no `schema.sql`:

1. **`empresa_do_usuario()`** — evita a recursão de RLS acima. Só retorna
   um `uuid` (o `empresa_id` do próprio usuário autenticado via
   `auth.uid()`) — não há parâmetro, não há dado controlado por terceiros
   em risco.
2. **`criar_empresa_e_perfil(nome_empresa text, nome_usuario text)`** —
   bootstrap de empresa/perfil no primeiro signup. Sem isso, a RLS de
   `perfis` bloqueia um usuário recém-criado de inserir seu próprio
   primeiro perfil (ele ainda não tem uma linha em `perfis`, então
   `empresa_do_usuario()` retorna null e toda policy falha fechada). A
   função insere `empresas` + `perfis` atomicamente, guarda contra duplo
   perfil (`if exists (select 1 from perfis where id = auth.uid())`).
   **Risco #10 — resolvido** (`supabase/migrations/20260807034032_restrict_criar_empresa_e_perfil.sql`):
   a função agora tem uma guarda explícita `if auth.uid() is null then raise
   exception` no início, e `revoke execute ... from public, anon` + `grant
   execute ... to authenticated` fecham a role `anon` fora da superfície de
   execução (antes não explorável, mas incidental — ver histórico abaixo do
   que era o risco).

Regra para o futuro: **toda função `security definer` nova precisa de**
`set search_path = public` (proteção contra search_path hijacking — já
esquecida uma vez em `preencher_empresa_id`, corrigida na revisão final da
branch de autenticação) **e uma justificativa em comentário inline** de por
que ela precisa bypassar RLS. Nunca introduzir uma sem as duas coisas.

## Riscos conhecidos

Ver também a tabela consolidada em
`docs/architecture/ARCHITECTURE.md#riscos-técnicos` — aqui, o detalhe
técnico de cada risco que é especificamente de banco/RLS:

### Risco #2 — referências cross-tenant não validadas (resolvido)

**Resolvido em `supabase/migrations/20260807034459_validar_tenant_agendamentos.sql`**,
via a opção "trigger de validação" descrita abaixo: `validar_tenant_agendamento`
(before insert/update em `agendamentos`) e
`validar_tenant_movimentacao_agendamento` (before insert/update em
`movimentacoes_caixa`) checam que `cliente_id`/`profissional_id`/
`servico_id`/`agendamento_id` referenciados pertencem à mesma `empresa_id`
do registro sendo criado/atualizado, e lançam exceção se não baterem.
Contexto histórico do risco original abaixo.

`agendamentos.profissional_id references profissionais(id)` não garante
que `profissionais.empresa_id = agendamentos.empresa_id`. Mesmo problema em
`servico_id`, `cliente_id`, e em `movimentacoes_caixa.agendamento_id`. A
RLS impede *listar* uma linha de outra empresa, mas **não impede
referenciá-la num insert/update** se o UUID for conhecido ou adivinhado —
Postgres FK só verifica que a linha existe em algum lugar, não que pertence
ao tenant certo.

Duas formas padrão de resolver, ambas viáveis em Postgres:

- **FK composta tenant-scoped**: adicionar `unique (id, empresa_id)` em
  `profissionais`/`servicos`/`clientes`, e trocar a FK em `agendamentos`
  para `foreign key (profissional_id, empresa_id) references
  profissionais(id, empresa_id)`. Mais forte (garantido pelo banco), mas
  exige tocar em todas as tabelas referenciadas.
- **Trigger de validação**: `before insert or update` em `agendamentos`
  checando que cada `_id` referenciado tem o mesmo `empresa_id`, via
  `raise exception` se não bater. Mais simples de adicionar incrementalmente,
  mas é uma checagem "manual" em vez de uma constraint estrutural.

Recomendação: FK composta onde for direto (tabelas com poucos
consumidores), trigger onde a FK composta exigir tocar em muita coisa de
uma vez. Decisão de implementação fica para quando a Agenda v1 for
implementada (é exatamente a tabela mais exposta a esse risco).

### Risco #3 — múltiplos caixas abertos (resolvido)

**Resolvido em `supabase/migrations/20260807035633_unico_caixa_aberto.sql`**,
exatamente com o fix direto descrito abaixo — o índice único parcial foi
criado como estava planejado. `caixa/actions.ts:abrirCaixa` também foi
atualizado (`77641f1`) para capturar a violação (`error.code === "23505"`)
e devolver uma mensagem amigável ("Já existe um caixa aberto para esta
empresa.") em vez do erro genérico do Postgres.

```sql
create unique index caixas_um_aberto_por_empresa
  on caixas (empresa_id)
  where status = 'aberto';
```

Índice único parcial — permite quantos caixas `'fechado'` quiser, mas só um
`'aberto'` por empresa, e falha no banco (não só na aplicação) se algo
tentar abrir um segundo.

### Risco #8 — `crud_perfis` permissiva (resolvido)

**Resolvido em `supabase/migrations/20260807033342_harden_perfis_rls.sql`**:
a policy `crud_perfis` (`for all`) foi removida e substituída por
`select_perfis_da_empresa` (select, escopado à empresa) +
`update_proprio_perfil` (update, `using`/`with check` restrito a
`id = auth.uid()`) — sem policy de insert/delete para `authenticated` (a
única forma legítima de criar um perfil continua sendo
`criar_empresa_e_perfil`, que roda como `security definer`). Um trigger
`bloquear_escalada_papel` (before update) adicionalmente impede que o
próprio usuário altere `papel` ou `empresa_id` no seu perfil, mesmo dentro
do update permitido. Contexto histórico do risco original abaixo.

`for all using (empresa_id = empresa_do_usuario())` deixa qualquer membro
autenticado da empresa inserir/atualizar qualquer linha de `perfis` da
própria empresa — incluindo, em teoria, mudar o próprio `papel` para
`gestor`, ou inserir uma linha de perfil vinculada a um `auth.users.id`
arbitrário antes desse usuário logar (não é possível hoje simplesmente
porque não existe fluxo de convite — mas o gap na policy já existe). Só
vira um risco ativo quando "convite de profissional/recepção" for
implementado — nesse momento, a policy de INSERT/UPDATE em `perfis`
provavelmente precisa restringir por `papel` (ex: só `gestor` pode
inserir/alterar `papel` de outros).

## Estratégia de migrations

**Decidido e implementado (2026-08-07)**: Supabase CLI adotado como fonte
de verdade do histórico de schema. MCP (`mcp__claude_ai_Supabase__*`)
continua disponível para inspeção/operação assistida (queries, advisors,
leitura de estado), mas deixa de ser usado para *definir* mudanças de
schema — isso agora só acontece via arquivo de migration versionado.

Setup já feito no projeto real (`jumyrtjjgnzhcbhvckgo`):

1. `supabase link --project-ref jumyrtjjgnzhcbhvckgo` — projeto local
   vinculado ao projeto real.
2. `supabase/migrations/` criado. O histórico de 5 migrations que já
   existia no banco (aplicadas via MCP antes da adoção do CLI) foi marcado
   como `reverted` via `supabase migration repair`, e o `schema.sql`
   existente (já verificado batendo exatamente com o schema real) virou a
   migration de baseline única: `20260807000634_baseline_schema.sql`,
   registrada como `applied` via `supabase migration repair --status
   applied`. Nenhum SQL foi reexecutado nesse processo — só sincronização
   do rastreamento.
3. `supabase db pull` (que geraria o baseline automaticamente via diff)
   **não funciona neste ambiente** — exige Docker Desktop pra criar um
   banco "sombra" de comparação, e Docker não está instalado. Decisão:
   **não instalar Docker só para isso** — o baseline foi montado
   manualmente a partir do `schema.sql` já verificado, que é equivalente.
   Consequência prática: comandos que dependem do shadow database
   (`supabase db diff`, `supabase db pull` para novas mudanças feitas fora
   do CLI) não estão disponíveis neste ambiente. `supabase db push`
   (aplicar migrations novas contra o projeto real) não depende de Docker
   e funciona normalmente.

Fluxo daqui pra frente para qualquer mudança de schema:

1. `supabase migration new <descricao>` — cria um arquivo timestampado
   vazio em `supabase/migrations/`.
2. Escrever o SQL da mudança nesse arquivo (nunca editar um arquivo de
   migration já commitado e aplicado — mesmo raciocínio de nunca reescrever
   um commit já mesclado).
3. `supabase db push` — aplica contra o projeto real.
4. Commitar o arquivo de migration junto com qualquer mudança de código
   TypeScript que dependa dele, no mesmo PR/commit lógico.

`schema.sql` na raiz de `supabase/` deixa de ser a fonte de mudanças
incrementais — mantido só como referência consolidada legada (o
`README.md` ainda o referencia para setup de projeto novo do zero; ver
pendência abaixo).

**Pendência aberta**: atualizar o `README.md` para orientar setup de
projeto novo via `supabase link` + `supabase db push` (aplica todas as
migrations em sequência) em vez de "rode `schema.sql` no SQL Editor" — o
fluxo antigo ainda funciona hoje (o conteúdo é idêntico), mas fica
desalinhado da estratégia de migrations assim que a primeira migration nova
for adicionada depois do baseline.
