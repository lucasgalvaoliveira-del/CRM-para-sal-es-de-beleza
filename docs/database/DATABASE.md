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

Proposta (ainda não implementada — decisão de produto pendente sobre
quando adotar):

1. Criar `supabase/migrations/`, numeração `<timestamp>_descricao.sql`
   (padrão Supabase CLI, compatível com `supabase db push`/`supabase
   migration up` se o projeto adotar a CLI localmente no futuro).
2. Toda mudança de schema daqui pra frente vira um arquivo de migration
   novo, nunca uma edição retroativa de um arquivo já "aplicado" — mesmo
   raciocínio de nunca reescrever um commit já mesclado.
3. `schema.sql` deixa de ser editado à mão e passa a ser (quando/se for
   necessário) o resultado consolidado de rodar todas as migrations em
   sequência num banco vazio — útil para quem só quer "zerar e montar tudo
   de novo" (é o que o `README.md` já orienta para configurar um projeto
   novo).
4. Aplicação continua podendo ser feita via
   `mcp__claude_ai_Supabase__apply_migration` (já é o fluxo usado desde a
   implementação da autenticação) — a mudança é só passar a nomear e
   versionar cada uma como arquivo no repo, não aplicar SQL ad-hoc sem
   deixar rastro versionado.

**Pendência de decisão de produto**: vale a pena adotar a Supabase CLI
localmente (permite `supabase db diff`, ambiente local com Docker, testes
de migration antes de aplicar no projeto real) ou é suficiente continuar
com o fluxo atual (editar SQL, aplicar via MCP, documentar em
`schema.sql`)? Ambos são compatíveis com a numeração de migrations proposta
acima — a CLI só adiciona tooling em cima, não é pré-requisito. Não
assumido aqui; ver `docs/roadmap/ROADMAP.md`.
