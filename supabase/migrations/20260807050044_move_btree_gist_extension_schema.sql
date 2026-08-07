-- ============================================================
-- btree_gist foi instalada em `public` por
-- 20260807035205_prevenir_conflito_agenda.sql (necessária para a
-- exclusion constraint que impede sobreposição de agendamentos do
-- mesmo profissional). Isso expõe ~24 funções auxiliares da
-- extensão como endpoints REST/RPC públicos (WARN
-- `extension_in_public` do security advisor) — superfície de API
-- desnecessária, ainda que as funções em si sejam inofensivas
-- (helpers aritméticos/comparação). Mover para o schema `extensions`
-- (padrão do Supabase para isso) remove a exposição sem afetar a
-- exclusion constraint, que continua resolvendo o operador `gist`
-- normalmente.
-- ============================================================

alter extension btree_gist set schema extensions;
