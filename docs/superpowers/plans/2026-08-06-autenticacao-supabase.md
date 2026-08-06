# Autenticação (Supabase Auth) + módulo Profissionais — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Supabase Auth (signup/login/logout) with automatic empresa/perfil creation on signup, protect all `(app)` routes behind a session check, fix the broken `empresa_id`-less inserts in Clientes/Serviços/Produtos, and add a minimal Profissionais module — turning Alva from a schema-only skeleton into something that works end-to-end with real logged-in data.

**Architecture:** Next.js 16 App Router + Supabase Auth via `@supabase/ssr`. A new `(auth)` route group holds login/signup pages and their Server Actions. `src/proxy.ts` (Next 16's renamed `middleware.ts`) refreshes the Supabase session cookie on every request and redirects based on auth state. A Postgres `security definer` function lets a freshly-signed-up user create their own `empresas`/`perfis` row despite RLS; a `before insert` trigger fills `empresa_id` automatically on the tables whose forms don't set it. Profissionais gets a minimal CRUD (create + list) matching the existing Clientes/Serviços/Produtos pattern.

**Tech Stack:** Next.js 16 (App Router, TypeScript), React 19, `@supabase/ssr` ^0.12.4, `@supabase/supabase-js` ^2.112.2, Tailwind CSS v4, Supabase Postgres + Auth + RLS.

## Global Constraints

- Next.js 16 in this project uses `proxy.ts`, not `middleware.ts` — the `middleware` file convention is deprecated. Route protection MUST be implemented as `src/proxy.ts` exporting a `proxy` function.
- No automated test suite exists in this project (confirmed: no jest/vitest in `package.json`, no `tests/` directory). Verification in this plan is manual (dev server + browser + SQL checks), matching the project's own documented approach in the spec. Do not introduce a test framework as part of this work — out of scope.
- Signup creates the empresa in the same step (no separate onboarding page). No email confirmation required before login.
- `empresa_id` bootstrap uses a Postgres `security definer` function called via `supabase.rpc(...)` — never a service-role key in application code or `.env.local`.
- Server Action error returns follow the existing project convention: `{ error: string }` (or `undefined`/omitted on success + `redirect()`), never a thrown exception surfaced to the client. See `src/app/(app)/caixa/actions.ts` for the existing pattern.
- Match existing UI conventions exactly: Tailwind classes `rounded-2xl border border-plum-400/20 bg-white p-5|p-8`, inputs `w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600`, primary button `rounded-lg bg-plum-800 text-white py-2.5 text-sm font-medium hover:bg-plum-950 transition-colors disabled:opacity-50`, labels `text-xs uppercase tracking-wide text-ink-900/50`, errors `text-sm text-red-600`. Portuguese (pt-BR) copy throughout, matching existing pages.
- Profissionais module gets only the fields that already exist in the `profissionais` table (`nome`, `especialidade`, `percentual_comissao`, `ativo`) — no payroll/permissions fields from the GestorSim reference inventory (`docs/backlog-referencia-gestorsim.md`), that's explicitly out of scope.

Full design context: `docs/superpowers/specs/2026-08-06-autenticacao-supabase-design.md`. Backlog reference (not to be implemented now): `docs/backlog-referencia-gestorsim.md`.

---

### Task 0: Provision a real Supabase project and configure `.env.local`

**Files:**
- Modify: `.env.local` (currently has placeholder values `https://placeholder.supabase.co` / `placeholder`)

**Interfaces:**
- Produces: a real `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` that every later task's manual verification step depends on.

This project currently has no real Supabase backend connected — `npm run dev` runs against placeholder credentials, so every Supabase call fails. Nothing in later tasks can be manually verified end-to-end without a real project.

- [ ] **Step 1: Ask the user how to provision the project**

This creates a real cloud resource (and this session has an MCP Supabase connector available: `mcp__claude_ai_Supabase__create_project` / `list_projects`). Creating or selecting a real project is an action with external effects — **pause and ask the user** whether to:
  - (a) create a new Supabase project via the MCP tools, or
  - (b) use a Supabase project the user already has (ask for the project ref or have them run `mcp__claude_ai_Supabase__list_projects` output past to you), or
  - (c) have the user create the project manually at supabase.com and paste the URL/anon key back.

Do not call `create_project` without an explicit go-ahead in this conversation turn.

- [ ] **Step 2: Get the Project URL and anon key**

Once a project exists, get its URL and publishable (anon) key via `mcp__claude_ai_Supabase__get_project_url` and `mcp__claude_ai_Supabase__get_publishable_keys` (or have the user copy them from Project Settings → API in the Supabase dashboard, per `README.md`'s existing instructions).

- [ ] **Step 3: Write `.env.local`**

```
NEXT_PUBLIC_SUPABASE_URL=<real project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<real anon key>
```

- [ ] **Step 4: Disable "Confirm email" in the Supabase Auth settings**

Per the design decision (no email confirmation for MVP), turn off email confirmation: in the Supabase dashboard, **Authentication → Sign In / Providers → Email → toggle "Confirm email" off** (or via `mcp__claude_ai_Supabase__execute_sql`/dashboard if the MCP surface exposes this config — otherwise instruct the user to do this one toggle manually, it's not a SQL-scriptable setting). Confirm this is off before testing signup in Task 9.

- [ ] **Step 5: Verify connectivity**

Run: `npm run dev`, open `http://localhost:3000/clientes` in a browser.
Expected: the page loads without throwing a Supabase connection error (it will show "Nenhum cliente cadastrado ainda." since RLS blocks unauthenticated reads — that's expected and fine at this stage, not a failure).

---

### Task 1: Database — bootstrap function and `empresa_id` triggers

**Files:**
- Modify: `supabase/schema.sql` (append to end of file)

**Interfaces:**
- Produces: Postgres function `criar_empresa_e_perfil(nome_empresa text, nome_usuario text) returns uuid`, callable via `supabase.rpc("criar_empresa_e_perfil", { nome_empresa, nome_usuario })` — consumed by Task 4's `signup` action.
- Produces: `before insert` triggers on `clientes`, `servicos`, `produtos`, `profissionais` that fill `empresa_id` from `empresa_do_usuario()` when the client doesn't supply it.

- [ ] **Step 1: Append the SQL to `supabase/schema.sql`**

Add this to the end of the file:

```sql

-- ============================================================
-- Autenticação — bootstrap de empresa/perfil no primeiro login
-- ============================================================

-- Cria a empresa e o perfil (papel 'gestor') do usuário autenticado.
-- security definer: permite o insert passar por cima da RLS só aqui,
-- de forma controlada — sem precisar de service role key no app.
create or replace function criar_empresa_e_perfil(nome_empresa text, nome_usuario text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  nova_empresa_id uuid;
begin
  if exists (select 1 from perfis where id = auth.uid()) then
    raise exception 'Usuário já possui um perfil.';
  end if;

  insert into empresas (nome) values (nome_empresa) returning id into nova_empresa_id;
  insert into perfis (id, empresa_id, nome, papel) values (auth.uid(), nova_empresa_id, nome_usuario, 'gestor');

  return nova_empresa_id;
end;
$$;

-- Preenche empresa_id automaticamente quando o formulário não envia
-- (Clientes/Serviços/Produtos/Profissionais inserem sem esse campo hoje).
create or replace function preencher_empresa_id()
returns trigger language plpgsql as $$
begin
  if new.empresa_id is null then
    new.empresa_id := empresa_do_usuario();
  end if;
  return new;
end;
$$;

create trigger set_empresa_id before insert on clientes
  for each row execute function preencher_empresa_id();
create trigger set_empresa_id before insert on servicos
  for each row execute function preencher_empresa_id();
create trigger set_empresa_id before insert on produtos
  for each row execute function preencher_empresa_id();
create trigger set_empresa_id before insert on profissionais
  for each row execute function preencher_empresa_id();
```

- [ ] **Step 2: Apply the SQL to the Supabase project from Task 0**

Use `mcp__claude_ai_Supabase__apply_migration` with this SQL (name it e.g. `auth_bootstrap_and_empresa_id_triggers`), or have the user paste it into the Supabase SQL Editor if they prefer — either is fine, but confirm which with the user if not already clear from Task 0.

- [ ] **Step 3: Verify the function and triggers exist**

Run `mcp__claude_ai_Supabase__list_tables` or `execute_sql` with:
```sql
select proname from pg_proc where proname in ('criar_empresa_e_perfil', 'preencher_empresa_id');
select tgname, tgrelid::regclass from pg_trigger where tgname = 'set_empresa_id';
```
Expected: both function names returned, and 4 rows for the trigger (one per table: `clientes`, `servicos`, `produtos`, `profissionais`).

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(db): add empresa/perfil bootstrap function and empresa_id triggers"
```

---

### Task 2: Supabase session-refresh helper for the proxy

**Files:**
- Create: `src/lib/supabase/proxy.ts`

**Interfaces:**
- Consumes: `@supabase/ssr`'s `createServerClient`, same env vars as `src/lib/supabase/server.ts` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- Produces: `updateSession(request: NextRequest): Promise<{ response: NextResponse; user: import("@supabase/supabase-js").User | null }>` — consumed by Task 3's `src/proxy.ts`.

- [ ] **Step 1: Create `src/lib/supabase/proxy.ts`**

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `src/lib/supabase/proxy.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/proxy.ts
git commit -m "feat(auth): add session-refresh helper for the proxy"
```

---

### Task 3: Route protection via `src/proxy.ts`

**Files:**
- Create: `src/proxy.ts`

**Interfaces:**
- Consumes: `updateSession` from Task 2 (`@/lib/supabase/proxy`).

- [ ] **Step 1: Create `src/proxy.ts`**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

const AUTH_ROUTES = ["/login", "/signup"];

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const isAuthRoute = AUTH_ROUTES.some((route) => request.nextUrl.pathname.startsWith(route));

  if (!user && !isAuthRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (user && isAuthRoute) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

Note: `src/proxy.ts` sits next to `src/app/`, per the Next.js 16 convention (same level as `app`/`pages`).

- [ ] **Step 2: Verify unauthenticated redirect**

Run: `npm run dev`, then in a browser (or `curl -I`) visit `http://localhost:3000/`.
Expected: redirected to `/login` (no active session yet, since Task 4-6 don't exist as pages yet this will 404 after redirect — that's expected at this point; a plain redirect response is what we're checking for here. If using `curl -I http://localhost:3000/`, expect a `307`/`308` with `location: /login`).

- [ ] **Step 3: Commit**

```bash
git add src/proxy.ts
git commit -m "feat(auth): add proxy to protect app routes and redirect based on session"
```

---

### Task 4: Auth Server Actions (login, signup, logout)

**Files:**
- Create: `src/app/(auth)/actions.ts`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server` (existing, `src/lib/supabase/server.ts`); RPC `criar_empresa_e_perfil` from Task 1.
- Produces: `export type AuthState = { error: string } | undefined`; `login(prevState: AuthState, formData: FormData): Promise<AuthState>`; `signup(prevState: AuthState, formData: FormData): Promise<AuthState>`; `logout(): Promise<void>` — consumed by Task 5 (`login`), Task 6 (`signup`), Task 7 (`logout`).

- [ ] **Step 1: Create `src/app/(auth)/actions.ts`**

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type AuthState = { error: string } | undefined;

export async function login(_prevState: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });

  if (error) return { error: "E-mail ou senha inválidos." };
  redirect("/");
}

export async function signup(_prevState: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient();

  const nomeUsuario = String(formData.get("nomeUsuario"));
  const nomeEmpresa = String(formData.get("nomeEmpresa"));
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));

  const { error: signUpError } = await supabase.auth.signUp({ email, password });
  if (signUpError) return { error: signUpError.message };

  const { error: rpcError } = await supabase.rpc("criar_empresa_e_perfil", {
    nome_empresa: nomeEmpresa,
    nome_usuario: nomeUsuario,
  });
  if (rpcError) {
    return { error: "Conta criada, mas houve um erro ao configurar o salão. Tente fazer login." };
  }

  redirect("/");
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `src/app/(auth)/actions.ts`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(auth)/actions.ts"
git commit -m "feat(auth): add login, signup, and logout server actions"
```

---

### Task 5: Auth layout and login page

**Files:**
- Create: `src/app/(auth)/layout.tsx`
- Create: `src/app/(auth)/login/page.tsx`

**Interfaces:**
- Consumes: `login` and `AuthState` from Task 4 (`../actions`).

- [ ] **Step 1: Create `src/app/(auth)/layout.tsx`**

```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ivory-50 flex flex-col items-center justify-center p-6">
      <div className="mb-8 text-center">
        <span className="font-display text-3xl text-plum-950 tracking-tight">Alva</span>
        <p className="text-xs text-plum-400 mt-1">gestão de estúdio</p>
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Create `src/app/(auth)/login/page.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login } from "../actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined);

  return (
    <form
      action={formAction}
      className="w-full max-w-sm rounded-2xl border border-plum-400/20 bg-white p-8 space-y-4"
    >
      <h1 className="font-display text-2xl text-plum-950">Entrar</h1>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-ink-900/50">E-mail</label>
        <input
          required
          type="email"
          name="email"
          className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600"
          placeholder="voce@salao.com"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-ink-900/50">Senha</label>
        <input
          required
          type="password"
          name="password"
          className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600"
        />
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-plum-800 text-white py-2.5 text-sm font-medium hover:bg-plum-950 transition-colors disabled:opacity-50"
      >
        {pending ? "Entrando…" : "Entrar"}
      </button>

      <p className="text-sm text-ink-900/60 text-center">
        Ainda não tem conta?{" "}
        <Link href="/signup" className="text-plum-600 hover:underline">
          Criar salão
        </Link>
      </p>
    </form>
  );
}
```

- [ ] **Step 3: Verify the login page renders**

Run: `npm run dev`, visit `http://localhost:3000/login`.
Expected: form with "Entrar" title, e-mail/senha fields, "Entrar" button, and a "Criar salão" link — no redirect loop (Task 3's proxy allows `/login` through when unauthenticated).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(auth)/layout.tsx" "src/app/(auth)/login/page.tsx"
git commit -m "feat(auth): add login page"
```

---

### Task 6: Signup page

**Files:**
- Create: `src/app/(auth)/signup/page.tsx`

**Interfaces:**
- Consumes: `signup` and `AuthState` from Task 4 (`../actions`).

- [ ] **Step 1: Create `src/app/(auth)/signup/page.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signup } from "../actions";

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signup, undefined);

  return (
    <form
      action={formAction}
      className="w-full max-w-sm rounded-2xl border border-plum-400/20 bg-white p-8 space-y-4"
    >
      <h1 className="font-display text-2xl text-plum-950">Criar salão</h1>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-ink-900/50">Seu nome</label>
        <input
          required
          name="nomeUsuario"
          className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600"
          placeholder="Seu nome completo"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-ink-900/50">Nome do salão</label>
        <input
          required
          name="nomeEmpresa"
          className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600"
          placeholder="Nome do seu estúdio"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-ink-900/50">E-mail</label>
        <input
          required
          type="email"
          name="email"
          className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600"
          placeholder="voce@salao.com"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-ink-900/50">Senha</label>
        <input
          required
          type="password"
          name="password"
          minLength={6}
          className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600"
        />
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-plum-800 text-white py-2.5 text-sm font-medium hover:bg-plum-950 transition-colors disabled:opacity-50"
      >
        {pending ? "Criando…" : "Criar salão"}
      </button>

      <p className="text-sm text-ink-900/60 text-center">
        Já tem conta?{" "}
        <Link href="/login" className="text-plum-600 hover:underline">
          Entrar
        </Link>
      </p>
    </form>
  );
}
```

- [ ] **Step 2: Verify the signup page renders**

Run: `npm run dev`, visit `http://localhost:3000/signup`.
Expected: form with "Criar salão" title, 4 fields (seu nome, nome do salão, e-mail, senha), submit button, and a link back to "Entrar".

- [ ] **Step 3: Commit**

```bash
git add "src/app/(auth)/signup/page.tsx"
git commit -m "feat(auth): add signup page"
```

---

### Task 7: Sidebar and app layout — show empresa/usuário, add logout

**Files:**
- Modify: `src/components/Sidebar.tsx` (full current content shown below as the "before")
- Modify: `src/app/(app)/layout.tsx` (full current content shown below as the "before")

**Interfaces:**
- Consumes: `logout` from Task 4 (`@/app/(auth)/actions`); `createClient` from `@/lib/supabase/server`.
- Produces: `Sidebar({ empresaNome, usuarioNome }: { empresaNome: string; usuarioNome: string })` — the new required props any future caller of `Sidebar` must pass.

- [ ] **Step 1: Replace `src/components/Sidebar.tsx`**

Current content (for reference — this whole file is being replaced):
```tsx
import Link from "next/link";

const links = [
  { href: "/", label: "Painel" },
  { href: "/agenda", label: "Agenda" },
  { href: "/caixa", label: "Caixa" },
  { href: "/clientes", label: "Clientes" },
  { href: "/servicos", label: "Serviços" },
  { href: "/produtos", label: "Produtos" },
  { href: "/relatorios", label: "Relatórios" },
];

export default function Sidebar() {
  return (
    <aside className="w-60 shrink-0 bg-plum-950 text-ivory-50 min-h-screen flex flex-col">
      <div className="px-6 py-8">
        <span className="font-display text-2xl tracking-tight">Alva</span>
        <p className="text-xs text-plum-400 mt-1">gestão de estúdio</p>
      </div>
      <nav className="flex-1 px-3 space-y-1">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="block rounded-lg px-3 py-2 text-sm text-ivory-100/90 hover:bg-plum-800 hover:text-white transition-colors"
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="px-6 py-6 text-xs text-plum-400">v0.1 · MVP</div>
    </aside>
  );
}
```

New content:
```tsx
import Link from "next/link";
import { logout } from "@/app/(auth)/actions";

const links = [
  { href: "/", label: "Painel" },
  { href: "/agenda", label: "Agenda" },
  { href: "/caixa", label: "Caixa" },
  { href: "/clientes", label: "Clientes" },
  { href: "/servicos", label: "Serviços" },
  { href: "/produtos", label: "Produtos" },
  { href: "/relatorios", label: "Relatórios" },
];

export default function Sidebar({
  empresaNome,
  usuarioNome,
}: {
  empresaNome: string;
  usuarioNome: string;
}) {
  return (
    <aside className="w-60 shrink-0 bg-plum-950 text-ivory-50 min-h-screen flex flex-col">
      <div className="px-6 py-8">
        <span className="font-display text-2xl tracking-tight">Alva</span>
        <p className="text-xs text-plum-400 mt-1">{empresaNome || "gestão de estúdio"}</p>
      </div>
      <nav className="flex-1 px-3 space-y-1">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="block rounded-lg px-3 py-2 text-sm text-ivory-100/90 hover:bg-plum-800 hover:text-white transition-colors"
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="px-6 py-6 border-t border-plum-800 space-y-3">
        {usuarioNome && <p className="text-xs text-ivory-100/70">{usuarioNome}</p>}
        <form action={logout}>
          <button
            type="submit"
            className="text-xs text-plum-400 hover:text-ivory-50 transition-colors"
          >
            Sair
          </button>
        </form>
      </div>
    </aside>
  );
}
```

Note: this task does **not** add the "Profissionais" nav link — that's added in Task 8, along with the module it points to, so the link and the page it links to land together.

- [ ] **Step 2: Replace `src/app/(app)/layout.tsx`**

Current content (for reference — this whole file is being replaced):
```tsx
import Sidebar from "@/components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 min-h-screen bg-ivory-50 p-8">{children}</main>
    </div>
  );
}
```

New content:
```tsx
import Sidebar from "@/components/Sidebar";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let empresaNome = "";
  let usuarioNome = "";

  if (user) {
    const { data: perfil } = await supabase
      .from("perfis")
      .select("nome, empresas(nome)")
      .eq("id", user.id)
      .single();

    if (perfil) {
      usuarioNome = perfil.nome;
      const empresa = Array.isArray(perfil.empresas) ? perfil.empresas[0] : perfil.empresas;
      empresaNome = empresa?.nome ?? "";
    }
  }

  return (
    <div className="flex">
      <Sidebar empresaNome={empresaNome} usuarioNome={usuarioNome} />
      <main className="flex-1 min-h-screen bg-ivory-50 p-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `src/components/Sidebar.tsx` or `src/app/(app)/layout.tsx`.

- [ ] **Step 4: Manual verification — full signup → app flow**

Run: `npm run dev`, visit `http://localhost:3000/signup`, fill in the form (a real e-mail format, any password ≥ 6 chars), submit.
Expected: redirected to `/` (Painel), Sidebar shows the salon name you typed where "gestão de estúdio" used to be, and your name plus a "Sair" button/form at the bottom.

- [ ] **Step 5: Manual verification — logout**

Click "Sair".
Expected: redirected to `/login`; visiting `http://localhost:3000/` afterward redirects back to `/login` (proxy from Task 3 enforcing no session).

- [ ] **Step 6: Commit**

```bash
git add src/components/Sidebar.tsx "src/app/(app)/layout.tsx"
git commit -m "feat(auth): show empresa/usuario in sidebar and add logout"
```

---

### Task 8: Profissionais module (create + list)

**Files:**
- Create: `src/app/(app)/profissionais/page.tsx`
- Create: `src/app/(app)/profissionais/NovoProfissionalForm.tsx`
- Modify: `src/components/Sidebar.tsx:5-12` (the `links` array)

**Interfaces:**
- Consumes: `createClient` (browser) from `@/lib/supabase/client`, matching `NovoServicoForm`'s pattern exactly.
- Produces: `/profissionais` route, matching the shape of `/servicos` and `/produtos`.

- [ ] **Step 1: Create `src/app/(app)/profissionais/page.tsx`**

```tsx
import { createClient } from "@/lib/supabase/server";
import NovoProfissionalForm from "./NovoProfissionalForm";

export default async function ProfissionaisPage() {
  const supabase = await createClient();
  const { data: profissionais, error } = await supabase
    .from("profissionais")
    .select("id, nome, especialidade, percentual_comissao, ativo")
    .order("nome");

  return (
    <div>
      <h1 className="font-display text-3xl text-plum-950">Profissionais</h1>
      <p className="text-ink-900/60 mt-1">Equipe que atende na agenda.</p>

      <div className="mt-8 grid grid-cols-[1fr_320px] gap-8">
        <div className="rounded-2xl border border-plum-400/20 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ivory-100 text-left text-ink-900/60">
              <tr>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Especialidade</th>
                <th className="px-4 py-3 font-medium text-right">Comissão</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {error && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-ink-900/50">
                    Configure o Supabase para conectar ao banco.
                  </td>
                </tr>
              )}
              {!error && (!profissionais || profissionais.length === 0) && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-ink-900/50">
                    Nenhum profissional cadastrado ainda.
                  </td>
                </tr>
              )}
              {profissionais?.map((p) => (
                <tr key={p.id} className="border-t border-plum-400/10">
                  <td className="px-4 py-3">{p.nome}</td>
                  <td className="px-4 py-3 text-ink-900/70">{p.especialidade || "—"}</td>
                  <td className="px-4 py-3 text-right">{Number(p.percentual_comissao)}%</td>
                  <td className="px-4 py-3">
                    {p.ativo ? (
                      <span className="text-sage-500">Ativo</span>
                    ) : (
                      <span className="text-ink-900/40">Inativo</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <NovoProfissionalForm />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/app/(app)/profissionais/NovoProfissionalForm.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NovoProfissionalForm() {
  const router = useRouter();
  const supabase = createClient();
  const [nome, setNome] = useState("");
  const [especialidade, setEspecialidade] = useState("");
  const [comissao, setComissao] = useState("0");
  const [ativo, setAtivo] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);

    const { error } = await supabase.from("profissionais").insert({
      nome,
      especialidade: especialidade || null,
      percentual_comissao: Number(comissao.replace(",", ".")) || 0,
      ativo,
    });

    setSalvando(false);
    if (error) {
      setErro("Não foi possível salvar. Verifique a conexão com o Supabase.");
      return;
    }
    setNome("");
    setEspecialidade("");
    setComissao("0");
    setAtivo(true);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-plum-400/20 bg-white p-5 h-fit space-y-4"
    >
      <h2 className="font-display text-lg text-plum-800">Novo profissional</h2>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-ink-900/50">Nome</label>
        <input
          required
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600"
          placeholder="Nome completo"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-ink-900/50">Especialidade</label>
        <input
          value={especialidade}
          onChange={(e) => setEspecialidade(e.target.value)}
          className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600"
          placeholder="Ex: Colorista"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-ink-900/50">Comissão (%)</label>
        <input
          value={comissao}
          onChange={(e) => setComissao(e.target.value)}
          className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600"
          placeholder="0"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-ink-900/70">
        <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
        Ativo
      </label>

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      <button
        type="submit"
        disabled={salvando}
        className="w-full rounded-lg bg-plum-800 text-white py-2.5 text-sm font-medium hover:bg-plum-950 transition-colors disabled:opacity-50"
      >
        {salvando ? "Salvando…" : "Salvar profissional"}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Add the "Profissionais" nav link to `src/components/Sidebar.tsx`**

In the `links` array (currently, after Task 7, reads):
```tsx
const links = [
  { href: "/", label: "Painel" },
  { href: "/agenda", label: "Agenda" },
  { href: "/caixa", label: "Caixa" },
  { href: "/clientes", label: "Clientes" },
  { href: "/servicos", label: "Serviços" },
  { href: "/produtos", label: "Produtos" },
  { href: "/relatorios", label: "Relatórios" },
];
```

Change it to insert Profissionais right after Agenda (the Agenda page reads from the `profissionais` table, so cadastrar um profissional is the natural next step from there):
```tsx
const links = [
  { href: "/", label: "Painel" },
  { href: "/agenda", label: "Agenda" },
  { href: "/profissionais", label: "Profissionais" },
  { href: "/caixa", label: "Caixa" },
  { href: "/clientes", label: "Clientes" },
  { href: "/servicos", label: "Serviços" },
  { href: "/produtos", label: "Produtos" },
  { href: "/relatorios", label: "Relatórios" },
];
```

- [ ] **Step 4: Manual verification**

With `npm run dev` running and a logged-in session (from Task 7's flow), visit `http://localhost:3000/profissionais`. Fill in the form (nome required, rest optional) and submit.
Expected: new row appears in the table above the form after submit (no `empresa_id` error — Task 1's trigger fills it); "Profissionais" appears in the Sidebar between Agenda and Caixa.

- [ ] **Step 5: Manual verification — Agenda picks it up**

Visit `http://localhost:3000/agenda`.
Expected: the professional just created now appears as a column header instead of the "Cadastre um profissional" placeholder.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/profissionais" src/components/Sidebar.tsx
git commit -m "feat(profissionais): add minimal create+list module"
```

---

### Task 9: End-to-end manual verification

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Fresh signup**

With the dev server running and a clean browser session (or incognito), visit `/signup`, submit valid data.
Expected: redirected to `/`, Sidebar shows the new empresa/usuario names.

- [ ] **Step 2: Verify DB state**

Run via `mcp__claude_ai_Supabase__execute_sql`:
```sql
select e.nome as empresa, p.nome as usuario, p.papel
from perfis p join empresas e on e.id = p.empresa_id
order by p.criado_em desc limit 1;
```
Expected: one row matching what was just submitted, `papel = 'gestor'`.

- [ ] **Step 3: Logout/login round-trip**

Click "Sair" → redirected to `/login`. Log back in with the same credentials.
Expected: redirected to `/`, same empresa/usuario shown in Sidebar.

- [ ] **Step 4: Unauthenticated access is blocked**

Log out, then try to directly visit `/clientes`, `/caixa`, `/relatorios`.
Expected: every one redirects to `/login`.

- [ ] **Step 5: Authenticated access to `/login` or `/signup` redirects home**

Log in, then visit `/login` directly.
Expected: redirected to `/`.

- [ ] **Step 6: Cliente/Serviço/Produto/Profissional inserts no longer fail on `empresa_id`**

While logged in, create one record in each of `/clientes`, `/servicos`, `/produtos`, `/profissionais`.
Expected: all four succeed and appear in their respective tables (no "Não foi possível salvar" error).

- [ ] **Step 7: Confirm `empresa_id` was actually set (not left null)**

Run via `mcp__claude_ai_Supabase__execute_sql`:
```sql
select 'clientes' as tabela, count(*) from clientes where empresa_id is null
union all select 'servicos', count(*) from servicos where empresa_id is null
union all select 'produtos', count(*) from produtos where empresa_id is null
union all select 'profissionais', count(*) from profissionais where empresa_id is null;
```
Expected: all counts are `0`.

- [ ] **Step 8: Final commit (if anything was fixed during verification)**

```bash
git add -A
git commit -m "fix: address issues found in end-to-end auth verification"
```
(Skip if nothing needed fixing.)

---

## Self-Review Notes

- **Spec coverage:** signup+empresa creation (Task 4, 6), login (Task 4, 5), logout (Task 4, 7), route protection via `proxy.ts` (Task 2, 3), `empresa_id` bootstrap function (Task 1), `empresa_id` triggers for clientes/servicos/produtos (Task 1) — spec also called out profissionais needing the trigger too, included. Sidebar empresa/usuario + logout (Task 7). Profissionais minimal CRUD (Task 8). Manual test checklist from spec's "Testes" section (Task 9). All spec sections have a task.
- **Type consistency:** `AuthState` type defined once in Task 4, reused as-is (not redefined) in Task 5 and 6's `useActionState<AuthState>` usage. `Sidebar`'s new prop signature (`empresaNome`, `usuarioNome`) defined in Task 7 is the exact shape Task 7's own layout change passes — no other file constructs a `<Sidebar>` element. `logout` has no params in Task 4 and is called as a bare form `action={logout}` in Task 7 — consistent (React allows a zero-arg server action as a form action).
- **No placeholders:** every step has full runnable code, not descriptions of code.
