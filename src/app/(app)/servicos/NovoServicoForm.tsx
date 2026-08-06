"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NovoServicoForm() {
  const router = useRouter();
  const supabase = createClient();
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("");
  const [duracao, setDuracao] = useState("30");
  const [preco, setPreco] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);

    const { error } = await supabase.from("servicos").insert({
      nome,
      categoria: categoria || null,
      duracao_minutos: Number(duracao),
      preco: Number(preco.replace(",", ".")) || 0,
    });

    setSalvando(false);
    if (error) {
      setErro("Não foi possível salvar. Verifique a conexão com o Supabase.");
      return;
    }
    setNome(""); setCategoria(""); setDuracao("30"); setPreco("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-plum-400/20 bg-white p-5 h-fit space-y-4">
      <h2 className="font-display text-lg text-plum-800">Novo serviço</h2>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-ink-900/50">Nome</label>
        <input required value={nome} onChange={(e) => setNome(e.target.value)}
          className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600"
          placeholder="Ex: Corte feminino" />
      </div>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-ink-900/50">Categoria</label>
        <input value={categoria} onChange={(e) => setCategoria(e.target.value)}
          className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600"
          placeholder="Ex: Cabelo" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wide text-ink-900/50">Duração (min)</label>
          <input type="number" min={5} step={5} value={duracao} onChange={(e) => setDuracao(e.target.value)}
            className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600" />
        </div>
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wide text-ink-900/50">Preço (R$)</label>
          <input required value={preco} onChange={(e) => setPreco(e.target.value)}
            className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600"
            placeholder="0,00" />
        </div>
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      <button type="submit" disabled={salvando}
        className="w-full rounded-lg bg-plum-800 text-white py-2.5 text-sm font-medium hover:bg-plum-950 transition-colors disabled:opacity-50">
        {salvando ? "Salvando…" : "Salvar serviço"}
      </button>
    </form>
  );
}
