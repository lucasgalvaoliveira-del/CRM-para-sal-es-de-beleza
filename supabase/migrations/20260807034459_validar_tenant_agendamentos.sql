-- ============================================================
-- Validação cross-tenant para agendamentos e movimentacoes_caixa.
--
-- RLS impede LISTAR dados de outra empresa, mas não impede que um
-- insert/update REFERENCIE um UUID de outra empresa se o atacante
-- conhecer ou adivinhar o id (cliente_id, profissional_id,
-- servico_id, agendamento_id). Estes triggers fecham essa brecha
-- de integridade, validando no banco que toda referência aponta
-- para uma linha da MESMA empresa do registro que está sendo
-- criado/atualizado.
-- ============================================================

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
