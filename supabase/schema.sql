-- ============================================================
-- Alva — schema inicial (MVP: Clientes, Profissionais, Serviços,
-- Agenda, Caixa). Sistema próprio de gestão para negócios de
-- beleza/estética. Nenhuma estrutura, nome de coluna ou lógica
-- aqui foi copiada de terceiros — desenhado do zero a partir de
-- conceitos padrão de gestão para o setor.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Empresas (multi-tenant simples) ----------
create table empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criado_em timestamptz not null default now()
);

-- ---------- Perfis de usuário (vinculados ao auth.users do Supabase) ----------
create table perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  papel text not null default 'gestor' check (papel in ('gestor', 'profissional', 'recepcao')),
  criado_em timestamptz not null default now()
);

-- ---------- Profissionais ----------
create table profissionais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  especialidade text,
  percentual_comissao numeric(5,2) not null default 0 check (percentual_comissao >= 0 and percentual_comissao <= 100),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ---------- Clientes ----------
create table clientes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  telefone text,
  email text,
  data_nascimento date,
  observacoes text,
  criado_em timestamptz not null default now()
);

-- ---------- Serviços ----------
create table servicos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  categoria text,
  duracao_minutos integer not null default 30 check (duracao_minutos > 0),
  preco numeric(10,2) not null default 0 check (preco >= 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ---------- Produtos (para venda / uso interno) ----------
create table produtos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  quantidade_estoque numeric(10,2) not null default 0,
  unidade text not null default 'UN',
  preco_custo numeric(10,2) not null default 0 check (preco_custo >= 0),
  preco_venda numeric(10,2) not null default 0 check (preco_venda >= 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ---------- Agendamentos ----------
create table agendamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  cliente_id uuid references clientes(id) on delete set null,
  profissional_id uuid not null references profissionais(id) on delete cascade,
  servico_id uuid not null references servicos(id) on delete restrict,
  inicio timestamptz not null,
  fim timestamptz not null,
  status text not null default 'agendado'
    check (status in ('agendado', 'confirmado', 'em_andamento', 'concluido', 'cancelado', 'faltou')),
  observacoes text,
  criado_em timestamptz not null default now(),
  constraint fim_apos_inicio check (fim > inicio)
);
create index idx_agendamentos_profissional_periodo on agendamentos (profissional_id, inicio);

-- ---------- Caixa (sessões de caixa aberto/fechado) ----------
create table caixas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  aberto_em timestamptz not null default now(),
  fechado_em timestamptz,
  valor_abertura numeric(10,2) not null default 0,
  valor_fechamento numeric(10,2),
  status text not null default 'aberto' check (status in ('aberto', 'fechado'))
);

-- ---------- Movimentações de caixa (entradas e saídas) ----------
create table movimentacoes_caixa (
  id uuid primary key default gen_random_uuid(),
  caixa_id uuid not null references caixas(id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'saida')),
  categoria text not null default 'outros'
    check (categoria in ('servico', 'produto', 'despesa', 'adiantamento', 'outros')),
  forma_pagamento text not null default 'dinheiro'
    check (forma_pagamento in ('dinheiro', 'pix', 'cartao_debito', 'cartao_credito', 'outros')),
  valor numeric(10,2) not null check (valor > 0),
  agendamento_id uuid references agendamentos(id) on delete set null,
  descricao text,
  criado_em timestamptz not null default now()
);
create index idx_movimentacoes_caixa on movimentacoes_caixa (caixa_id, criado_em);

-- ============================================================
-- Row Level Security — cada empresa só vê seus próprios dados
-- ============================================================
alter table empresas enable row level security;
alter table perfis enable row level security;
alter table profissionais enable row level security;
alter table clientes enable row level security;
alter table servicos enable row level security;
alter table produtos enable row level security;
alter table agendamentos enable row level security;
alter table caixas enable row level security;
alter table movimentacoes_caixa enable row level security;

-- security definer: sem isso, a policy crud_perfis (que usa esta função)
-- recursiona infinitamente ao consultar perfis dentro da própria função
-- (stack depth limit exceeded) — só retorna o empresa_id do próprio
-- usuário autenticado, não há dado controlado por terceiros em risco.
create or replace function empresa_do_usuario()
returns uuid
language sql stable security definer set search_path = public
as $$
  select empresa_id from perfis where id = auth.uid()
$$;

create policy "ver_propria_empresa" on empresas for select using (id = empresa_do_usuario());

create policy "crud_perfis" on perfis for all using (empresa_id = empresa_do_usuario());
create policy "crud_profissionais" on profissionais for all using (empresa_id = empresa_do_usuario());
create policy "crud_clientes" on clientes for all using (empresa_id = empresa_do_usuario());
create policy "crud_servicos" on servicos for all using (empresa_id = empresa_do_usuario());
create policy "crud_produtos" on produtos for all using (empresa_id = empresa_do_usuario());
create policy "crud_agendamentos" on agendamentos for all using (empresa_id = empresa_do_usuario());
create policy "crud_caixas" on caixas for all using (empresa_id = empresa_do_usuario());
create policy "crud_movimentacoes" on movimentacoes_caixa for all using (
  caixa_id in (select id from caixas where empresa_id = empresa_do_usuario())
);

-- ============================================================
-- View: faturamento diário (base para relatórios/dashboard)
-- ============================================================
create view v_faturamento_diario as
select
  c.empresa_id,
  date(m.criado_em) as dia,
  sum(case when m.categoria = 'servico' then m.valor else 0 end) as total_servicos,
  sum(case when m.categoria = 'produto' then m.valor else 0 end) as total_produtos,
  sum(case when m.tipo = 'entrada' then m.valor else 0 end) as total_entradas,
  sum(case when m.tipo = 'saida' then m.valor else 0 end) as total_saidas
from movimentacoes_caixa m
join caixas c on c.id = m.caixa_id
group by c.empresa_id, date(m.criado_em);

-- Corrige vazamento entre empresas: sem isso a view roda com privilégio do
-- dono (bypassa RLS), expondo faturamento de todas as empresas via anon key.
alter view v_faturamento_diario set (security_invoker = on);

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
