"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { atualizarStatusAgendamento } from "./actions";
import { STATUS_VALIDOS, type StatusAgendamento } from "./status";

const STATUS_LABEL: Record<StatusAgendamento, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
  faltou: "Faltou",
};

const STATUS_COR: Record<StatusAgendamento, string> = {
  agendado: "bg-plum-400/20 text-plum-800",
  confirmado: "bg-sage-300/30 text-sage-500",
  em_andamento: "bg-gold-500/20 text-gold-500",
  concluido: "bg-sage-500/20 text-sage-500",
  cancelado: "bg-ink-900/10 text-ink-900/40 line-through",
  faltou: "bg-red-100 text-red-600",
};

export default function AgendamentoBloco({
  agendamento,
}: {
  agendamento: { id: string; status: string; clienteNome: string; servicoNome: string };
}) {
  const router = useRouter();
  const [menuAberto, setMenuAberto] = useState(false);
  const [pending, startTransition] = useTransition();

  function mudarStatus(status: string) {
    setMenuAberto(false);
    startTransition(async () => {
      await atualizarStatusAgendamento(agendamento.id, status);
      router.refresh();
    });
  }

  return (
    <div className="relative h-full">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setMenuAberto((v) => !v);
        }}
        disabled={pending}
        className={`w-full h-full text-left px-2 py-1 text-xs rounded ${STATUS_COR[agendamento.status as StatusAgendamento] ?? "bg-plum-400/20 text-plum-800"}`}
      >
        <span className="block font-medium truncate">{agendamento.clienteNome}</span>
        <span className="block truncate opacity-80">{agendamento.servicoNome}</span>
      </button>

      {menuAberto && (
        <div className="absolute z-10 mt-1 w-40 rounded-lg border border-plum-400/20 bg-white shadow-lg py-1">
          {STATUS_VALIDOS.map((valor) => (
            <button
              key={valor}
              type="button"
              onClick={() => mudarStatus(valor)}
              className="block w-full text-left px-3 py-1.5 text-xs text-ink-900/80 hover:bg-ivory-100"
            >
              {STATUS_LABEL[valor]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
