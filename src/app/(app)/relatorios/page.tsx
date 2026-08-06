import { createClient } from "@/lib/supabase/server";

export default async function RelatoriosPage() {
  const supabase = await createClient();
  const { data: faturamento, error } = await supabase
    .from("v_faturamento_diario")
    .select("dia, total_servicos, total_produtos, total_entradas, total_saidas")
    .order("dia", { ascending: false })
    .limit(30);

  const totalPeriodo = faturamento?.reduce((s, d) => s + Number(d.total_entradas) - Number(d.total_saidas), 0) ?? 0;

  return (
    <div>
      <h1 className="font-display text-3xl text-plum-950">Relatórios</h1>
      <p className="text-ink-900/60 mt-1">Faturamento diário (últimos 30 dias com movimentação).</p>

      <div className="mt-8 rounded-2xl border border-plum-400/20 bg-white p-5">
        <p className="text-xs uppercase tracking-wide text-ink-900/50">Resultado do período</p>
        <p className="font-display text-3xl text-plum-800 mt-2">R$ {totalPeriodo.toFixed(2)}</p>
      </div>

      <div className="mt-6 rounded-2xl border border-plum-400/20 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ivory-100 text-left text-ink-900/60">
            <tr>
              <th className="px-4 py-3 font-medium">Dia</th>
              <th className="px-4 py-3 font-medium text-right">Serviços</th>
              <th className="px-4 py-3 font-medium text-right">Produtos</th>
              <th className="px-4 py-3 font-medium text-right">Entradas</th>
              <th className="px-4 py-3 font-medium text-right">Saídas</th>
            </tr>
          </thead>
          <tbody>
            {(error || !faturamento || faturamento.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-ink-900/50">
                  Sem movimentações registradas ainda — os números aparecem aqui assim que o Caixa começar a ser usado.
                </td>
              </tr>
            )}
            {faturamento?.map((d) => (
              <tr key={d.dia} className="border-t border-plum-400/10">
                <td className="px-4 py-3">{new Date(d.dia).toLocaleDateString("pt-BR")}</td>
                <td className="px-4 py-3 text-right">R$ {Number(d.total_servicos).toFixed(2)}</td>
                <td className="px-4 py-3 text-right">R$ {Number(d.total_produtos).toFixed(2)}</td>
                <td className="px-4 py-3 text-right text-sage-500">R$ {Number(d.total_entradas).toFixed(2)}</td>
                <td className="px-4 py-3 text-right text-red-500">R$ {Number(d.total_saidas).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
