create extension if not exists btree_gist;

alter table agendamentos add constraint sem_sobreposicao_profissional
  exclude using gist (
    profissional_id with =,
    tstzrange(inicio, fim) with &&
  ) where (status not in ('cancelado', 'faltou'));
