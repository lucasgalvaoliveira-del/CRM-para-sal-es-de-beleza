"use client";

import { useState, useTransition } from "react";
import { abrirCaixa } from "./actions";

export default function AbrirCaixaForm() {
  const [valor, setValor] = useState("0,00");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const res = await abrirCaixa(Number(valor.replace(",", ".")) || 0);
      if (res.error) setErro(res.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 rounded-2xl border border-dashed border-plum-400/40 bg-white p-10 text-center space-y-4">
      <p className="text-ink-900/60">Nenhum caixa aberto no momento.</p>
      <div className="max-w-xs mx-auto space-y-1 text-left">
        <label className="text-xs uppercase tracking-wide text-ink-900/50">Valor de abertura (R$)</label>
        <input value={valor} onChange={(e) => setValor(e.target.value)}
          className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm text-center focus:border-plum-600" />
      </div>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      <button type="submit" disabled={pending}
        className="rounded-lg bg-plum-800 text-white px-6 py-2.5 text-sm font-medium hover:bg-plum-950 transition-colors disabled:opacity-50">
        {pending ? "Abrindo…" : "Abrir caixa"}
      </button>
    </form>
  );
}
