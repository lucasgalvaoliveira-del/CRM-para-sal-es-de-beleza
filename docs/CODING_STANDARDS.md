# Convenções de código — Alva

Extraído do código já existente, não inventado — a regra é "o que o projeto
já faz consistentemente", com uma seção separada para o que ainda falta
definir.

## Next.js App Router

- Rotas autenticadas dentro de `(app)/`, rotas públicas de auth dentro de
  `(auth)/` — dois route groups, dois layouts, sem Sidebar no segundo.
- `src/proxy.ts`, não `src/middleware.ts` — este Next 16 renomeou a
  convenção. Ver `AGENTS.md` na raiz: sempre checar
  `node_modules/next/dist/docs/` antes de escrever código Next novo, o
  treino do modelo pode estar desatualizado para breaking changes desta
  versão.
- Server Components por padrão para páginas que só leem dados
  (`page.tsx` de listagem é `async function` direto, sem `"use client"`).
- Client Components (`"use client"`) só onde há interação (formulários,
  `useState`, `useActionState`).

## Server Actions

Toda Server Action em arquivo próprio `actions.ts` (nunca inline num
componente), começando com `"use server";`. Duas assinaturas em uso:

```ts
// Quando chamado direto (useTransition + startTransition no client, ver caixa/*)
export async function nomeDaAction(args): Promise<{ error: string | null }> { ... }

// Quando chamado via useActionState (ver (auth)/actions.ts)
export type AuthState = { error: string } | undefined;
export async function nomeDaAction(prevState: AuthState, formData: FormData): Promise<AuthState> { ... }
```

- Sucesso: `redirect(...)` (usa o throw interno do Next, nunca envolver em
  try/catch) ou `revalidatePath(...)` + retornar `{ error: null }`.
- Erro: retornar `{ error: mensagem }`, nunca lançar exceção para o client.
- Mensagem de erro: string amigável em pt-BR para o caso esperado (ex:
  `"E-mail ou senha inválidos."`); `error.message` do Supabase repassado
  direto é aceito para casos não mapeados (convenção já em uso em 4+
  lugares) — não é ideal (vaza texto em inglês pro usuário final), mas é a
  convenção atual; ver `docs/architecture/ARCHITECTURE.md` para quando vale
  a pena investir numa camada de tradução de erro.

## Quando usar Server Action vs. insert direto do client vs. RPC

- **Insert direto do client** (`supabase.from(...).insert(...)` num
  `"use client"` component): ok para criar um registro sem nenhuma regra de
  negócio além do que a RLS já protege (Clientes, Serviços, Produtos,
  Profissionais hoje).
- **Server Action**: assim que houver qualquer regra de negócio a validar
  antes ou depois do insert (Caixa: não permitir dois caixas abertos;
  Agenda: não permitir sobreposição de horário).
- **RPC (`security definer`)**: só quando a regra exige bypassar RLS de
  forma controlada (bootstrap de empresa/perfil no signup é o único caso
  hoje). Nunca usar service role key como atalho para isso — sempre uma
  função Postgres nomeada, com `set search_path = public` e comentário
  explicando por que precisa ser `security definer`.

## Banco de dados

- Toda tabela de negócio: `empresa_id uuid not null references
  empresas(id) on delete cascade`, RLS habilitada, policy
  `for all using (empresa_id = empresa_do_usuario())`.
- Toda view nova: `alter view <nome> set (security_invoker = on)`
  explícito logo depois do `create view` — não é o padrão do Postgres,
  precisa ser dito toda vez.
- Nomes de tabela, coluna, função, policy: tudo em português, snake_case.
- Comentário `--` explicando o *porquê* em qualquer `security definer`,
  trigger não óbvio, ou índice único parcial — não documentar o óbvio.

## UI — Tailwind

Paleta e tipografia definidas em `src/app/globals.css` via `@theme inline`
— nunca usar cor hexadecimal solta num componente, sempre as classes
utilitárias geradas (`plum-950`, `plum-800`, `plum-600`, `plum-400`,
`sage-500`, `sage-300`, `ivory-50`, `ivory-100`, `ink-900`, `gold-500`).
`font-display` (Fraunces) para títulos, padrão (Inter) para o resto.

Padrões visuais repetidos em toda página de módulo — seguir exatamente,
não criar variação:

| Elemento | Classes |
|---|---|
| Card/container | `rounded-2xl border border-plum-400/20 bg-white p-5` (`p-8` em telas de auth) |
| Input | `w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600` |
| Botão primário | `rounded-lg bg-plum-800 text-white py-2.5 text-sm font-medium hover:bg-plum-950 transition-colors disabled:opacity-50` |
| Label | `text-xs uppercase tracking-wide text-ink-900/50` |
| Erro | `text-sm text-red-600` |
| Cabeçalho de tabela | `bg-ivory-100 text-left text-ink-900/60` |
| Linha de tabela | `border-t border-plum-400/10` |

Layout de módulo padrão: `grid grid-cols-[1fr_320px] gap-8` — tabela à
esquerda, form de criação à direita, largura fixa. **Isso é exatamente o
que não é responsivo** — ver seção abaixo.

## Responsividade

**Não definida ainda** — zero classes `sm:`/`md:`/`lg:`/`xl:` existem hoje
em todo o projeto (`Sidebar` é `w-60` fixo, módulos usam
`grid-cols-[1fr_320px]` fixo). Decisão de produto pendente sobre a
estratégia (ver `docs/roadmap/ROADMAP.md#pendências-de-decisão-de-produto`)
— quando definida, esta seção deve documentar os breakpoints escolhidos e o
padrão de componente (ex: card empilha abaixo de X, tabela vira lista de
cards, etc).

## Idioma

Todo texto de UI, mensagem de erro, nome de coluna/tabela/policy: português
do Brasil. Comentários de código: português, explicando o porquê, nunca o
óbvio. Nomes de variável/função em TypeScript: português quando o domínio é
de negócio (`nomeEmpresa`, `abrirCaixa`), inglês quando é infraestrutura
genérica (`createClient`, `formAction`).

## Formulários — padrão de componente

Todo form de criação simples (Clientes/Serviços/Produtos/Profissionais)
segue o mesmo esqueleto: `useState` por campo, `salvando`/`erro` como
estado, `handleSubmit` que chama o insert, limpa os campos e faz
`router.refresh()` no sucesso. É intencionalmente duplicado entre os 4
módulos em vez de abstraído num hook compartilhado — decisão tomada durante
a implementação de Profissionais: extrair um hook agora tocaria os 3
formulários já existentes fora do escopo da mudança que motivou a
pergunta. Reconsiderar se um 5º formulário idêntico for adicionado (regra
de bolso: 2 repetições tolera-se, a 3ª é sinal para abstrair — já estamos
em 4, então esta é uma dívida consciente, não um descuido).

## Git

- Commits em inglês, formato `tipo(escopo): descrição curta` (`feat(auth):
  ...`, `fix(db): ...`, `docs: ...`, `chore: ...`) — convencional commits,
  informal (sem tooling que valide o formato).
- Sempre commit novo, nunca `--amend` em trabalho já revisado/mesclado.
