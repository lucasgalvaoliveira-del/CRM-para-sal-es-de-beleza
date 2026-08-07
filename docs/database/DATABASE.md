# Banco de dados — Alva

Fonte de verdade hoje: `supabase/schema.sql` (arquivo único, rodado no SQL
Editor ou via `mcp__claude_ai_Supabase__apply_migration`). Este documento
explica o schema atual, não o substitui — sempre confira `schema.sql` para
o SQL exato.

## Tabelas

| Tabela | Chave estrangeira de tenant | Propósito |
|---|---|---|
| `empresas` | — (é o próprio tenant) | Um salão. |
| `perfis` | `empresa_id` | 1:1 com `auth.users` (PK = FK). `papel`: gestor/profissional/recepcao — **campo existe, não é usado em nenhuma autorização ainda**. |
| `profissionais` | `empresa_id` | Cadastro de staff. `percentual_comissao` existe, sem lógica de comissionamento ainda. |
| `clientes` | `empresa_id` | — |
| `servicos` | `empresa_id` | — |
| `produtos` | `empresa_id` | Estoque + preço custo/venda. |
| `agendamentos` | `empresa_id` | Referencia `clientes`, `profissionais`, `servicos` — **sem garantir que essas referências pertencem à mesma empresa** (risco #2, ver abaixo). `fim > inicio` é validado; sobreposição de horário do mesmo profissional **não é**. |
| `caixas` | `empresa_id` | Sessão de caixa aberto/fechado. **Nada impede duas linhas `status = 'aberto'` simultâneas na mesma empresa** (risco #3). |
| `movimentacoes_caixa` | via `caixa_id → caixas.empresa_id` (indireto) | Entrada/saída. `agendamento_id` opcional, mesmo problema de referência cross-tenant do risco #2. |

View: `v_faturamento_diario` — soma diária de `movimentacoes_caixa` por
`empresa_id`, usada em `/relatorios`. **Tinha `security_invoker` desligado
até a correção aplicada durante a implementação da autenticação** (rodava
como dono da view, ignorando RLS, vazando faturamento de todas as empresas
para qualquer holder da chave `anon`) — corrigido, `security_invoker = on`
desde então. Qualquer view nova **precisa** desse `alter view ... set
(security_invoker = on)` explícito, porque Postgres/Supabase não liga isso
por padrão.

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
   **Risco #10** (baixa severidade): é executável pela role `anon` — não
   explorável hoje (sem sessão, `auth.uid()` é null, o insert em `perfis`
   viola NOT NULL e a transação inteira reverte), mas não há `revoke
   execute ... from anon` nem uma guarda explícita `if auth.uid() is null
   then raise exception`. Fechar isso é barato e reduz superfície de
   ataque incidental — candidato a uma migration pequena e isolada.

Regra para o futuro: **toda função `security definer` nova precisa de**
`set search_path = public` (proteção contra search_path hijacking — já
esquecida uma vez em `preencher_empresa_id`, corrigida na revisão final da
branch de autenticação) **e uma justificativa em comentário inline** de por
que ela precisa bypassar RLS. Nunca introduzir uma sem as duas coisas.

## Riscos conhecidos

Ver também a tabela consolidada em
`docs/architecture/ARCHITECTURE.md#riscos-técnicos` — aqui, o detalhe
técnico de cada risco que é especificamente de banco/RLS:

### Risco #2 — referências cross-tenant não validadas

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

### Risco #3 — múltiplos caixas abertos

Sem constraint no banco. Fix direto:

```sql
create unique index caixas_um_aberto_por_empresa
  on caixas (empresa_id)
  where status = 'aberto';
```

Índice único parcial — permite quantos caixas `'fechado'` quiser, mas só um
`'aberto'` por empresa, e falha no banco (não só na aplicação) se algo
tentar abrir um segundo. Precisa andar junto com `abrirCaixa` passando a
checar e devolver um erro amigável em vez de deixar a constraint do banco
estourar como erro genérico pro usuário.

### Risco #8 — `crud_perfis` permissiva

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
