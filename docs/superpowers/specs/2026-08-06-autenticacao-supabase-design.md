# Autenticação (Supabase Auth) + criação de empresa/perfil no primeiro login + módulo Profissionais

Data: 2026-08-06

## Contexto

O README lista autenticação como pré-requisito nº 1 para o app funcionar com
dados reais: as páginas já assumem um `perfil` vinculado ao usuário logado,
mas não existe nenhuma tela de login/signup, nenhuma proteção de rota, e o
schema não tem como um usuário recém-cadastrado criar sua própria linha em
`empresas`/`perfis` (a RLS de `perfis` depende de já existir um perfil).
Além disso, os formulários de Clientes/Serviços/Produtos já fazem insert sem
enviar `empresa_id` (coluna `not null`), contando com algo que ainda não
existe.

Lendo o restante do código também identifiquei que **o módulo Profissionais
não tem nenhuma UI** (nem página, nem formulário, nem link no Sidebar),
apesar da tabela `profissionais` já existir no schema e a Agenda já
depender dela. Comparado com o inventário funcional do concorrente GestorSim
(ver `docs/backlog-referencia-gestorsim.md`), Profissionais é o módulo mais
claramente ausente antes de Agenda/Comissionamento poderem avançar — por
isso entra neste ciclo, em versão mínima (só os campos que já existem no
schema, sem folha de pagamento/permissões como no GestorSim).

Este design cobre: signup do gestor (com criação automática da empresa),
login, logout, proteção de rotas autenticadas, o preenchimento automático de
`empresa_id`, e um CRUD mínimo de Profissionais (criar + listar, no mesmo
padrão de Clientes/Serviços/Produtos). **Não** cobre convite de outros
usuários (profissional/recepção) para *logar* numa empresa existente — só
cadastrar o registro de profissional; fica para uma etapa futura o
profissional ter login próprio.

Decisões confirmadas com o usuário:
- Signup cria a empresa junto (uma única tela: nome, e-mail, senha, nome do
  salão), sem etapa de onboarding separada.
- Sem confirmação por e-mail no MVP (login liberado imediatamente após o
  signup).
- Bootstrap de `empresas`/`perfis` via função Postgres `security definer`
  (não via service role key).
- `empresa_id` nos inserts de clientes/serviços/produtos/profissionais é
  preenchido por trigger no banco, não editando cada formulário.
- Módulo Profissionais entra neste ciclo, em escala mínima (campos já
  existentes no schema); o restante do inventário do GestorSim fica
  registrado como backlog, não implementado agora.

## Nota sobre a versão do Next.js

Este projeto usa Next.js 16, que **descontinuou `middleware.ts`** e o
renomeou para `proxy.ts` (mesma API, arquivo/função renomeados). A proteção
de rotas usa `src/proxy.ts`, não `src/middleware.ts`.

## Banco de dados (`supabase/schema.sql`, acrescentado ao final do arquivo)

### Função de bootstrap

```sql
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
```

Chamada via `supabase.rpc("criar_empresa_e_perfil", { nome_empresa, nome_usuario })`
a partir da Server Action de signup, já no contexto do usuário recém-criado
(assim `auth.uid()` resolve corretamente). `security definer` permite os
inserts em `empresas`/`perfis` passarem por cima da RLS só dentro dessa
função controlada — sem precisar de uma service role key no `.env.local`.

### Trigger de preenchimento de `empresa_id`

