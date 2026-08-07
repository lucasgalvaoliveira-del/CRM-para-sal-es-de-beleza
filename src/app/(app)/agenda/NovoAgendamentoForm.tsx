"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { criarAgendamento } from "./actions";
import type { Cliente, Profissional, Servico } from "./types";

export default function NovoAgendamentoForm({
  dataLocal,
  horario,
  profissionalId,
  profissionais,
  clientes,
  servicos,
  onFechar,
}: {
  dataLocal: string;
  horario: string;
  profissionalId: string;
  profissionais: Profissional[];
  clientes: Cliente[];
  servicos: Servico[];
  onFechar: () => void;
}) {
  const router = useRouter();
  const [profissionalSelecionado, setProfissionalSelecionado] = useState(profissionalId);
  const [buscaCliente, setBuscaCliente] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [servicoId, setServicoId] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const clientesFiltrados = buscaCliente
    ? clientes.filter((c) => c.nome.toLowerCase().includes(buscaCliente.toLowerCase()))
    : clientes;

  const servicoSelecionado = servicos.find((s) => s.id === servicoId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clienteId || !servicoId || !servicoSelecionado) {
      setErro("Selecione um cliente e um serviço.");
      return;
    }
    setSalvando(true);
    setErro(null);

    const res = await criarAgendamento({
      clienteId,
      profissionalId: profissionalSelecionado,
      servicoId,
      dataLocal,
      horaInicio: horario,
    });

    setSalvando(false);
    if (res.error) {
      setErro(res.error);
      return;
    }
    router.refresh();
    onFechar();
  }

  return (
    <div className="fixed inset-0 bg-ink-900/40 flex items-center justify-center z-50 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-plum-400/20 bg-white p-6 space-y-4"
      >
        <h2 className="font-display text-lg text-plum-800">Novo agendamento — {horario}</h2>

        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wide text-ink-900/50">Profissional</label>
          <select
            value={profissionalSelecionado}
            onChange={(e) => setProfissionalSelecionado(e.target.value)}
            className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600"
          >
            {profissionais.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wide text-ink-900/50">Cliente</label>
          <input
            value={buscaCliente}
            onChange={(e) => setBuscaCliente(e.target.value)}
            placeholder="Buscar por nome"
            className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600"
          />
          <select
            required
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
            size={4}
            className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600"
          >
            {clientesFiltrados.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wide text-ink-900/50">Serviço</label>
          <select
            required
            value={servicoId}
            onChange={(e) => setServicoId(e.target.value)}
            className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600"
          >
            <option value="">Selecione</option>
            {servicos.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome} ({s.duracao_minutos} min)
              </option>
            ))}
          </select>
        </div>

        {erro && <p className="text-sm text-red-600">{erro}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onFechar}
            className="flex-1 rounded-lg border border-plum-400/30 text-plum-800 py-2.5 text-sm font-medium hover:bg-ivory-100 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className="flex-1 rounded-lg bg-plum-800 text-white py-2.5 text-sm font-medium hover:bg-plum-950 transition-colors disabled:opacity-50"
          >
            {salvando ? "Salvando…" : "Agendar"}
          </button>
        </div>
      </form>
    </div>
  );
}
