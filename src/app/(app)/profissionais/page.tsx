import { createClient } from "@/lib/supabase/server";
import NovoProfissionalForm from "./NovoProfissionalForm";

export default async function ProfissionaisPage() {
  const supabase = await createClient();
  const { data: profissionais, error } = await supabase
    .from("profissionais")
    .select("id, nome, especialidade, percentual_comissao, ativo")
    .order("nome");

  return (
    <div>
      <h1 className="font-display text-3xl text-plum-950">Profissionais</h1>
      <p className="text-ink-900/60 mt-1">Equipe que atende na agenda.</p>

      <div className="mt-8 grid grid-cols-[1fr_320px] gap-8">
        <div className="rounded-2xl border border-plum-400/20 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ivory-100 text-left text-ink-900/60">
              <tr>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Especialidade</th>
                <th className="px-4 py-3 font-medium text-right">Comissão</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {error && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-ink-900/50">
                    Configure o Supabase para conectar ao banco.
                  </td>
                </tr>
              )}
              {!error && (!profissionais || profissionais.length === 0) && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-ink-900/50">
                    Nenhum profissional cadastrado ainda.
                  </td>
                </tr>
              )}
              {profissionais?.map((p) => (
                <tr key={p.id} className="border-t border-plum-400/10">
                  <td className="px-4 py-3">{p.nome}</td>
                  <td className="px-4 py-3 text-ink-900/70">{p.especialidade || "—"}</td>
                  <td className="px-4 py-3 text-right">{Number(p.percentual_comissao)}%</td>
                  <td className="px-4 py-3">
                    {p.ativo ? (
                      <span className="text-sage-500">Ativo</span>
                    ) : (
                      <span className="text-ink-900/40">Inativo</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <NovoProfissionalForm />
      </div>
    </div>
  );
}
