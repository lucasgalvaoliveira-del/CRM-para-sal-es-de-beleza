# Hardening P0 + Fundação de Timezone — Design

Data: 2026-08-07

## Contexto

Escopo aprovado pelo product owner após revisão arquitetural (ChatGPT,
verificada tecnicamente e documentada em `docs/architecture/ARCHITECTURE.md`
e `docs/database/DATABASE.md`), bloqueante antes de iniciar a Agenda v1
(spec em `docs/roadmap/AGENDA_AGENDAMENTOS_V1.md`). Este documento fecha o
design técnico exato de cada item — os itens já estavam descritos em nível
de risco nos docs de arquitetura; aqui é a solução concreta a implementar.

Decisão de processo confirmada nesta etapa: toda mudança de schema a partir
de agora é uma migration versionada em `supabase/migrations/`, aplicada via
`supabase db push` (Supabase CLI, já vinculado ao projeto
`jumyrtjjgnzhcbhvckgo`) — **não** mais via
`mcp__claude_ai_Supabase__apply_migration`. O MCP continua disponível só
para inspeção (queries, advisors, leitura de estado), nunca para definir
mudança de schema. Nenhuma edição do baseline já registrado
(`20260807000634_baseline_schema.sql`) — toda mudança é um arquivo novo.

## Item 1 — RLS de `perfis`: impedir escalada de papel

**Problema** (risco #8): a policy única `crud_perfis for all using (empresa_id
= empresa_do_usuario())` permite qualquer membro autenticado da empresa
inserir/atualizar/**apagar** qualquer linha de `perfis` da própria empresa —
incluindo mudar `papel` para `gestor`, mudar `empresa_id`, ou apagar o
perfil de um colega.

**Design**: substituir a policy única por policies granulares por operação,
mais um trigger que bloqueia mudança de `papel`/`empresa_id` via UPDATE
(defesa em profundidade — não depender só da policy).

```sql
drop policy "crud_perfis" on perfis;

create policy "select_perfis_da_empresa" on perfis for select
  using (empresa_id = empresa_do_usuario());

create policy "update_proprio_perfil" on perfis for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Sem policy de insert/delete para authenticated: a única forma legítima de
-- criar um perfil é via criar_empresa_e_perfil (security definer, roda como
-- dono da função — não é afetado por policies de authenticated). Sem
-- policy de delete: nenhum fluxo de "remover colega" existe ainda; deletar
-- fica bloqueado por padrão até esse fluxo existir e trazer sua própria
-- policy.

create or replace function impedir_escalada_papel()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.papel <> old.papel or new.empresa_id <> old.empresa_id then
    raise exception 'Não é permitido alterar papel ou empresa do próprio perfil.';
  end if;
  return new;
end;
$$;

create trigger bloquear_escalada_papel before update on perfis
  for each row execute function impedir_escalada_papel();
