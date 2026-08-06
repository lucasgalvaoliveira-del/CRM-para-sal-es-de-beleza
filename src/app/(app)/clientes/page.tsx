import { createClient } from "@/lib/supabase/server";
import NovoClienteForm from "./NovoClienteForm";

export default async function ClientesPage() {
  const supabase = await createClient();
  const { data: clientes, error } = await supabase
    .from("clientes")
    .select("id, nome, telefone, email, criado_em")
    .order("criado_em", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-plum-950">Clientes</h1>
          <p className="text-ink-900/60 mt-1">Cadastro e histórico da sua base de clientes.</p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-[1fr_320px] gap-8">
        <div className="rounded-2xl border border-plum-400/20 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ivory-100 text-left text-ink-900/60">
              <tr>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Telefone</th>
                <th className="px-4 py-3 font-medium">E-mail</th>
              </tr>
            </thead>
            <tbody>
              {error && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-ink-900/50">
                    Configure as variáveis de ambiente do Supabase (.env.local) para conectar ao banco.
                  </td>
                </tr>
              )}
              {!error && (!clientes || clientes.length === 0) && (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-ink-900/50">
                    Nenhum cliente cadastrado ainda. Use o formulário ao lado para começar.
                  </td>
                </tr>
              )}
              {clientes?.map((c) => (
                <tr key={c.id} className="border-t border-plum-400/10">
                  <td className="px-4 py-3">{c.nome}</td>
                  <td className="px-4 py-3 text-ink-900/70">{c.telefone || "—"}</td>
                  <td className="px-4 py-3 text-ink-900/70">{c.email || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <NovoClienteForm />
      </div>
    </div>
  );
}
