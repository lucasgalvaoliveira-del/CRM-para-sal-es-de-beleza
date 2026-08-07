# Arquitetura — Alva

## Arquitetura atual

### Estrutura de rotas (Next.js App Router)

```
src/app/
├── layout.tsx              # root layout: <html>, fontes via @import CSS, metadata
├── globals.css              # paleta de cores, tipografia
├── (app)/                   # rotas autenticadas, com Sidebar
│   ├── layout.tsx            # busca perfil+empresa do usuário logado, renderiza Sidebar
│   ├── page.tsx               # painel (hoje estático, não lê dados reais)
│   ├── agenda/page.tsx
│   ├── caixa/{page,actions,*Form}.tsx
│   ├── clientes/{page,*Form}.tsx
│   ├── servicos/{page,*Form}.tsx
│   ├── produtos/{page,*Form}.tsx
│   ├── profissionais/{page,*Form}.tsx
│   └── relatorios/page.tsx
└── (auth)/                  # rotas públicas de autenticação, sem Sidebar
    ├── layout.tsx
    ├── login/page.tsx
    ├── signup/page.tsx
    └── actions.ts             # Server Actions: login, signup, logout
```

Organização hoje é **por rota**, não por feature isolada: cada módulo vive
inteiramente dentro da sua pasta de rota (`page.tsx` + form + eventualmente
`actions.ts`), sem uma camada `lib/`/`domain/` própria por feature. Funciona
para o tamanho atual do projeto, mas não escala bem quando um módulo cresce
(regras de negócio compartilhadas, múltiplos consumidores da mesma query).
Ver "Arquitetura-alvo" abaixo para a evolução proposta.

### Camada de acesso ao Supabase

Três clientes distintos, cada um para um contexto de execução diferente:

- `src/lib/supabase/client.ts` — `createBrowserClient`, usado em Client
  Components (`"use client"`) para inserts diretos (ex: `NovoClienteForm`).
- `src/lib/supabase/server.ts` — `createServerClient` com cookies via
  `next/headers`, usado em Server Components e Server Actions.
- `src/lib/supabase/proxy.ts` — `updateSession()`, usado só por
  `src/proxy.ts` para refresh de cookie de sessão a cada request.

Nenhum dos três usa a `service_role` key — toda operação privilegiada passa
por função Postgres `security definer` (ver `docs/database/DATABASE.md`),
nunca por bypass de RLS no lado da aplicação. Isso é uma decisão de
arquitetura deliberada, mantida desde a implementação da autenticação.

### Padrões de mutação de dados — duas convenções coexistindo hoje

1. **Server Action** (`"use server"`, retorna `{ error: string | null }`,
   chama `redirect()` no sucesso ou `revalidatePath()`): usado em
   `caixa/actions.ts` (abrirCaixa, registrarMovimentacao, fecharCaixa) e em
   `(auth)/actions.ts` (login, signup, logout).
2. **Insert direto do client** (`"use client"`, chama
   `supabase.from(...).insert(...)` direto no browser, sem passar por uma
   Server Action): usado em `NovoClienteForm`, `NovoServicoForm`,
   `NovoProdutoForm`, `NovoProfissionalForm`.