```

**Por que é seguro** (verificado, não assumido): `security definer`
functions rodam com o privilégio do *dono* da função, não do chamador — e
por padrão (sem `force row level security`, que nenhuma tabela usa aqui) o
dono de uma tabela ignora RLS completamente. `criar_empresa_e_perfil`
continua inserindo em `perfis` normalmente mesmo sem nenhuma policy de
insert para `authenticated`.

**Impacto na aplicação**: nenhum. Nada no código hoje faz UPDATE/DELETE em
`perfis`; `(app)/layout.tsx` só faz SELECT já filtrado por `id = user.id`,
compatível com a policy de select inalterada.

## Item 2 — Restringir `criar_empresa_e_perfil` a autenticados

**Problema** (risco #10): função executável pela role `anon`. Não é
explorável hoje (sem `auth.uid()`, o insert em `perfis` viola NOT NULL e a
transação reverte inteira), mas é superfície de ataque incidental, não
intencional.

**Design**:

```sql
create or replace function criar_empresa_e_perfil(nome_empresa text, nome_usuario text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  nova_empresa_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if exists (select 1 from perfis where id = auth.uid()) then
    raise exception 'Usuário já possui um perfil.';
  end if;

  insert into empresas (nome) values (nome_empresa) returning id into nova_empresa_id;
  insert into perfis (id, empresa_id, nome, papel) values (auth.uid(), nova_empresa_id, nome_usuario, 'gestor');

  return nova_empresa_id;
end;
$$;

revoke execute on function criar_empresa_e_perfil(text, text) from public;
revoke execute on function criar_empresa_e_perfil(text, text) from anon;
grant execute on function criar_empresa_e_perfil(text, text) to authenticated;
```

Um usuário recém-`signUp()`-ado já está na role `authenticated` (tem JWT
válido) antes mesmo de ter um `perfil` — o fluxo de signup continua
funcionando normalmente, só a role `anon` (requisição sem sessão nenhuma)
perde acesso.

## Item 3 — Corrigir lookup de perfil no Caixa

**Problema** (risco #9): `caixa/actions.ts:abrirCaixa` faz
`.from("perfis").select("empresa_id").single()` sem `.eq("id", user.id)`.
Funciona hoje só porque RLS + 1 usuário por empresa faz isso retornar
exatamente 1 linha; quebra (`.single()` lança erro de "múltiplas linhas")
assim que uma empresa tiver 2+ usuários.

**Design** (código TypeScript, não SQL):

```ts
export async function abrirCaixa(valorAbertura: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { data: perfil } = await supabase
    .from("perfis")
    .select("empresa_id")
    .eq("id", user.id)
    .single();
  if (!perfil) return { error: "Perfil não encontrado. Configure autenticação primeiro." };

  const { error } = await supabase.from("caixas").insert({
    empresa_id: perfil.empresa_id,
    valor_abertura: valorAbertura,
    status: "aberto",
  });

  if (error) {
    if (error.code === "23505") return { error: "Já existe um caixa aberto para esta empresa." };
    return { error: error.message };
  }
  revalidatePath("/caixa");
  return { error: null };
}
```

O tratamento do código `23505` (unique_violation) já antecipa o Item 5
(índice único de caixa aberto) — os dois itens vivem no mesmo arquivo,
implementados juntos.

## Item 4 — Proteção cross-tenant em `agendamentos` e `movimentacoes_caixa`

**Problema** (risco #2): `agendamentos.profissional_id`/`servico_id`/
`cliente_id` e `movimentacoes_caixa.agendamento_id` não validam que a linha
referenciada pertence à mesma empresa.

**Design**: trigger de validação (não FK composta — exigiria `unique (id,
empresa_id)` em três tabelas diferentes por pouco ganho adicional; trigger
é mais direto de aplicar de uma vez):

```sql
create or replace function validar_tenant_agendamento()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.cliente_id is not null and not exists (
    select 1 from clientes where id = new.cliente_id and empresa_id = new.empresa_id
  ) then
    raise exception 'Cliente não pertence à empresa deste agendamento.';
  end if;

  if not exists (
    select 1 from profissionais where id = new.profissional_id and empresa_id = new.empresa_id
  ) then
    raise exception 'Profissional não pertence à empresa deste agendamento.';
  end if;

  if not exists (
    select 1 from servicos where id = new.servico_id and empresa_id = new.empresa_id
  ) then
    raise exception 'Serviço não pertence à empresa deste agendamento.';
  end if;

  return new;
end;
$$;

create trigger validar_tenant_agendamento before insert or update on agendamentos
  for each row execute function validar_tenant_agendamento();

create or replace function validar_tenant_movimentacao_agendamento()
returns trigger language plpgsql set search_path = public as $$
declare
  empresa_da_movimentacao uuid;
begin
  if new.agendamento_id is not null then
    select empresa_id into empresa_da_movimentacao from caixas where id = new.caixa_id;
    if not exists (
      select 1 from agendamentos where id = new.agendamento_id and empresa_id = empresa_da_movimentacao
    ) then
      raise exception 'Agendamento não pertence à empresa deste caixa.';
    end if;
  end if;
  return new;
end;
$$;

create trigger validar_tenant_movimentacao before insert or update on movimentacoes_caixa
  for each row execute function validar_tenant_movimentacao_agendamento();
```

Sem impacto na aplicação hoje: nada cria `agendamentos` ainda (Agenda v1
não implementada), e `movimentacoes_caixa` hoje nunca envia
`agendamento_id` (`registrarMovimentacao` não tem esse campo no form).

## Item 5 — Exclusion constraint contra conflito de agenda

**Design** (idêntico ao já especificado em
`docs/roadmap/AGENDA_AGENDAMENTOS_V1.md#regra-de-conflito-dupla-reserva`):

```sql
create extension if not exists btree_gist;

alter table agendamentos add constraint sem_sobreposicao_profissional
  exclude using gist (
    profissional_id with =,
    tstzrange(inicio, fim) with &&
  ) where (status not in ('cancelado', 'faltou'));
```

Sem impacto na aplicação hoje (mesma razão do Item 4 — nada cria
agendamento ainda). Entra agora para a Agenda v1 nascer com a garantia já
no lugar, não como um passo a lembrar depois.

## Item 6 — Único caixa aberto por empresa

```sql
create unique index caixas_um_aberto_por_empresa
  on caixas (empresa_id)
  where status = 'aberto';
```

Pareado com o Item 3 (`abrirCaixa` já trata `error.code === "23505"`).

## Item 7 — Fundação de timezone

**Design**, três partes:

### 7a. Coluna `empresas.timezone`

```sql
alter table empresas add column timezone text not null default 'America/Sao_Paulo';
```

Sem validação contra a lista de timezones IANA via CHECK constraint —
Postgres não permite subquery em CHECK (não dá para validar contra
`pg_timezone_names` dessa forma), e não existe ainda UI para editar esse
campo (fica com o default para toda empresa por enquanto). Validação fica
para quando uma tela de configuração for implementada.

### 7b. `v_faturamento_diario` agrupando pelo dia local da empresa

**Problema**: `date(m.criado_em)` usa o timezone da sessão do Postgres
(efetivamente UTC), não o da empresa — uma movimentação às 23h30 em
`America/Sao_Paulo` (02h30 UTC do dia seguinte) cai no dia UTC errado.

```sql
create or replace view v_faturamento_diario as
select
  c.empresa_id,
  date(m.criado_em at time zone e.timezone) as dia,
  sum(case when m.categoria = 'servico' then m.valor else 0 end) as total_servicos,
  sum(case when m.categoria = 'produto' then m.valor else 0 end) as total_produtos,
  sum(case when m.tipo = 'entrada' then m.valor else 0 end) as total_entradas,
  sum(case when m.tipo = 'saida' then m.valor else 0 end) as total_saidas
from movimentacoes_caixa m
join caixas c on c.id = m.caixa_id
join empresas e on e.id = c.empresa_id
group by c.empresa_id, date(m.criado_em at time zone e.timezone);

-- create or replace view não garante preservar reloptions em toda versão
-- do Postgres — reafirmar explicitamente por segurança.
alter view v_faturamento_diario set (security_invoker = on);
```

`timestamptz at time zone 'America/Sao_Paulo'` converte para o horário de
parede local (tipo `timestamp` sem tz); `date(...)` daquilo extrai o dia
correto. `inicio`/`fim`/`criado_em` continuam `timestamptz` armazenados em
UTC em toda tabela — só a leitura/agrupamento passa a considerar o fuso da
empresa, nunca a gravação.

### 7c. Exibição em `/caixa` e `/relatorios` — nunca depender do runtime

**Problema**: `caixa/page.tsx` e `relatorios/page.tsx` são Server
Components — `new Date(...).toLocaleTimeString("pt-BR", {...})` sem
`timeZone` explícito usa o timezone do **processo Node.js no servidor**
(não o do navegador do usuário, e não o da empresa), o que é exatamente a
"terceira fonte de verdade" que a decisão de timezone quer eliminar.

**Design**: cada página passa a buscar `empresas.timezone` (join a partir
do `perfil` do usuário autenticado, mesmo padrão já usado em
`(app)/layout.tsx`) e passar explicitamente via `timeZone:` em toda
chamada de formatação de data/hora:

```ts
// no topo de CaixaPage e RelatoriosPage, antes das queries de negócio:
const { data: { user } } = await supabase.auth.getUser();
const { data: perfil } = await supabase
  .from("perfis")
  .select("empresas(timezone)")
  .eq("id", user!.id)
  .single();
const empresaRelacionada = Array.isArray(perfil?.empresas) ? perfil?.empresas[0] : perfil?.empresas;
const timezone = empresaRelacionada?.timezone ?? "America/Sao_Paulo";
```

```tsx
// caixa/page.tsx
{new Date(m.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: timezone })}

// relatorios/page.tsx
{new Date(d.dia).toLocaleDateString("pt-BR", { timeZone: timezone })}
```

Cada página busca seu próprio `timezone` (mesmo padrão de query
independente por página já usado no projeto — ver
`docs/CODING_STANDARDS.md`), em vez de introduzir um Context/provider só
para isso — YAGNI até um terceiro consumidor precisar do mesmo dado.

## Fora de escopo desta etapa

- UI para editar `empresas.timezone` (fica hardcoded no default até
  existir tela de configurações).
- Qualquer coisa da Agenda v1 além da exclusion constraint (Item 5) e da
  proteção cross-tenant (Item 4) — a spec completa da feature continua em
  `docs/roadmap/AGENDA_AGENDAMENTOS_V1.md`, não implementada agora.
- Restrição de `perfis` por papel além de bloquear auto-escalação (ex:
  "só gestor pode convidar") — fica para quando o fluxo de convite existir.

## Testes

Sem framework de testes automatizados (decisão já registrada). Verificação
via `supabase db push` contra o projeto real + chamadas REST autenticadas
reais (mesmo método usado na implementação da autenticação) + queries SQL
de confirmação, incluindo teste negativo (tentar escalar papel, tentar
sobrepor agendamento, tentar abrir segundo caixa — cada um deve falhar com
o erro esperado, não silenciosamente passar).
