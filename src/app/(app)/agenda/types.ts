export type Profissional = { id: string; nome: string };
export type Cliente = { id: string; nome: string };
export type Servico = { id: string; nome: string; duracao_minutos: number };

export type NomeRelacionado = { nome: string } | { nome: string }[] | null;

export type AgendamentoRow = {
  id: string;
  profissional_id: string;
  inicio: string;
  fim: string;
  status: string;
  clientes: NomeRelacionado;
  servicos: NomeRelacionado;
};

export type Slot = { horario: string; inicio: string; fim: string };