A convenção (2) é sustentada apenas porque a RLS protege a escrita — não há
nenhuma regra de negócio server-side sendo pulada hoje, já que "criar um
cliente" não tem lógica além do insert. Mas ela não vai se sustentar assim
que uma regra de domínio real entrar no caminho (ex: "não permitir dois
caixas abertos" — ver Riscos Técnicos). A convenção (1) é a direção-alvo
para qualquer mutação que tenha uma regra de negócio não trivial por trás.

### Autenticação e sessão

- `src/proxy.ts` (não `middleware.ts` — ver nota no `AGENTS.md` sobre a
  renomeação no Next 16) roda em toda rota, atualiza o cookie de sessão via
  `updateSession()`, e redireciona: sem sessão → `/login`; com sessão em
  `/login` ou `/signup` → `/`.
- Bootstrap de empresa/perfil no primeiro signup é feito por uma função
  Postgres `security definer` (`criar_empresa_e_perfil`), chamada via
  `supabase.rpc(...)` dentro da Server Action de signup — não há service
  role key em nenhum lugar do código da aplicação.
- Autorização por papel (`perfis.papel`: gestor/profissional/recepcao)
  **existe no schema mas não é usada em nenhuma lógica ainda** — todo
  usuário autenticado tem acesso igual a tudo dentro da própria empresa.
  Isso é uma lacuna deliberadamente não resolvida (ver Roadmap).

### Multi-tenancy

Modelo: **RLS pura**, uma tabela `empresas` + `empresa_id` em toda tabela de
negócio, uma função `empresa_do_usuario()` (`security definer`, evita
recursão de RLS) usada em toda policy. Sem schema separado nem projeto
Supabase separado por tenant — decisão correta para o estágio atual
(simplicidade > isolamento físico), mas significa que **toda a proteção
entre empresas depende inteiramente da RLS estar correta em cada tabela
nova**. Ver riscos abaixo.

## Arquitetura-alvo

Evolução proposta, não é um redesenho — o objetivo é fechar lacunas
específicas, não reescrever o que já funciona.

1. **Migrations versionadas** — adotar `supabase/migrations/` com
   numeração sequencial (padrão da Supabase CLI: `<timestamp>_nome.sql`),
   substituindo o `schema.sql` monolítico como fonte de mudanças
   incrementais. `schema.sql` pode continuar existindo como "schema
   consolidado" gerado a partir das migrations, para quem quer só rodar
   tudo de uma vez num projeto novo (como o `README.md` já orienta). Ver
   `docs/database/DATABASE.md#estratégia-de-migrations` para o plano
   concreto.
2. **Regras de domínio críticas migram para Server Actions/RPCs** —
   qualquer mutação que tenha uma invariante a proteger (não duplicar caixa
   aberto, não sobrepor agendamento) deixa de ser um insert direto do
   client e passa a ser uma Server Action (validação em TypeScript) ou uma
   função Postgres (validação no banco, mais forte contra bypass). Inserts
   simples sem regra de negócio (Clientes, Serviços, Produtos, Profissionais
   hoje) podem continuar diretos do client — não é necessário migrar tudo
   por uniformidade, só o que precisa.
3. **Tipos gerados do Supabase** — rodar
   `mcp__claude_ai_Supabase__generate_typescript_types` (ou
   `supabase gen types typescript`) e tipar os três clientes
   (`createBrowserClient<Database>`, `createServerClient<Database>`).
   Hoje `(app)/layout.tsx` precisa de um workaround manual
   (`Array.isArray(perfil.empresas) ? ... : ...`) porque o shape de um
   join não é conhecido em tempo de compilação — tipos gerados eliminam
   essa classe de bug.
4. **Validação centralizada** — introduzir `zod` (ou similar) para validar
   `FormData` nas Server Actions antes de tocar o banco, começando pelas
   novas features (Agenda v1) em vez de retrofitar tudo de uma vez.
5. **Organização modular por feature** — quando um módulo crescer além de
   `page.tsx` + 1 form (ex: Agenda, que vai precisar de lógica de conflito,
   múltiplos componentes, hooks), extrair para
   `src/app/(app)/<feature>/{page.tsx, actions.ts, components/, lib/}` em
   vez de arquivos soltos na pasta da rota. Não aplicar isso
   retroativamente aos módulos simples atuais (Clientes/Serviços/Produtos)
   sem necessidade — YAGNI.
6. **Estratégia responsiva** — definir breakpoints e um padrão de
   componente antes de expandir Agenda/tabelas (ver
   `docs/CODING_STANDARDS.md#responsividade` e o risco correspondente
   abaixo). Hoje zero classes `sm:`/`md:`/`lg:`/`xl:` existem no projeto.
7. **Testes** — ainda não é prioridade enquanto o time é uma pessoa e o
   ciclo de verificação é manual contra o Supabase real (abordagem que já
   provou pegar bugs que testes mockados perderiam, como a recursão de RLS
   encontrada na implementação da autenticação). Reavaliar quando o time ou
   a superfície de regressão crescerem — não introduzir um framework de
   testes só por hábito.

## Riscos técnicos

Lista consolidada — ponderações do ChatGPT (verificadas tecnicamente) mais
achados da implementação da autenticação. Detalhe de cada um em
`docs/database/DATABASE.md#riscos-conhecidos` quando for especificamente de
banco/RLS.

| # | Risco | Severidade | Onde |
|---|-------|------------|------|
| 1 | Sem estratégia de migrations versionadas | Média (trava colaboração/histórico, não é bug ativo) | `supabase/schema.sql` |
| 2 | ~~Referências entre tabelas não validam mesma empresa~~ **Resolvido** — triggers `validar_tenant_agendamento`/`validar_tenant_movimentacao_agendamento` fecham a brecha. Ver `supabase/migrations/20260807034459_validar_tenant_agendamentos.sql`. | `supabase/schema.sql` |
| 3 | ~~Nada impede dois caixas abertos na mesma empresa~~ **Resolvido** — índice único parcial `caixas_um_aberto_por_empresa` (`status = 'aberto'`). Ver `supabase/migrations/20260807035633_unico_caixa_aberto.sql`. | `caixa/actions.ts:abrirCaixa` |
| 4 | Agenda sem fluxo de criação/conflito/timezone | N/A — é a próxima feature, ver `docs/roadmap/AGENDA_AGENDAMENTOS_V1.md` | `(app)/agenda/page.tsx` |
| 5 | Inserts diretos do client em 4 módulos (Clientes/Serviços/Produtos/Profissionais) | Baixa hoje (sem regra de negócio pulada), sobe se regras entrarem | módulos sem `actions.ts` |
| 6 | Sem tipos gerados, validação, testes | Média (velocidade de dev e classe de bugs de shape/validação) | projeto todo |
| 7 | Sem estratégia responsiva | Média (bloqueia uso mobile, que é comum em salões) | todo `src/` |
| 8 | ~~`crud_perfis` é `FOR ALL` sem restrição~~ **Resolvido** — policy substituída por `select_perfis_da_empresa` + `update_proprio_perfil` (sem insert/delete para `authenticated`) e trigger `bloquear_escalada_papel` impede alterar o próprio `papel`/`empresa_id`. Ver `supabase/migrations/20260807033342_harden_perfis_rls.sql`. | `supabase/schema.sql` policy `crud_perfis` (substituída) |
| 9 | ~~`caixa/actions.ts:abrirCaixa` faz select de `perfis` sem `.eq("id", user.id)`~~ **Resolvido** — lookup agora escopado ao usuário autenticado. Ver `src/app/(app)/caixa/actions.ts`. | `caixa/actions.ts:8` |
| 10 | ~~`criar_empresa_e_perfil` é executável pela role `anon`~~ **Resolvido** — `revoke execute ... from anon/public` + `grant ... to authenticated`. Ver `supabase/migrations/20260807034032_restrict_criar_empresa_e_perfil.sql`. | `supabase/schema.sql` |

Riscos #2, #3, #8, #9 e #10 foram fechados na branch `hardening-p0-timezone`
(ver notas na tabela acima) — deixaram de depender de "só 1 usuário/caixa
por empresa hoje" para não serem exploráveis. Riscos remanescentes (#1, #5,
#6, #7) continuam não bloqueantes para o uso atual. Priorização em
`docs/roadmap/ROADMAP.md`.
