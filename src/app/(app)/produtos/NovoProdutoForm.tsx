"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NovoProdutoForm() {
  const router = useRouter();
  const supabase = createClient();
  const [nome, setNome] = useState("");
  const [quantidade, setQuantidade] = useState("0");
  const [unidade, setUnidade] = useState("UN");
  const [precoCusto, setPrecoCusto] = useState("");
  const [precoVenda, setPrecoVenda] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);

    const { error } = await supabase.from("produtos").insert({
      nome,
      quantidade_estoque: Number(quantidade.replace(",", ".")) || 0,
      unidade,
      preco_custo: Number(precoCusto.replace(",", ".")) || 0,
      preco_venda: Number(precoVenda.replace(",", ".")) || 0,
    });

    setSalvando(false);
    if (error) {
      setErro("Não foi possível salvar. Verifique a conexão com o Supabase.");
      return;
    }
    setNome(""); setQuantidade("0"); setUnidade("UN"); setPrecoCusto(""); setPrecoVenda("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-plum-400/20 bg-white p-5 h-fit space-y-4">
      <h2 className="font-display text-lg text-plum-800">Novo produto</h2>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-ink-900/50">Nome</label>
        <input required value={nome} onChange={(e) => setNome(e.target.value)}
          className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600"
          placeholder="Ex: Shampoo 300ml" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wide text-ink-900/50">Estoque</label>
          <input value={quantidade} onChange={(e) => setQuantidade(e.target.value)}
            className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600" />
        </div>
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wide text-ink-900/50">Unidade</label>
          <input value={unidade} onChange={(e) => setUnidade(e.target.value)}
            className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wide text-ink-900/50">Preço custo</label>
          <input value={precoCusto} onChange={(e) => setPrecoCusto(e.target.value)}
            className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600" placeholder="0,00" />
        </div>
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wide text-ink-900/50">Preço venda</label>
          <input required value={precoVenda} onChange={(e) => setPrecoVenda(e.target.value)}
            className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600" placeholder="0,00" />
        </div>
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      <button type="submit" disabled={salvando}
        className="w-full rounded-lg bg-plum-800 text-white py-2.5 text-sm font-medium hover:bg-plum-950 transition-colors disabled:opacity-50">
        {salvando ? "Salvando…" : "Salvar produto"}
      </button>
    </form>
  );
}
