# Alva — Project Bible

Documento de referência central. Se você (humano ou agente) só vai ler um
arquivo antes de mexer no projeto, é este — os outros documentos em `docs/`
detalham cada área.

## O que é o Alva

Sistema de gestão para estúdios/salões de beleza, multi-tenant (uma empresa
= um salão), construído do zero em Next.js + Supabase. Objetivo declarado:
paridade funcional com sistemas de gestão do setor (ex: GestorSim, usado
como referência de mercado — ver `docs/backlog-referencia-gestorsim.md`),
mas evoluindo para um SaaS premium, escalável, preparado para virar ERP com
automações e IA no médio prazo.

**Autoria própria**: nenhuma estrutura de banco, nome de coluna, texto ou
design foi copiado de terceiros — ver nota no topo de `supabase/schema.sql`
e no `README.md`.

## Papéis neste projeto

- **Product owner / decisor final**: o usuário humano.
- **Revisor de arquitetura**: ChatGPT, analisando o repositório publicado no
  GitHub de fora, sem acesso de execução.
- **Executor + dono técnico do projeto**: Claude Code, rodando neste
  ambiente (VS Code), com acesso ao código, ao Supabase real (via MCP) e ao
  GitHub. Recebe as ponderações do revisor, verifica tecnicamente contra o
  estado real do código antes de concordar ou implementar (nunca aceita por
  aceitar), e é quem efetivamente muda o sistema.

Fluxo esperado: revisor analisa → dono técnico valida tecnicamente e dá
feedback ao humano → humano decide prioridade → dono técnico implementa.

## Stack

- **Next.js 16** (App Router, TypeScript) — atenção: esta versão do Next
  tem breaking changes relevantes (ex: `middleware.ts` foi renomeado para
  `proxy.ts`). Ver `AGENTS.md` na raiz — instrui a sempre checar
  `node_modules/next/dist/docs/` antes de escrever código Next novo, porque
  o treinamento do modelo pode estar desatualizado para esta versão.
- **Supabase** (Postgres + Auth + Row Level Security) — multi-tenancy é
  inteiramente via RLS, não há schema-per-tenant nem database-per-tenant.
- **Tailwind CSS v4** — paleta própria (ameixa/salva/marfim), tipografia
  Fraunces (display) + Inter (texto). Ver `docs/CODING_STANDARDS.md`.
- Sem framework de testes, sem ORM, sem biblioteca de validação (zod etc.)
  até o momento — ver `docs/architecture/ARCHITECTURE.md` para o plano de
  fechar essas lacunas.

## Estado atual (resumo — detalhe em cada doc)

Implementado e verificado ao vivo contra um projeto Supabase real:
autenticação (signup/login/logout, criação automática de empresa/perfil),
proteção de rotas, e CRUD básico (criar + listar) de Clientes, Serviços,
Produtos, Profissionais. Caixa tem abrir/registrar movimentação (fechar
caixa tem a action pronta, falta botão na UI). Relatório único de
faturamento diário. Agenda é só grade visual, sem criação de agendamento.

Riscos técnicos conhecidos e não resolvidos: ver
`docs/database/DATABASE.md#riscos-conhecidos` e
`docs/architecture/ARCHITECTURE.md#riscos-técnicos`.

## Como navegar a documentação

- `docs/architecture/ARCHITECTURE.md` — arquitetura atual vs. arquitetura-alvo,
  convenções de organização, estratégia de migrations.
- `docs/database/DATABASE.md` — schema tabela por tabela, RLS, funções
  `security definer`, riscos de integridade multi-tenant.
- `docs/roadmap/ROADMAP.md` — prioridades, do hardening técnico até features
  de produto e a visão de longo prazo (ERP/automações/IA).
- `docs/roadmap/AGENDA_AGENDAMENTOS_V1.md` — spec da próxima feature.
- `docs/CODING_STANDARDS.md` — convenções de código a seguir.
- `docs/backlog-referencia-gestorsim.md` — inventário funcional de um
  concorrente, usado só como referência de paridade, nunca como fonte a
  copiar.
- `docs/superpowers/` — specs e planos de implementação já executados
  (histórico de decisões, não backlog ativo).
