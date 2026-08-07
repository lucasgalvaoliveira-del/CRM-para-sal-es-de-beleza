export const STATUS_VALIDOS = [
  "agendado",
  "confirmado",
  "em_andamento",
  "concluido",
  "cancelado",
  "faltou",
] as const;

export type StatusAgendamento = (typeof STATUS_VALIDOS)[number];
