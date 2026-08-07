create or replace function criar_empresa_e_perfil(nome_empresa text, nome_usuario text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  nova_empresa_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if exists (select 1 from perfis where id = auth.uid()) then
    raise exception 'Usuário já possui um perfil.';
  end if;

  insert into empresas (nome) values (nome_empresa) returning id into nova_empresa_id;
  insert into perfis (id, empresa_id, nome, papel) values (auth.uid(), nova_empresa_id, nome_usuario, 'gestor');

  return nova_empresa_id;
end;
$$;

revoke execute on function criar_empresa_e_perfil(text, text) from public;
revoke execute on function criar_empresa_e_perfil(text, text) from anon;
grant execute on function criar_empresa_e_perfil(text, text) to authenticated;
