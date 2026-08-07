"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { STATUS_VALIDOS, type StatusAgendamento } from "./status";

export async function criarAgendamento(params: {
  clienteId: string;
  profissionalId: string;
  servicoId: string;
  dataLocal: string;
  horaInicio: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { data: perfil } = await supabase
    .from("perfis")
    .select("empresa_id, empresas(timezone)")
    .eq("id", user.id)
    .single();
  if (!perfil) return { error: "Perfil não encontrado. Configure autenticação primeiro." };

  const empresa = Array.isArray(perfil.empresas) ? perfil.empresas[0] : perfil.empresas;
  const timezone = empresa?.timezone ?? "America/Sao_Paulo";

  const { data: servico } = await supabase
    .from("servicos")
    .select("duracao_minutos")
    .eq("id", params.servicoId)
    .single();
  if (!servico) return { error: "Serviço não encontrado." };

  const { data: inicioIso, error: erroInstante } = await supabase.rpc("instante_local", {
    tz: timezone,
    data: params.dataLocal,
    hora: `${params.horaInicio}:00`,
  });
  if (erroInstante || !inicioIso) {
    return { error: "Não foi possível calcular o horário do agendamento." };
  }

  const fimIso = new Date(new Date(inicioIso).getTime() + servico.duracao_minutos * 60000).toISOString();

  const { error } = await supabase.from("agendamentos").insert({
    empresa_id: perfil.empresa_id,
    cliente_id: params.clienteId,
    profissional_id: params.profissionalId,
    servico_id: params.servicoId,
    inicio: inicioIso,
    fim: fimIso,
    status: "agendado",
  });

  if (error) {
    if (error.code === "23P01") return { error: "Este profissional já tem um agendamento nesse horário." };
    return { error: error.message };
  }
  revalidatePath("/agenda");
  return { error: null };
}

export async function atualizarStatusAgendamento(agendamentoId: string, status: string) {
  if (!STATUS_VALIDOS.includes(status as StatusAgendamento)) {
    return { error: "Status inválido." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("agendamentos").update({ status }).eq("id", agendamentoId);

  if (error) {
    if (error.code === "23P01") {
      return {
        error:
          "Este profissional já tem outro agendamento nesse horário — não é possível reativar este.",
      };
    }
    return { error: error.message };
  }
  revalidatePath("/agenda");
  return { error: null };
}
