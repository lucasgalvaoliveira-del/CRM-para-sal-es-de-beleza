-- Retorna os limites (UTC) do dia de hoje no timezone informado — usado
-- para filtrar "os agendamentos de hoje" corretamente no fuso da empresa,
-- nunca no fuso do servidor/navegador.
--
-- Contrato:
-- - Intervalo [inicio, fim): `inicio` é INCLUSIVO (meia-noite local do dia
--   de `referencia`), `fim` é EXCLUSIVO (meia-noite local do dia seguinte).
--   Consumidores devem filtrar com `>= inicio` e `< fim`, nunca `<= fim`.
-- - Ambos os limites são timestamps UTC calculados a partir da meia-noite
--   *local* no timezone `tz` — a conversão local→UTC acontece inteiramente
--   aqui, nunca no client.
-- - Horário ambíguo/inexistente por DST: testado empiricamente contra o
--   projeto real com 'America/New_York' (que observa DST, ao contrário do
--   default 'America/Sao_Paulo', que não observa DST desde 2019) — o
--   Postgres NUNCA lança erro para meia-noite ambígua ou inexistente;
--   resolve deterministicamente segundo as regras de tzdata (nos dois
--   casos testados, resolveu para o horário padrão/não-DST). Como o
--   timezone default do projeto não tem DST, este caso é inerte hoje, mas
--   o comportamento de "nunca erra, sempre resolve" já está confirmado
--   para quando uma empresa configurar um fuso com DST.
create or replace function limites_dia_local(tz text, referencia timestamptz default now())
returns table(inicio timestamptz, fim timestamptz)
language sql stable
as $$
  select
    (date_trunc('day', referencia at time zone tz)) at time zone tz as inicio,
    (date_trunc('day', referencia at time zone tz) + interval '1 day') at time zone tz as fim
$$;

-- Converte uma data de calendário + horário de parede, interpretados no
-- timezone informado, no instante UTC correto. Usado para criar um
-- agendamento a partir de "dia X, 09:00 no fuso da empresa" sem nunca
-- construir esse instante no client (onde o fuso implícito seria o do
-- navegador, não o da empresa).
--
-- Contrato: conversão local→UTC sempre acontece aqui, dentro do Postgres —
-- nenhum código TypeScript (client ou server) deve montar um timestamp a
-- partir de data+hora local sem passar por esta função. Mesmo
-- comportamento de DST documentado acima em `limites_dia_local` — nunca
-- lança erro para horário ambíguo/inexistente, resolve determinística e
-- silenciosamente segundo tzdata.
create or replace function instante_local(tz text, data date, hora time)
returns timestamptz
language sql stable
as $$
  select (data + hora) at time zone tz
$$;

-- Gera os slots de horário do dia (padrão 08:00-18:00, passo de 30min — o
-- mesmo intervalo que a grade original já usava) com os limites reais
-- (UTC) de cada slot já calculados no timezone informado. Existe pra que a
-- grade da Agenda determine ocupação por sobreposição real de instantes,
-- nunca reconstruindo hora local a partir da string `horario` no client.
--
-- Contrato: cada linha representa um slot [inicio, fim) real em UTC.
-- Mesmo comportamento de DST documentado em `limites_dia_local` acima —
-- nunca lança erro para horário ambíguo/inexistente.
create or replace function horarios_do_dia(
  tz text,
  data date,
  hora_inicial time default '08:00',
  hora_final time default '18:00',
  intervalo_minutos int default 30
)
returns table(horario text, inicio timestamptz, fim timestamptz)
language sql stable
as $$
  select
    to_char(serie, 'HH24:MI') as horario,
    serie at time zone tz as inicio,
    (serie + make_interval(mins => intervalo_minutos)) at time zone tz as fim
  from generate_series(
    (data + hora_inicial)::timestamp,
    (data + hora_final)::timestamp,
    make_interval(mins => intervalo_minutos)
  ) as serie
$$;
