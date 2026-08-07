import { createClient } from "@/lib/supabase/server";
import AgendaGrade from "./AgendaGrade";
import type { AgendamentoRow, Slot } from "./types";

type Limites = { inicio: string; fim: string };

export default async function AgendaPage() {
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

  const dataLocal = new Date().toLocaleDateString("en-CA", { timeZone: timezone });

  const { data: limitesData, error: erroLimites } = await supabase
    .rpc("limites_dia_local", { tz: timezone })
    .single();
  if (erroLimites) console.error("Erro ao buscar limites_dia_local:", erroLimites);
  const limites = limitesData as Limites | null;

  const { data: horariosData, error: erroHorarios } = await supabase.rpc("horarios_do_dia", {
    tz: timezone,
    data: dataLocal,
  });
  if (erroHorarios) console.error("Erro ao buscar horarios_do_dia:", erroHorarios);
  const horarios: Slot[] = horariosData ?? [];

  const { data: profissionaisData } = await supabase
    .from("profissionais")
    .select("id, nome")
    .eq("ativo", true)
    .order("nome");

  const { data: clientesData } = await supabase.from("clientes").select("id, nome").order("nome");

  const { data: servicosData } = await supabase
    .from("servicos")
    .select("id, nome, duracao_minutos")
    .eq("ativo", true)
    .order("nome");

  let agendamentos: AgendamentoRow[] = [];
  if (limites) {
    const { data, error: erroAgendamentos } = await supabase
      .from("agendamentos")
      .select("id, profissional_id, inicio, fim, status, clientes(nome), servicos(nome)")
      .lt("inicio", limites.fim)
      .gt("fim", limites.inicio)
      .order("inicio");
    if (erroAgendamentos) console.error("Erro ao buscar agendamentos:", erroAgendamentos);
    agendamentos = (data ?? []) as AgendamentoRow[];
  }

  return (
    <AgendaGrade
      dataLocal={dataLocal}
      horarios={horarios}
      profissionais={profissionaisData ?? []}
      clientes={clientesData ?? []}
      servicos={servicosData ?? []}
      agendamentos={agendamentos}
    />
  );
}
