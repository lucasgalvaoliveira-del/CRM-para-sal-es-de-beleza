"use client";

import { useState, useTransition } from "react";
import { registrarMovimentacao } from "./actions";

export default function NovaMovimentacaoForm({ caixaId }: { caixaId: string }) {
  const [tipo, setTipo] = useState<"entrada" | "saida">("entrada");
  const [categoria, setCategoria] = useState("servico");
  const [formaPagamento, setFormaPagamento] = useState("dinheiro");
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const res = await registrarMovimentacao({
        caixaId,
        tipo,
        categoria,
        formaPagamento,
        valor: Number(valor.replace(",", ".")) || 0,
        descricao,
      });
      if (res.error) setErro(res.error);
      else { setValor(""); setDescricao(""); }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-plum-400/20 bg-white p-5 space-y-4">
      <h2 className="font-display text-lg text-plum-800">Nova movimentação</h2>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wide text-ink-900/50">Tipo</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as "entrada" | "saida")}
            className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600">
            <option value="entrada">Entrada</option>
            <option value="saida">Saída</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wide text-ink-900/50">Categoria</label>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)}
            className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600">
            <option value="servico">Serviço</option>
            <option value="produto">Produto</option>
            <option value="despesa">Despesa</option>
            <option value="adiantamento">Adiantamento</option>
            <option value="outros">Outros</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wide text-ink-900/50">Forma de pagamento</label>
          <select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)}
            className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600">
            <option value="dinheiro">Dinheiro</option>
            <option value="pix">Pix</option>
            <option value="cartao_debito">Cartão débito</option>
            <option value="cartao_credito">Cartão crédito</option>
            <option value="outros">Outros</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wide text-ink-900/50">Valor (R$)</label>
          <input required value={valor} onChange={(e) => setValor(e.target.value)}
            className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600" placeholder="0,00" />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-ink-900/50">Descrição (opcional)</label>
        <input value={descricao} onChange={(e) => setDescricao(e.target.value)}
          className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600" />
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      <button type="submit" disabled={pending}
        className="w-full rounded-lg bg-plum-800 text-white py-2.5 text-sm font-medium hover:bg-plum-950 transition-colors disabled:opacity-50">
        {pending ? "Registrando…" : "Registrar movimentação"}
      </button>
    </form>
  );
}
