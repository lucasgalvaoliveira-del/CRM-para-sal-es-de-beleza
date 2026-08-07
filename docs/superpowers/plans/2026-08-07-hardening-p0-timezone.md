# Hardening P0 + Fundação de Timezone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 5 P0 security/integrity blockers (RLS role-escalation in `perfis`, `anon`-executable bootstrap RPC, unscoped perfil lookup in Caixa, cross-tenant reference gaps, missing single-open-caixa constraint) plus the timezone foundation (single IANA timezone per empresa, correctly used everywhere a date/time is stored, grouped, or displayed) — all approved as mandatory before Agenda v1 implementation starts.

**Architecture:** Every schema change is a versioned migration file in `supabase/migrations/`, authored via `supabase migration new` and applied to the live project via `supabase db push` (Supabase CLI, already linked to project `jumyrtjjgnzhcbhvckgo`) — never via `mcp__claude_ai_Supabase__apply_migration`, which is now inspection-only. Two Server Component pages (`caixa/page.tsx`, `relatorios/page.tsx`) and one Server Action file (`caixa/actions.ts`) get matching TypeScript fixes so no date/time ever formats using the server process's runtime timezone.

**Tech Stack:** Same as the rest of the project — Next.js 16 App Router, TypeScript, `@supabase/ssr`, Supabase Postgres + Auth + RLS, Supabase CLI (via `npx.cmd supabase`, no global install).

## Global Constraints

