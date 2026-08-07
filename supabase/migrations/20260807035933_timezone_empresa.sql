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
