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
