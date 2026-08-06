import { createClient } from "@/lib/supabase/server";
import NovoServicoForm from "./NovoServicoForm";

export default async function ServicosPage() {
  const supabase = await createClient();
  const { data: servicos, error } = await supabase
    .from("servicos")
    .select("id, nome, categoria, duracao_minutos, preco")
    .order("nome");

  return (
    <div>
      <h1 className="font-display text-3xl text-plum-950">Serviços</h1>
      <p className="text-ink-900/60 mt-1">Catálogo de serviços oferecidos pelo estúdio.</p>

      <div className="mt-8 grid grid-cols-[1fr_320px] gap-8">
        <div className="rounded-2xl border border-plum-400/20 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ivory-100 text-left text-ink-900/60">
              <tr>
                <th className="px-4 py-3 font-medium">Serviço</th>
                <th className="px-4 py-3 font-medium">Categoria</th>
                <th className="px-4 py-3 font-medium">Duração</th>
                <th className="px-4 py-3 font-medium text-right">Preço</th>
              </tr>
            </thead>
            <tbody>
              {error && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-ink-900/50">Configure o Supabase para conectar ao banco.</td></tr>
              )}
              {!error && (!servicos || servicos.length === 0) && (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-ink-900/50">Nenhum serviço cadastrado ainda.</td></tr>
              )}
              {servicos?.map((s) => (
                <tr key={s.id} className="border-t border-plum-400/10">
                  <td className="px-4 py-3">{s.nome}</td>
                  <td className="px-4 py-3 text-ink-900/70">{s.categoria || "—"}</td>
                  <td className="px-4 py-3 text-ink-900/70">{s.duracao_minutos} min</td>
                  <td className="px-4 py-3 text-right font-medium">R$ {Number(s.preco).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <NovoServicoForm />
      </div>
    </div>
  );
}
