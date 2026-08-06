import { createClient } from "@/lib/supabase/server";
import NovoProdutoForm from "./NovoProdutoForm";

export default async function ProdutosPage() {
  const supabase = await createClient();
  const { data: produtos, error } = await supabase
    .from("produtos")
    .select("id, nome, quantidade_estoque, unidade, preco_custo, preco_venda")
    .order("nome");

  return (
    <div>
      <h1 className="font-display text-3xl text-plum-950">Produtos</h1>
      <p className="text-ink-900/60 mt-1">Estoque e preços de produtos para venda.</p>

      <div className="mt-8 grid grid-cols-[1fr_320px] gap-8">
        <div className="rounded-2xl border border-plum-400/20 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ivory-100 text-left text-ink-900/60">
              <tr>
                <th className="px-4 py-3 font-medium">Produto</th>
                <th className="px-4 py-3 font-medium">Estoque</th>
                <th className="px-4 py-3 font-medium text-right">Custo</th>
                <th className="px-4 py-3 font-medium text-right">Venda</th>
              </tr>
            </thead>
            <tbody>
              {error && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-ink-900/50">Configure o Supabase para conectar ao banco.</td></tr>
              )}
              {!error && (!produtos || produtos.length === 0) && (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-ink-900/50">Nenhum produto cadastrado ainda.</td></tr>
              )}
              {produtos?.map((p) => (
                <tr key={p.id} className="border-t border-plum-400/10">
                  <td className="px-4 py-3">{p.nome}</td>
                  <td className="px-4 py-3 text-ink-900/70">{p.quantidade_estoque} {p.unidade}</td>
                  <td className="px-4 py-3 text-right text-ink-900/70">R$ {Number(p.preco_custo).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-medium">R$ {Number(p.preco_venda).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <NovoProdutoForm />
      </div>
    </div>
  );
}
