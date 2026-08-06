"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NovoClienteForm() {
  const router = useRouter();
  const supabase = createClient();
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);

    const { error } = await supabase.from("clientes").insert({ nome, telefone, email });

    setSalvando(false);
    if (error) {
      setErro("Não foi possível salvar. Verifique a conexão com o Supabase.");
      return;
    }
    setNome("");
    setTelefone("");
    setEmail("");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-plum-400/20 bg-white p-5 h-fit space-y-4"
    >
      <h2 className="font-display text-lg text-plum-800">Novo cliente</h2>

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
        <label className="text-xs uppercase tracking-wide text-ink-900/50">Telefone</label>
        <input
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600"
          placeholder="(00) 00000-0000"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-ink-900/50">E-mail</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600"
          placeholder="cliente@email.com"
        />
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      <button
        type="submit"
        disabled={salvando}
        className="w-full rounded-lg bg-plum-800 text-white py-2.5 text-sm font-medium hover:bg-plum-950 transition-colors disabled:opacity-50"
      >
        {salvando ? "Salvando…" : "Salvar cliente"}
      </button>
    </form>
  );
}
