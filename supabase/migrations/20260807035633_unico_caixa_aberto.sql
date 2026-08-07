create unique index caixas_um_aberto_por_empresa
  on caixas (empresa_id)
  where status = 'aberto';