```sql
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

Corrige os inserts de `NovoClienteForm`, `NovoServicoForm`, `NovoProdutoForm`
e do novo `NovoProfissionalForm` (hoje/doravante quebrados contra a coluna
`not null`) sem precisar passar `empresa_id` explicitamente em cada form.

## Rotas e páginas

Novo grupo de rotas `src/app/(auth)/`, fora do grupo `(app)` (não herda o
Sidebar):

```
src/app/(auth)/
├── layout.tsx        # layout simples, sem Sidebar, centralizado
├── login/page.tsx    # form: e-mail, senha
├── signup/page.tsx   # form: nome do usuário, nome do salão, e-mail, senha
└── actions.ts        # "use server": login(), signup(), logout()
```

Segue o mesmo padrão de retorno de erro já usado em `caixa/actions.ts`
(`{ error: string | null }`, sem lançar exceção para o cliente).

- **`login(formData)`**: `supabase.auth.signInWithPassword`. Erro →
  `{ error: "E-mail ou senha inválidos." }`. Sucesso → `redirect("/")`.
- **`signup(formData)`**: `supabase.auth.signUp` (sem confirmação de e-mail)
  → sessão ativa imediatamente → `supabase.rpc("criar_empresa_e_perfil", ...)`
  → `redirect("/")`. Se o rpc falhar após o `signUp` ter criado o usuário em
  `auth.users`, retorna erro orientando a tentar login novamente (não há
  usuário "travado": sem perfil, ele só não acessa dados até recriar o
  perfil — não precisamos desfazer o `signUp`).
- **`logout()`**: `supabase.auth.signOut()` → `redirect("/login")`.

## Proteção de sessão (`src/proxy.ts`)

```ts
export async function proxy(request: NextRequest) {
  const { supabase, response } = createProxyClient(request); // refresh de cookies via @supabase/ssr
  const { data: { user } } = await supabase.auth.getUser();

  const isAuthRoute = request.nextUrl.pathname.startsWith("/login")
    || request.nextUrl.pathname.startsWith("/signup");

  if (!user && !isAuthRoute) return NextResponse.redirect(new URL("/login", request.url));
  if (user && isAuthRoute) return NextResponse.redirect(new URL("/", request.url));
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
```

Novo helper `src/lib/supabase/proxy.ts` cuida do refresh de cookies de sessão
— o papel que o comentário `"safe to ignore when using middleware"` em
`server.ts` já antecipava.

## Módulo Profissionais (mínimo)

Mesmo padrão de Serviços/Produtos (listagem Server Component + form client
component com insert direto via `@supabase/ssr` browser client):

```
src/app/(app)/profissionais/
├── page.tsx                # lista: nome, especialidade, comissão, ativo
└── NovoProfissionalForm.tsx  # nome, especialidade, percentual_comissao, toggle ativo
```

Campos do form = exatamente as colunas já existentes em `profissionais`
(`nome`, `especialidade`, `percentual_comissao`, `ativo`) — sem folha de
pagamento, permissões ou abas extras (isso fica no backlog de referência do
GestorSim, fora de escopo). `empresa_id` é preenchido pelo trigger
`preencher_empresa_id`, igual aos outros módulos.

## Sidebar / layout do app

- Novo link "Profissionais" no array `links` de `Sidebar.tsx`, entre Agenda
  e Caixa (a Agenda já lê da tabela `profissionais`, então cadastrar um
  profissional é o que faz a grade da Agenda parar de mostrar "Cadastre um
  profissional").
- `(app)/layout.tsx` busca o `perfil` (nome + nome da empresa) via Server
  Component e passa como prop ao `Sidebar`, que passa a exibir o nome do
  salão e um botão "Sair" (chama a Server Action `logout`).
- A checagem de autenticação principal fica no `proxy.ts`; o layout não
  duplica redirect, só busca dados de exibição.

## Testes

Não há suíte de testes automatizados no projeto. Verificação será manual:
signup cria empresa/perfil e redireciona para `/`; login/logout funcionam;
acessar `/` deslogado redireciona para `/login`; acessar `/login` logado
redireciona para `/`; criar cliente/serviço/produto/profissional após login
não falha mais por `empresa_id` nulo; a Agenda passa a listar o profissional
recém-criado como coluna.

## Fora de escopo

Próximas etapas já listadas no README, mais o backlog do inventário
GestorSim em `docs/backlog-referencia-gestorsim.md`:

- Convite de profissional/recepção para *logar* numa empresa existente
  (login próprio do profissional).
- Edição/exclusão de registros em qualquer módulo (Clientes, Serviços,
  Produtos, Profissionais hoje só têm criar + listar).
- Painel (dashboard) dinâmico — os cards hoje são estáticos, não consultam
  `v_faturamento_diario`/`clientes`.
- Criação de agendamento pela grade da Agenda.
- Botão de fechar caixa na UI.
- Comissionamento e relatórios adicionais (ver seção de comissionamento no
  backlog de referência para os parâmetros que o GestorSim usa).
