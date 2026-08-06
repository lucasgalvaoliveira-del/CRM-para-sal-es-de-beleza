# Alva — sistema de gestão para estúdios de beleza (MVP)

Sistema próprio, construído do zero (Next.js + Supabase), com paridade
funcional inspirada nas categorias de um sistema de gestão de estética
(agenda, caixa, clientes, serviços, produtos, comissionamento, relatórios).
Design, textos e implementação são autorais — nada foi copiado de nenhum
fornecedor de terceiros.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS v4)
- **Supabase** (Postgres + Auth + Row Level Security)

## O que já está pronto (v0.2)

- Esqueleto do app com navegação lateral (Painel, Agenda, Profissionais, Caixa, Clientes, Serviços, Produtos, Relatórios)
- Schema completo do banco em `supabase/schema.sql`: empresas, perfis, profissionais, clientes, serviços, produtos, agendamentos, caixas, movimentações de caixa — com Row Level Security por empresa
- Módulo **Clientes**: listagem + formulário de cadastro, conectado ao Supabase
- Módulo **Serviços**: listagem + formulário de cadastro (nome, categoria, duração, preço)
- Módulo **Produtos**: listagem + formulário de cadastro (estoque, preço de custo/venda)
- Módulo **Caixa**: abrir caixa, registrar movimentações (entrada/saída, categoria, forma de pagamento), ver saldo em tempo real — via Server Actions (`caixa/actions.ts`)
- Módulo **Relatórios**: faturamento diário dos últimos 30 dias, a partir da view `v_faturamento_diario`
- Módulo **Agenda**: grade visual por profissional (ainda sem criação de agendamento por clique — próximo passo)
- Autenticação (Supabase Auth): signup cria empresa/perfil automaticamente no primeiro acesso, login e logout; rotas protegidas via `src/proxy.ts`; módulo **Profissionais** mínimo (listagem + formulário de cadastro)
- Identidade visual própria ("Alva"): paleta ameixa/salva/marfim, tipografia Fraunces (display) + Inter (texto)

## Ainda não implementado (próximos passos sugeridos)

1. Criar agendamento a partir da grade da Agenda (clique em um horário vazio) e vinculá-lo a uma movimentação de caixa
2. Fechar caixa (a action `fecharCaixa` já existe em `caixa/actions.ts`, falta o botão na UI)
3. Comissionamento (cálculo por profissional a partir das movimentações de caixa vinculadas a agendamentos — campo `percentual_comissao` já existe em `profissionais`)
4. Relatórios adicionais (DRE, ticket médio, ranking de profissionais) usando o mesmo padrão da view `v_faturamento_diario`

## Como rodar localmente

```bash
npm install
cp .env.local.example .env.local
# edite .env.local com a URL e a anon key do seu projeto Supabase
npm run dev
```

## Como configurar o Supabase

1. Crie um projeto em https://supabase.com
2. Vá em **SQL Editor** e rode o conteúdo de `supabase/schema.sql`
3. Copie a **Project URL** e a **anon public key** (em Project Settings -> API) para o `.env.local`
4. Em **Authentication -> Sign In/Providers -> Email**, desligue a opção **"Confirm email"** — esta MVP não implementa fluxo de confirmação por e-mail, e com a opção ligada o cadastro fica travado esperando uma confirmação que nunca chega
5. Pronto: crie sua conta em `/signup` — o cadastro já cria a empresa e o perfil (papel `gestor`) automaticamente, sem precisar editar tabelas na mão

## Publicando no GitHub

```bash
git init
git add .
git commit -m "MVP inicial do Alva"
gh repo create alva --private --source=. --push
```

## Continuando o desenvolvimento

Este projeto está pronto para ser aberto no **Claude Code** — recomendado
para as próximas etapas (autenticação, CRUD completo, comissionamento,
relatórios), já que envolve múltiplos arquivos e sessões de trabalho mais
longas, além de integração direta com GitHub.
