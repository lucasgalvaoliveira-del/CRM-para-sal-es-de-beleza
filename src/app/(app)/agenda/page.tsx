import { createClient } from "@/lib/supabase/server";

export default async function AgendaPage() {
  const supabase = await createClient();
  const { data: profissionais } = await supabase
    .from("profissionais")
    .select("id, nome")
    .eq("ativo", true)
    .order("nome");

  const horarios = Array.from({ length: 21 }, (_, i) => {
    const totalMin = 8 * 60 + i * 30; // 08:00 até 18:30
    const h = String(Math.floor(totalMin / 60)).padStart(2, "0");
    const m = String(totalMin % 60).padStart(2, "0");
    return `${h}:${m}`;
  });

  const colunas = profissionais && profissionais.length > 0 ? profissionais : [{ id: "placeholder", nome: "Cadastre um profissional" }];

  return (
    <div>
      <h1 className="font-display text-3xl text-plum-950">Agenda</h1>
      <p className="text-ink-900/60 mt-1">Visão do dia por profissional.</p>

      <div className="mt-8 rounded-2xl border border-plum-400/20 bg-white overflow-hidden">
        <div className="grid" style={{ gridTemplateColumns: `80px repeat(${colunas.length}, 1fr)` }}>
          <div className="bg-ivory-100" />
          {colunas.map((p) => (
            <div key={p.id} className="bg-ivory-100 px-4 py-3 text-sm font-medium text-plum-800 border-l border-plum-400/10">
              {p.nome}
            </div>
          ))}

          {horarios.map((h) => (
            <>
              <div key={`h-${h}`} className="px-3 py-3 text-xs text-ink-900/50 border-t border-plum-400/10">
                {h}
              </div>
              {colunas.map((p) => (
                <div
                  key={`${p.id}-${h}`}
                  className="border-t border-l border-plum-400/10 min-h-10 hover:bg-sage-300/10 transition-colors"
                />
              ))}
            </>
          ))}
        </div>
      </div>
    </div>
  );
}
