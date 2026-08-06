import Sidebar from "@/components/Sidebar";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let empresaNome = "";
  let usuarioNome = "";

  if (user) {
    const { data: perfil } = await supabase
      .from("perfis")
      .select("nome, empresas(nome)")
      .eq("id", user.id)
      .single();

    if (perfil) {
      usuarioNome = perfil.nome;
      const empresa = Array.isArray(perfil.empresas) ? perfil.empresas[0] : perfil.empresas;
      empresaNome = empresa?.nome ?? "";
    }
  }

  return (
    <div className="flex">
      <Sidebar empresaNome={empresaNome} usuarioNome={usuarioNome} />
      <main className="flex-1 min-h-screen bg-ivory-50 p-8">{children}</main>
    </div>
  );
}
