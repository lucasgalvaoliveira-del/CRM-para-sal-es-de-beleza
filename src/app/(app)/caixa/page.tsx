import { createClient } from "@/lib/supabase/server";
import AbrirCaixaForm from "./AbrirCaixaForm";
import NovaMovimentacaoForm from "./NovaMovimentacaoForm";

export default async function CaixaPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let timezone = "America/Sao_Paulo";
  if (user) {
    const { data: perfil } = await supabase
      .from("perfis")
      .select("empresas(timezone)")
      .eq("id", user.id)
      .single();
    const empresa = Array.isArray(perfil?.empresas) ? perfil?.empresas[0] : perfil?.empresas;
    timezone = empresa?.timezone ?? timezone;
  }

  const { data: caixaAberto } = await supabase
    .from("caixas")
    .select("id, aberto_em, valor_abertura")
    .eq("status", "aberto")
    .order("aberto_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  let movimentacoes: { id: string; tipo: string; categoria: string; valor: number; descricao: string | null; criado_em: string }[] = [];
  if (caixaAberto) {
    const { data } = await supabase
      .from("movimentacoes_caixa")
      .select("id, tipo, categoria, valor, descricao, criado_em")
      .eq("caixa_id", caixaAberto.id)
      .order("criado_em", { ascending: false });
    movimentacoes = data ?? [];
  }

  const totalEntradas = movimentacoes.filter((m) => m.tipo === "entrada").reduce((s, m) => s + Number(m.valor), 0);
  const totalSaidas = movimentacoes.filter((m) => m.tipo === "saida").reduce((s, m) => s + Number(m.valor), 0);
  const saldo = (caixaAberto?.valor_abertura ?? 0) + totalEntradas - totalSaidas;

  return (
    <div>
      <h1 className="font-display text-3xl text-plum-950">Caixa</h1>
      <p className="text-ink-900/60 mt-1">Movimentações do caixa aberto no momento.</p>

      {!caixaAberto ? (
        <AbrirCaixaForm />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 mt-8">
            <div className="rounded-2xl border border-plum-400/20 bg-white p-5">
              <p className="text-xs uppercase tracking-wide text-ink-900/50">Entradas</p>
              <p className="font-display text-2xl text-sage-500 mt-2">R$ {totalEntradas.toFixed(2)}</p>
            </div>
            <div className="rounded-2xl border border-plum-400/20 bg-white p-5">
              <p className="text-xs uppercase tracking-wide text-ink-900/50">Saídas</p>
              <p className="font-display text-2xl text-red-500 mt-2">R$ {totalSaidas.toFixed(2)}</p>
            </div>
            <div className="rounded-2xl border border-plum-400/20 bg-white p-5">
              <p className="text-xs uppercase tracking-wide text-ink-900/50">Saldo</p>
              <p className="font-display text-2xl text-plum-800 mt-2">R$ {saldo.toFixed(2)}</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-[1fr_320px] gap-6 items-start">
          <div className="rounded-2xl border border-plum-400/20 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-ivory-100 text-left text-ink-900/60">
                <tr>
                  <th className="px-4 py-3 font-medium">Horário</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Categoria</th>
                  <th className="px-4 py-3 font-medium">Descrição</th>
                  <th className="px-4 py-3 font-medium text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {movimentacoes.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-ink-900/50">
                      Nenhuma movimentação ainda.
                    </td>
                  </tr>
                )}
                {movimentacoes.map((m) => (
                  <tr key={m.id} className="border-t border-plum-400/10">
                    <td className="px-4 py-3 text-ink-900/60">
                      {new Date(m.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: timezone })}
                    </td>
                    <td className="px-4 py-3 capitalize">{m.tipo}</td>
                    <td className="px-4 py-3 capitalize text-ink-900/70">{m.categoria}</td>
                    <td className="px-4 py-3 text-ink-900/70">{m.descricao || "—"}</td>
                    <td className={`px-4 py-3 text-right font-medium ${m.tipo === "entrada" ? "text-sage-500" : "text-red-500"}`}>
                      {m.tipo === "entrada" ? "+" : "−"} R$ {Number(m.valor).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <NovaMovimentacaoForm caixaId={caixaAberto.id} />
          </div>
        </>
      )}
    </div>
  );
}
