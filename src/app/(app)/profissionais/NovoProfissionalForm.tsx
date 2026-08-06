"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NovoProfissionalForm() {
  const router = useRouter();
  const supabase = createClient();
  const [nome, setNome] = useState("");
  const [especialidade, setEspecialidade] = useState("");
  const [comissao, setComissao] = useState("0");
  const [ativo, setAtivo] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);

    const { error } = await supabase.from("profissionais").insert({
      nome,
      especialidade: especialidade || null,
      percentual_comissao: Number(comissao.replace(",", ".")) || 0,
      ativo,
    });

    setSalvando(false);
    if (error) {
      setErro("Não foi possível salvar. Verifique a conexão com o Supabase.");
      return;
    }
    setNome("");
    setEspecialidade("");
    setComissao("0");
    setAtivo(true);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-plum-400/20 bg-white p-5 h-fit space-y-4"
    >
      <h2 className="font-display text-lg text-plum-800">Novo profissional</h2>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-ink-900/50">Nome</label>
        <input
          required
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600"
          placeholder="Nome completo"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-ink-900/50">Especialidade</label>
        <input
          value={especialidade}
          onChange={(e) => setEspecialidade(e.target.value)}
          className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600"
          placeholder="Ex: Colorista"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-ink-900/50">Comissão (%)</label>
        <input
          value={comissao}
          onChange={(e) => setComissao(e.target.value)}
          className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600"
          placeholder="0"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-ink-900/70">
        <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
        Ativo
      </label>

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      <button
        type="submit"
        disabled={salvando}
        className="w-full rounded-lg bg-plum-800 text-white py-2.5 text-sm font-medium hover:bg-plum-950 transition-colors disabled:opacity-50"
      >
        {salvando ? "Salvando…" : "Salvar profissional"}
      </button>
    </form>
  );
}