- Every schema change is a new file in `supabase/migrations/`, created with `npx.cmd supabase migration new <name>` and applied with `npx.cmd supabase db push`. Never edit the existing baseline migration (`20260807000634_baseline_schema.sql`). Never use `mcp__claude_ai_Supabase__apply_migration` in this plan — that tool is inspection-only from now on (use `mcp__claude_ai_Supabase__execute_sql` for read-only verification queries, and `mcp__claude_ai_Supabase__get_advisors` for security checks).
- No automated test suite exists in this project (documented, deliberate). Verification is: `supabase db push` succeeding, live SQL/REST checks against the real project, and `npx tsc --noEmit`. Do not introduce a test framework.
- `inicio`, `fim`, and every `criado_em`/`aberto_em`/`fechado_em` column stay `timestamptz`, stored in UTC. Only *reading/grouping/display* logic becomes timezone-aware — never change how a timestamp is written.
- `empresas.timezone` default is `'America/Sao_Paulo'`, IANA string, no CHECK-constraint validation (Postgres CHECK can't subquery `pg_timezone_names`; there's no UI to edit this yet, so untrusted input isn't a concern this round).
- Every `security definer` function change keeps `set search_path = public` — this project has been bitten by omitting it once already (see `docs/database/DATABASE.md`).
- Server Action error-return convention: `{ error: string | null }`, `redirect()`/`revalidatePath()` on success — matches existing `caixa/actions.ts` pattern, do not change the shape.
- Match existing Tailwind/JSX conventions exactly in any file touched — see `docs/CODING_STANDARDS.md`. These two tasks only change data-fetching and formatting logic, not markup/styling.

Full design: `docs/superpowers/specs/2026-08-07-hardening-p0-timezone-design.md`. Background risk docs: `docs/architecture/ARCHITECTURE.md`, `docs/database/DATABASE.md`.

---

### Task 1: RLS hardening on `perfis` — block role/tenant self-escalation

**Files:**
- Create: `supabase/migrations/<timestamp>_harden_perfis_rls.sql`

**Interfaces:**
- Produces: policies `select_perfis_da_empresa`, `update_proprio_perfil` and trigger `bloquear_escalada_papel` on `perfis` — no other task depends on these by name, but Task 9's verification checks them.

- [ ] **Step 1: Create the migration file**

```bash
npx.cmd supabase migration new harden_perfis_rls
```

This prints the created file path (`supabase/migrations/<timestamp>_harden_perfis_rls.sql`) — use that exact path for the next step.

- [ ] **Step 2: Write the migration SQL**

```sql
drop policy "crud_perfis" on perfis;

create policy "select_perfis_da_empresa" on perfis for select
  using (empresa_id = empresa_do_usuario());

create policy "update_proprio_perfil" on perfis for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Sem policy de insert/delete para authenticated: a única forma legítima de
-- criar um perfil é via criar_empresa_e_perfil (security definer, roda como
-- dono da função — não é afetado por policies de authenticated). Delete
-- fica bloqueado por padrão até existir um fluxo de "remover colega".

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

- [ ] **Step 3: Apply to the real project**

```bash
npx.cmd supabase db push
```

Expected: success output listing this migration as applied.

- [ ] **Step 4: Verify — policies exist, RPC still works**

Run via `mcp__claude_ai_Supabase__execute_sql` on project `jumyrtjjgnzhcbhvckgo`:
```sql
select polname, cmd from pg_policies where tablename = 'perfis' order by polname;
```
Expected: exactly `select_perfis_da_empresa` (cmd `r`) and `update_proprio_perfil` (cmd `u`) — no `crud_perfis` row anymore, no insert/delete policy rows.

Then confirm the bootstrap RPC still works end-to-end (a `security definer` function bypasses RLS regardless of these policies, but confirm live, don't assume): sign up a fresh test user via `POST https://jumyrtjjgnzhcbhvckgo.supabase.co/auth/v1/signup` (apikey header = the anon key from `.env.local`), then call `POST https://jumyrtjjgnzhcbhvckgo.supabase.co/rest/v1/rpc/criar_empresa_e_perfil` with that user's `access_token` as `Authorization: Bearer`, body `{"nome_empresa":"Verificacao Task1","nome_usuario":"Verificador"}`. Expected: returns a UUID (the new empresa id), no error.

- [ ] **Step 5: Verify — a colleague cannot escalate another user's papel**

Using the SAME test user's `access_token` from Step 4, attempt (via REST, `PATCH https://jumyrtjjgnzhcbhvckgo.supabase.co/rest/v1/perfis?id=eq.<same-user-id>` with `Authorization: Bearer <token>`, body `{"papel":"recepcao"}`) to change their own `papel`. Expected: the request fails (the `bloquear_escalada_papel` trigger raises an exception) — confirm via the response body containing "Não é permitido alterar papel".

- [ ] **Step 6: Clean up test data**

```sql
-- via mcp__claude_ai_Supabase__execute_sql, replace the UUIDs with the ones from this test run
delete from perfis where nome = 'Verificador';
delete from empresas where nome = 'Verificacao Task1';
delete from auth.users where email like 'verify-task1-%@example.com'; -- adjust to the actual test email used
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/
git commit -m "fix(db): harden perfis RLS to block role/tenant self-escalation"
```

---

### Task 2: Restrict `criar_empresa_e_perfil` execution to authenticated users

**Files:**
- Create: `supabase/migrations/<timestamp>_restrict_criar_empresa_e_perfil.sql`

**Interfaces:**
- Consumes: none.
- Produces: no interface change — `criar_empresa_e_perfil(nome_empresa text, nome_usuario text) returns uuid` keeps its exact signature; Task 9's verification confirms `anon` can no longer call it.

- [ ] **Step 1: Create the migration file**

```bash
npx.cmd supabase migration new restrict_criar_empresa_e_perfil
```

- [ ] **Step 2: Write the migration SQL**

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

- [ ] **Step 3: Apply**

```bash
npx.cmd supabase db push
```

- [ ] **Step 4: Verify — `anon` is rejected**

```bash
curl -s -X POST "https://jumyrtjjgnzhcbhvckgo.supabase.co/rest/v1/rpc/criar_empresa_e_perfil" \
  -H "apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY from .env.local>" \
  -H "Content-Type: application/json" \
  -d '{"nome_empresa":"Nao Deveria Existir","nome_usuario":"Anon"}'
```
Expected: an HTTP error response (permission denied / function not found for role), not a UUID. This is a call with the anon key but **no** `Authorization: Bearer <user token>` header — i.e. genuinely unauthenticated.

- [ ] **Step 5: Verify — authenticated still works**

Sign up a fresh test user (same REST pattern as Task 1 Step 4) and confirm `criar_empresa_e_perfil` still succeeds with that user's `access_token`. Expected: returns a UUID.

- [ ] **Step 6: Clean up test data**

Delete the test user/empresa/perfil created in Step 5 via `mcp__claude_ai_Supabase__execute_sql`, matching the pattern in Task 1 Step 6.

- [ ] **Step 7: Verify with advisors**

Run `mcp__claude_ai_Supabase__get_advisors` (type: security) — confirm no warning remains about `criar_empresa_e_perfil` being executable by `anon` (there was one before this change; check it's gone or was never separately flagged — either is fine, just confirm no new warning appeared).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/
git commit -m "fix(db): restrict criar_empresa_e_perfil execution to authenticated role"
```

---

### Task 3: Cross-tenant validation triggers for `agendamentos` and `movimentacoes_caixa`

**Files:**
- Create: `supabase/migrations/<timestamp>_validar_tenant_agendamentos.sql`

**Interfaces:**
- Produces: triggers `validar_tenant_agendamento` (on `agendamentos`) and `validar_tenant_movimentacao` (on `movimentacoes_caixa`) — Task 4 and Task 9 rely on these existing but not on any specific function name being called from application code.

- [ ] **Step 1: Create the migration file**

```bash
npx.cmd supabase migration new validar_tenant_agendamentos
```

- [ ] **Step 2: Write the migration SQL**

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

- [ ] **Step 3: Apply**

```bash
npx.cmd supabase db push
```

- [ ] **Step 4: Verify — cross-tenant reference is rejected**

Via `mcp__claude_ai_Supabase__execute_sql` (superuser SQL is fine here — this is testing the trigger logic itself, which fires regardless of role; it's not an RLS test):
```sql
-- create two throwaway empresas + one profissional in the second one
insert into empresas (nome) values ('Empresa A Teste'), ('Empresa B Teste')
  returning id, nome;
-- (note the two returned ids as EMPRESA_A and EMPRESA_B)

insert into profissionais (empresa_id, nome) values ('<EMPRESA_B>', 'Profissional B')
  returning id;
-- (note this id as PROFISSIONAL_B)

insert into servicos (empresa_id, nome, preco) values ('<EMPRESA_A>', 'Servico A', 50)
  returning id;
-- (note this id as SERVICO_A)

-- this insert should FAIL: profissional belongs to Empresa B, agendamento says Empresa A
insert into agendamentos (empresa_id, profissional_id, servico_id, inicio, fim)
values ('<EMPRESA_A>', '<PROFISSIONAL_B>', '<SERVICO_A>', now(), now() + interval '30 minutes');
```
Expected: the final insert raises `'Profissional não pertence à empresa deste agendamento.'`.

- [ ] **Step 5: Clean up test data**

```sql
delete from empresas where nome in ('Empresa A Teste', 'Empresa B Teste'); -- cascades profissionais/servicos
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/
git commit -m "fix(db): validate agendamentos and movimentacoes_caixa references stay within tenant"
```

---

### Task 4: Exclusion constraint preventing overlapping agendamentos per professional

**Files:**
- Create: `supabase/migrations/<timestamp>_prevenir_conflito_agenda.sql`

**Interfaces:**
- Consumes: `agendamentos` table (from baseline), does not depend on Task 3's triggers but is naturally applied after them (both touch `agendamentos`).
- Produces: constraint `sem_sobreposicao_profissional` on `agendamentos` — the Agenda v1 feature (future work, not this plan) relies on this existing.

- [ ] **Step 1: Create the migration file**

```bash
npx.cmd supabase migration new prevenir_conflito_agenda
```

- [ ] **Step 2: Write the migration SQL**

```sql
create extension if not exists btree_gist;

alter table agendamentos add constraint sem_sobreposicao_profissional
  exclude using gist (
    profissional_id with =,
    tstzrange(inicio, fim) with &&
  ) where (status not in ('cancelado', 'faltou'));
```

- [ ] **Step 3: Apply**

```bash
npx.cmd supabase db push
```

- [ ] **Step 4: Verify — overlapping insert is rejected, non-overlapping succeeds**

Via `mcp__claude_ai_Supabase__execute_sql`:
```sql
insert into empresas (nome) values ('Empresa Conflito Teste') returning id;
-- note as EMPRESA_C

insert into profissionais (empresa_id, nome) values ('<EMPRESA_C>', 'Prof Conflito') returning id;
-- note as PROF_C

insert into servicos (empresa_id, nome, preco) values ('<EMPRESA_C>', 'Servico Conflito', 50) returning id;
-- note as SERVICO_C

insert into agendamentos (empresa_id, profissional_id, servico_id, inicio, fim)
values ('<EMPRESA_C>', '<PROF_C>', '<SERVICO_C>', '2026-09-01 10:00:00+00', '2026-09-01 11:00:00+00');
-- expected: succeeds

insert into agendamentos (empresa_id, profissional_id, servico_id, inicio, fim)
values ('<EMPRESA_C>', '<PROF_C>', '<SERVICO_C>', '2026-09-01 10:30:00+00', '2026-09-01 11:30:00+00');
-- expected: FAILS with an exclusion constraint violation (overlaps the first)

insert into agendamentos (empresa_id, profissional_id, servico_id, inicio, fim)
values ('<EMPRESA_C>', '<PROF_C>', '<SERVICO_C>', '2026-09-01 11:00:00+00', '2026-09-01 12:00:00+00');
-- expected: succeeds (starts exactly when the first ends — no overlap, tstzrange is [) by default)
```

- [ ] **Step 5: Clean up test data**

```sql
delete from empresas where nome = 'Empresa Conflito Teste'; -- cascades everything else created above
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(db): add exclusion constraint preventing overlapping agendamentos"
```

---

### Task 5: Single open caixa per empresa

**Files:**
- Create: `supabase/migrations/<timestamp>_unico_caixa_aberto.sql`

**Interfaces:**
- Produces: unique index `caixas_um_aberto_por_empresa` — consumed by Task 7's `abrirCaixa` fix, which handles the resulting `23505` error code.

- [ ] **Step 1: Create the migration file**

```bash
npx.cmd supabase migration new unico_caixa_aberto
```

- [ ] **Step 2: Write the migration SQL**

```sql
create unique index caixas_um_aberto_por_empresa
  on caixas (empresa_id)
  where status = 'aberto';
```

- [ ] **Step 3: Apply**

```bash
npx.cmd supabase db push
```

- [ ] **Step 4: Verify — second open caixa is rejected**

Via `mcp__claude_ai_Supabase__execute_sql`:
```sql
insert into empresas (nome) values ('Empresa Caixa Teste') returning id;
-- note as EMPRESA_D

insert into caixas (empresa_id, status, valor_abertura) values ('<EMPRESA_D>', 'aberto', 100)
  returning id;
-- expected: succeeds

insert into caixas (empresa_id, status, valor_abertura) values ('<EMPRESA_D>', 'aberto', 50);
-- expected: FAILS with a unique constraint violation (code 23505)

insert into caixas (empresa_id, status, valor_abertura) values ('<EMPRESA_D>', 'fechado', 50);
-- expected: succeeds (status is 'fechado', outside the partial index)
```

- [ ] **Step 5: Clean up test data**

```sql
delete from empresas where nome = 'Empresa Caixa Teste';
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(db): enforce a single open caixa per empresa"
```

---

### Task 6: Timezone foundation — `empresas.timezone` and `v_faturamento_diario`

**Files:**
- Create: `supabase/migrations/<timestamp>_timezone_empresa.sql`

**Interfaces:**
- Produces: column `empresas.timezone text not null default 'America/Sao_Paulo'`; `v_faturamento_diario` now groups `dia` by the empresa's local calendar day instead of UTC. Task 8 (Relatórios page) and Task 7 (Caixa page) both query `perfis -> empresas(timezone)`.

- [ ] **Step 1: Create the migration file**

```bash
npx.cmd supabase migration new timezone_empresa
```

- [ ] **Step 2: Write the migration SQL**

```sql
alter table empresas add column timezone text not null default 'America/Sao_Paulo';

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

- [ ] **Step 3: Apply**

```bash
npx.cmd supabase db push
```

- [ ] **Step 4: Verify — column exists with the right default**

Via `mcp__claude_ai_Supabase__execute_sql`:
```sql
select column_name, column_default, is_nullable
from information_schema.columns
where table_name = 'empresas' and column_name = 'timezone';
```
Expected: one row, `column_default` containing `'America/Sao_Paulo'`, `is_nullable = 'NO'`.

- [ ] **Step 5: Verify — view still has security_invoker on, and groups by local day correctly**

```sql
select c.reloptions from pg_class c where c.relname = 'v_faturamento_diario';
```
Expected: `["security_invoker=on"]`.

Then test the day-bucketing directly:
```sql
insert into empresas (nome, timezone) values ('Empresa TZ Teste', 'America/Sao_Paulo') returning id;
-- note as EMPRESA_E

insert into caixas (empresa_id, status, valor_abertura) values ('<EMPRESA_E>', 'aberto', 0) returning id;
-- note as CAIXA_E

-- 2026-09-01 23:30 America/Sao_Paulo (UTC-3) = 2026-09-02 02:30 UTC
insert into movimentacoes_caixa (caixa_id, tipo, categoria, forma_pagamento, valor, criado_em)
values ('<CAIXA_E>', 'entrada', 'servico', 'dinheiro', 100, '2026-09-02 02:30:00+00');

select empresa_id, dia, total_servicos from v_faturamento_diario where empresa_id = '<EMPRESA_E>';
```
Expected: `dia` is `2026-09-01` (the correct local calendar day in `America/Sao_Paulo`), not `2026-09-02` (what plain UTC bucketing would give).

- [ ] **Step 6: Clean up test data**

```sql
delete from empresas where nome = 'Empresa TZ Teste'; -- cascades caixas/movimentacoes_caixa
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(db): add empresas.timezone and group v_faturamento_diario by local day"
```

---

### Task 7: Caixa — scoped perfil lookup, friendly duplicate-caixa error, timezone-aware display

**Files:**
- Modify: `src/app/(app)/caixa/actions.ts` (full current content shown below)
- Modify: `src/app/(app)/caixa/page.tsx` (full current content shown below)

**Interfaces:**
- Consumes: unique index `caixas_um_aberto_por_empresa` (Task 5, triggers Postgres error code `23505` on violation); column `empresas.timezone` (Task 6).
- Produces: no new exports — same function signatures as before (`abrirCaixa(valorAbertura: number)`, `registrarMovimentacao(...)`, `fecharCaixa(...)`, `CaixaPage()`).

- [ ] **Step 1: Replace `src/app/(app)/caixa/actions.ts`**

Current content (for reference — this whole file is being replaced):
```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function abrirCaixa(valorAbertura: number) {
  const supabase = await createClient();
  const { data: perfil } = await supabase.from("perfis").select("empresa_id").single();
  if (!perfil) return { error: "Perfil não encontrado. Configure autenticação primeiro." };

  const { error } = await supabase.from("caixas").insert({
    empresa_id: perfil.empresa_id,
    valor_abertura: valorAbertura,
    status: "aberto",
  });

  if (error) return { error: error.message };
  revalidatePath("/caixa");
  return { error: null };
}

export async function registrarMovimentacao(params: {
  caixaId: string;
  tipo: "entrada" | "saida";
  categoria: string;
  formaPagamento: string;
  valor: number;
  descricao?: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("movimentacoes_caixa").insert({
    caixa_id: params.caixaId,
    tipo: params.tipo,
    categoria: params.categoria,
    forma_pagamento: params.formaPagamento,
    valor: params.valor,
    descricao: params.descricao,
  });

  if (error) return { error: error.message };
  revalidatePath("/caixa");
  return { error: null };
}

export async function fecharCaixa(caixaId: string, valorFechamento: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("caixas")
    .update({ status: "fechado", fechado_em: new Date().toISOString(), valor_fechamento: valorFechamento })
    .eq("id", caixaId);

  if (error) return { error: error.message };
  revalidatePath("/caixa");
  return { error: null };
}
```

New content:
```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function abrirCaixa(valorAbertura: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

export async function registrarMovimentacao(params: {
  caixaId: string;
  tipo: "entrada" | "saida";
  categoria: string;
  formaPagamento: string;
  valor: number;
  descricao?: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("movimentacoes_caixa").insert({
    caixa_id: params.caixaId,
    tipo: params.tipo,
    categoria: params.categoria,
    forma_pagamento: params.formaPagamento,
    valor: params.valor,
    descricao: params.descricao,
  });

  if (error) return { error: error.message };
  revalidatePath("/caixa");
  return { error: null };
}

export async function fecharCaixa(caixaId: string, valorFechamento: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("caixas")
    .update({ status: "fechado", fechado_em: new Date().toISOString(), valor_fechamento: valorFechamento })
    .eq("id", caixaId);

  if (error) return { error: error.message };
  revalidatePath("/caixa");
  return { error: null };
}
```

Note: `registrarMovimentacao` and `fecharCaixa` are unchanged — only `abrirCaixa` gets the auth-scoped lookup and the friendly `23505` handling.

- [ ] **Step 2: Replace `src/app/(app)/caixa/page.tsx`**

Current content (for reference — this whole file is being replaced):
```tsx
import { createClient } from "@/lib/supabase/server";
import AbrirCaixaForm from "./AbrirCaixaForm";
import NovaMovimentacaoForm from "./NovaMovimentacaoForm";

export default async function CaixaPage() {
  const supabase = await createClient();

  const { data: caixaAberto } = await supabase
    .from("caixas")
    .select("id, aberto_em, valor_abertura")
    .eq("status", "aberto")
    .order("aberto_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  let movimentacoes: { id: string; tipo: string; categoria: string; valor: number; descricao: string | null; criado_em: string }[] = [];
  if (caixaAberto) {
    const { data } = await supabase
      .from("movimentacoes_caixa")
      .select("id, tipo, categoria, valor, descricao, criado_em")
      .eq("caixa_id", caixaAberto.id)
      .order("criado_em", { ascending: false });
    movimentacoes = data ?? [];
  }

  const totalEntradas = movimentacoes.filter((m) => m.tipo === "entrada").reduce((s, m) => s + Number(m.valor), 0);
  const totalSaidas = movimentacoes.filter((m) => m.tipo === "saida").reduce((s, m) => s + Number(m.valor), 0);
  const saldo = (caixaAberto?.valor_abertura ?? 0) + totalEntradas - totalSaidas;

  return (
    <div>
      <h1 className="font-display text-3xl text-plum-950">Caixa</h1>
      <p className="text-ink-900/60 mt-1">Movimentações do caixa aberto no momento.</p>

      {!caixaAberto ? (
        <AbrirCaixaForm />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 mt-8">
            <div className="rounded-2xl border border-plum-400/20 bg-white p-5">
              <p className="text-xs uppercase tracking-wide text-ink-900/50">Entradas</p>
              <p className="font-display text-2xl text-sage-500 mt-2">R$ {totalEntradas.toFixed(2)}</p>
            </div>
            <div className="rounded-2xl border border-plum-400/20 bg-white p-5">
              <p className="text-xs uppercase tracking-wide text-ink-900/50">Saídas</p>
              <p className="font-display text-2xl text-red-500 mt-2">R$ {totalSaidas.toFixed(2)}</p>
            </div>
            <div className="rounded-2xl border border-plum-400/20 bg-white p-5">
              <p className="text-xs uppercase tracking-wide text-ink-900/50">Saldo</p>
              <p className="font-display text-2xl text-plum-800 mt-2">R$ {saldo.toFixed(2)}</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-[1fr_320px] gap-6 items-start">
          <div className="rounded-2xl border border-plum-400/20 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-ivory-100 text-left text-ink-900/60">
                <tr>
                  <th className="px-4 py-3 font-medium">Horário</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Categoria</th>
                  <th className="px-4 py-3 font-medium">Descrição</th>
                  <th className="px-4 py-3 font-medium text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {movimentacoes.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-ink-900/50">
                      Nenhuma movimentação ainda.
                    </td>
                  </tr>
                )}
                {movimentacoes.map((m) => (
                  <tr key={m.id} className="border-t border-plum-400/10">
                    <td className="px-4 py-3 text-ink-900/60">
                      {new Date(m.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-3 capitalize">{m.tipo}</td>
                    <td className="px-4 py-3 capitalize text-ink-900/70">{m.categoria}</td>
                    <td className="px-4 py-3 text-ink-900/70">{m.descricao || "—"}</td>
                    <td className={`px-4 py-3 text-right font-medium ${m.tipo === "entrada" ? "text-sage-500" : "text-red-500"}`}>
                      {m.tipo === "entrada" ? "+" : "−"} R$ {Number(m.valor).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <NovaMovimentacaoForm caixaId={caixaAberto.id} />
          </div>
        </>
      )}
    </div>
  );
}
```

New content:
```tsx
import { createClient } from "@/lib/supabase/server";
import AbrirCaixaForm from "./AbrirCaixaForm";
import NovaMovimentacaoForm from "./NovaMovimentacaoForm";

export default async function CaixaPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let timezone = "America/Sao_Paulo";
  if (user) {
    const { data: perfil } = await supabase
      .from("perfis")
      .select("empresas(timezone)")
      .eq("id", user.id)
      .single();
    const empresa = Array.isArray(perfil?.empresas) ? perfil?.empresas[0] : perfil?.empresas;
    timezone = empresa?.timezone ?? timezone;
  }

  const { data: caixaAberto } = await supabase
    .from("caixas")
    .select("id, aberto_em, valor_abertura")
    .eq("status", "aberto")
    .order("aberto_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  let movimentacoes: { id: string; tipo: string; categoria: string; valor: number; descricao: string | null; criado_em: string }[] = [];
  if (caixaAberto) {
    const { data } = await supabase
      .from("movimentacoes_caixa")
      .select("id, tipo, categoria, valor, descricao, criado_em")
      .eq("caixa_id", caixaAberto.id)
      .order("criado_em", { ascending: false });
    movimentacoes = data ?? [];
  }

  const totalEntradas = movimentacoes.filter((m) => m.tipo === "entrada").reduce((s, m) => s + Number(m.valor), 0);
  const totalSaidas = movimentacoes.filter((m) => m.tipo === "saida").reduce((s, m) => s + Number(m.valor), 0);
  const saldo = (caixaAberto?.valor_abertura ?? 0) + totalEntradas - totalSaidas;

  return (
    <div>
      <h1 className="font-display text-3xl text-plum-950">Caixa</h1>
      <p className="text-ink-900/60 mt-1">Movimentações do caixa aberto no momento.</p>

      {!caixaAberto ? (
        <AbrirCaixaForm />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 mt-8">
            <div className="rounded-2xl border border-plum-400/20 bg-white p-5">
              <p className="text-xs uppercase tracking-wide text-ink-900/50">Entradas</p>
              <p className="font-display text-2xl text-sage-500 mt-2">R$ {totalEntradas.toFixed(2)}</p>
            </div>
            <div className="rounded-2xl border border-plum-400/20 bg-white p-5">
              <p className="text-xs uppercase tracking-wide text-ink-900/50">Saídas</p>
              <p className="font-display text-2xl text-red-500 mt-2">R$ {totalSaidas.toFixed(2)}</p>
            </div>
            <div className="rounded-2xl border border-plum-400/20 bg-white p-5">
              <p className="text-xs uppercase tracking-wide text-ink-900/50">Saldo</p>
              <p className="font-display text-2xl text-plum-800 mt-2">R$ {saldo.toFixed(2)}</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-[1fr_320px] gap-6 items-start">
          <div className="rounded-2xl border border-plum-400/20 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-ivory-100 text-left text-ink-900/60">
                <tr>
                  <th className="px-4 py-3 font-medium">Horário</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Categoria</th>
                  <th className="px-4 py-3 font-medium">Descrição</th>
                  <th className="px-4 py-3 font-medium text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {movimentacoes.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-ink-900/50">
                      Nenhuma movimentação ainda.
                    </td>
                  </tr>
                )}
                {movimentacoes.map((m) => (
                  <tr key={m.id} className="border-t border-plum-400/10">
                    <td className="px-4 py-3 text-ink-900/60">
                      {new Date(m.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: timezone })}
                    </td>
                    <td className="px-4 py-3 capitalize">{m.tipo}</td>
                    <td className="px-4 py-3 capitalize text-ink-900/70">{m.categoria}</td>
                    <td className="px-4 py-3 text-ink-900/70">{m.descricao || "—"}</td>
                    <td className={`px-4 py-3 text-right font-medium ${m.tipo === "entrada" ? "text-sage-500" : "text-red-500"}`}>
                      {m.tipo === "entrada" ? "+" : "−"} R$ {Number(m.valor).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <NovaMovimentacaoForm caixaId={caixaAberto.id} />
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Verify live — duplicate caixa gets the friendly error**

The UI itself can't easily trigger this (once a caixa is open, `/caixa` stops showing the "abrir caixa" form) — so test the Server Action directly instead of through the browser:

1. Sign up a fresh test user via REST (same pattern as prior tasks) and call `criar_empresa_e_perfil` to get an `empresa_id`.
2. Via `mcp__claude_ai_Supabase__execute_sql`, manually insert one `caixas` row with `status = 'aberto'` for that `empresa_id` (simulating that a caixa is already open).
3. Confirm the Postgres error code for a second `insert into caixas (..., status) values (..., 'aberto')` on the same `empresa_id` is `23505` — Task 5 Step 4 already proved this; re-confirm here in the context of this specific test empresa if you want independent evidence, or cite Task 5's result directly (either is acceptable, no need to duplicate the exact same proof twice).
4. Read `abrirCaixa` in the diff from Step 1 and confirm the `if (error.code === "23505") return { error: "Já existe um caixa aberto para esta empresa." };` branch is present and would catch this — this closes the loop between the DB constraint (proven in Task 5) and the TypeScript error mapping (this task).

- [ ] **Step 5: Verify live — Caixa times display in the empresa's timezone, not the server's**

Log in as a test user whose empresa has `timezone = 'America/Sao_Paulo'` (the default), register a movimentação, and confirm the displayed `Horário` column matches the wall-clock time in São Paulo, not UTC or whatever timezone the dev server process happens to run in. If the dev machine's local timezone already happens to be América/Sao_Paulo, this check won't be visually distinguishing — additionally confirm by reading the rendered HTML/props that `timeZone: "America/Sao_Paulo"` is actually being passed (not silently falling back to the `"America/Sao_Paulo"` hardcoded default due to a bug that always uses the default regardless of the fetched value) — set a second test empresa's `timezone` to `'UTC'` via SQL, log in as that empresa's user, register a movimentação, and confirm the displayed time is 3 hours ahead of what the São Paulo empresa would show for a movimentação created at the same instant.

- [ ] **Step 6: Clean up test data**

Delete any test users/empresas/caixas/movimentacoes created during Steps 4-5 via `mcp__claude_ai_Supabase__execute_sql`.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(app\)/caixa/actions.ts src/app/\(app\)/caixa/page.tsx
git commit -m "fix(caixa): scope perfil lookup to authenticated user, friendly duplicate-caixa error, timezone-aware display"
```

---

### Task 8: Relatórios — timezone-aware date display

**Files:**
- Modify: `src/app/(app)/relatorios/page.tsx` (full current content shown below)

**Interfaces:**
- Consumes: column `empresas.timezone` (Task 6); `v_faturamento_diario.dia` now already bucketed by empresa-local day (Task 6) — this task only fixes the *display* formatting, the data was already correct after Task 6.

- [ ] **Step 1: Replace `src/app/(app)/relatorios/page.tsx`**

Current content (for reference — this whole file is being replaced):
```tsx
import { createClient } from "@/lib/supabase/server";

export default async function RelatoriosPage() {
  const supabase = await createClient();
  const { data: faturamento, error } = await supabase
    .from("v_faturamento_diario")
    .select("dia, total_servicos, total_produtos, total_entradas, total_saidas")
    .order("dia", { ascending: false })
    .limit(30);

  const totalPeriodo = faturamento?.reduce((s, d) => s + Number(d.total_entradas) - Number(d.total_saidas), 0) ?? 0;

  return (
    <div>
      <h1 className="font-display text-3xl text-plum-950">Relatórios</h1>
      <p className="text-ink-900/60 mt-1">Faturamento diário (últimos 30 dias com movimentação).</p>

      <div className="mt-8 rounded-2xl border border-plum-400/20 bg-white p-5">
        <p className="text-xs uppercase tracking-wide text-ink-900/50">Resultado do período</p>
        <p className="font-display text-3xl text-plum-800 mt-2">R$ {totalPeriodo.toFixed(2)}</p>
      </div>

      <div className="mt-6 rounded-2xl border border-plum-400/20 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ivory-100 text-left text-ink-900/60">
            <tr>
              <th className="px-4 py-3 font-medium">Dia</th>
              <th className="px-4 py-3 font-medium text-right">Serviços</th>
              <th className="px-4 py-3 font-medium text-right">Produtos</th>
              <th className="px-4 py-3 font-medium text-right">Entradas</th>
              <th className="px-4 py-3 font-medium text-right">Saídas</th>
            </tr>
          </thead>
          <tbody>
            {(error || !faturamento || faturamento.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-ink-900/50">
                  Sem movimentações registradas ainda — os números aparecem aqui assim que o Caixa começar a ser usado.
                </td>
              </tr>
            )}
            {faturamento?.map((d) => (
              <tr key={d.dia} className="border-t border-plum-400/10">
                <td className="px-4 py-3">{new Date(d.dia).toLocaleDateString("pt-BR")}</td>
                <td className="px-4 py-3 text-right">R$ {Number(d.total_servicos).toFixed(2)}</td>
                <td className="px-4 py-3 text-right">R$ {Number(d.total_produtos).toFixed(2)}</td>
                <td className="px-4 py-3 text-right text-sage-500">R$ {Number(d.total_entradas).toFixed(2)}</td>
                <td className="px-4 py-3 text-right text-red-500">R$ {Number(d.total_saidas).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

New content:
```tsx
import { createClient } from "@/lib/supabase/server";

export default async function RelatoriosPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let timezone = "America/Sao_Paulo";
  if (user) {
    const { data: perfil } = await supabase
      .from("perfis")
      .select("empresas(timezone)")
      .eq("id", user.id)
      .single();
    const empresa = Array.isArray(perfil?.empresas) ? perfil?.empresas[0] : perfil?.empresas;
    timezone = empresa?.timezone ?? timezone;
  }

  const { data: faturamento, error } = await supabase
    .from("v_faturamento_diario")
    .select("dia, total_servicos, total_produtos, total_entradas, total_saidas")
    .order("dia", { ascending: false })
    .limit(30);

  const totalPeriodo = faturamento?.reduce((s, d) => s + Number(d.total_entradas) - Number(d.total_saidas), 0) ?? 0;

  return (
    <div>
      <h1 className="font-display text-3xl text-plum-950">Relatórios</h1>
      <p className="text-ink-900/60 mt-1">Faturamento diário (últimos 30 dias com movimentação).</p>

      <div className="mt-8 rounded-2xl border border-plum-400/20 bg-white p-5">
        <p className="text-xs uppercase tracking-wide text-ink-900/50">Resultado do período</p>
        <p className="font-display text-3xl text-plum-800 mt-2">R$ {totalPeriodo.toFixed(2)}</p>
      </div>

      <div className="mt-6 rounded-2xl border border-plum-400/20 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ivory-100 text-left text-ink-900/60">
            <tr>
              <th className="px-4 py-3 font-medium">Dia</th>
              <th className="px-4 py-3 font-medium text-right">Serviços</th>
              <th className="px-4 py-3 font-medium text-right">Produtos</th>
              <th className="px-4 py-3 font-medium text-right">Entradas</th>
              <th className="px-4 py-3 font-medium text-right">Saídas</th>
            </tr>
          </thead>
          <tbody>
            {(error || !faturamento || faturamento.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-ink-900/50">
                  Sem movimentações registradas ainda — os números aparecem aqui assim que o Caixa começar a ser usado.
                </td>
              </tr>
            )}
            {faturamento?.map((d) => (
              <tr key={d.dia} className="border-t border-plum-400/10">
                <td className="px-4 py-3">{new Date(d.dia).toLocaleDateString("pt-BR", { timeZone: timezone })}</td>
                <td className="px-4 py-3 text-right">R$ {Number(d.total_servicos).toFixed(2)}</td>
                <td className="px-4 py-3 text-right">R$ {Number(d.total_produtos).toFixed(2)}</td>
                <td className="px-4 py-3 text-right text-sage-500">R$ {Number(d.total_entradas).toFixed(2)}</td>
                <td className="px-4 py-3 text-right text-red-500">R$ {Number(d.total_saidas).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Verify live — a movimentação near midnight groups under the correct local day AND displays that day correctly**

Using the SQL from Task 6 Step 5 (movimentação at `2026-09-02 02:30:00+00`, empresa timezone `America/Sao_Paulo`), log in as that empresa's user (or query via REST with its bearer token) and load `/relatorios`. Expected: the row shows `01/09/2026` (not `02/09/2026`) in the `Dia` column.

- [ ] **Step 4: Clean up any test data**

If Task 6's test empresa/movimentação weren't already cleaned up, delete them now via `mcp__claude_ai_Supabase__execute_sql`.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/relatorios/page.tsx
git commit -m "fix(relatorios): display faturamento dates in the empresa's timezone"
```

---

### Task 9: End-to-end verification

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Full type-check and build**

```bash
npx tsc --noEmit
npx next build
```
Expected: both clean, no errors.

- [ ] **Step 2: Confirm migration history is in sync**

```bash
npx.cmd supabase migration list
```
Expected: every local migration file also shows a matching `remote` timestamp — no drift.

- [ ] **Step 3: Full signup → open caixa → register movimentação → view relatório, live in the browser**

`npm run dev`, sign up a fresh real test account at `/signup`, open a caixa, register at least one movimentação, visit `/relatorios`. Expected: everything works exactly as before this plan's changes from the user's perspective — the P0/timezone fixes are invisible when nothing malicious or edge-case is happening.

- [ ] **Step 4: Confirm all P0 fixes together, one more time, against the live project**

Run `mcp__claude_ai_Supabase__get_advisors` (type: security). Expected: no `security_definer_view` or `function_search_path_mutable` warnings; the `anon`-executable warning for `criar_empresa_e_perfil` is gone.

- [ ] **Step 5: Clean up test data from Step 3**

Delete the test user/empresa/caixa/movimentacao created in Step 3 via `mcp__claude_ai_Supabase__execute_sql`, matching the pattern used throughout this plan.

- [ ] **Step 6: Update `docs/roadmap/ROADMAP.md`**

Mark the Prioridade 0 table's items as done (they're currently listed as the blocker list — update to reflect completion) and remove the now-resolved timezone bullet from "Pendências de decisão de produto" (already partially done in the prior session — confirm it correctly reflects "implemented", not just "decided").

- [ ] **Step 7: Commit the roadmap update**

```bash
git add docs/roadmap/ROADMAP.md
git commit -m "docs: mark P0 blockers and timezone foundation as complete"
```

---

## Self-Review Notes

- **Spec coverage:** all 7 items from `docs/superpowers/specs/2026-08-07-hardening-p0-timezone-design.md` map 1:1 to Tasks 1-6 and 7-8 (Item 3 → Task 7's actions.ts half, Item 7c → Tasks 7-8's display halves). Nothing in the spec lacks a task.
- **Type consistency:** `timezone` variable name and fallback default (`"America/Sao_Paulo"`) match exactly between Task 7 and Task 8's page components — both use the identical `perfis -> empresas(timezone)` query shape already established as a pattern in `(app)/layout.tsx`. Migration ordering (Tasks 1-6) has no interdependency requiring a specific sequence except Task 5 before Task 7 (Task 7's `23505` handling needs Task 5's constraint to exist to be meaningful) and Task 6 before Tasks 7-8 (both need the `timezone` column) — the task numbering already reflects this.
- **No placeholders:** every step has full runnable SQL/TypeScript, not descriptions. Verification steps use concrete SQL with clearly marked "note as X" placeholders for values only known at run time (UUIDs generated by inserts) — this is the same pattern used successfully in the prior auth implementation plan, not an unresolved placeholder.
