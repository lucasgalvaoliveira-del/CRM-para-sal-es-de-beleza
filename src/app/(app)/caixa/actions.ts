"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function abrirCaixa(valorAbertura: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { data: perfil } = await supabase
    .from("perfis")
    .select("empresa_id")
    .eq("id", user.id)
    .single();
  if (!perfil) return { error: "Perfil não encontrado. Configure autenticação primeiro." };

  const { error } = await supabase.from("caixas").insert({
    empresa_id: perfil.empresa_id,
    valor_abertura: valorAbertura,
    status: "aberto",
  });

  if (error) {
    if (error.code === "23505") return { error: "Já existe um caixa aberto para esta empresa." };
    return { error: error.message };
  }
  revalidatePath("/caixa");
  return { error: null };
}

export async function registrarMovimentacao(params: {
  caixaId: string;
  tipo: "entrada" | "saida";
  categoria: string;
  formaPagamento: string;
  valor: number;
  descricao?: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("movimentacoes_caixa").insert({
    caixa_id: params.caixaId,
    tipo: params.tipo,
    categoria: params.categoria,
    forma_pagamento: params.formaPagamento,
    valor: params.valor,
    descricao: params.descricao,
  });

  if (error) return { error: error.message };
  revalidatePath("/caixa");
  return { error: null };
}

export async function fecharCaixa(caixaId: string, valorFechamento: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("caixas")
    .update({ status: "fechado", fechado_em: new Date().toISOString(), valor_fechamento: valorFechamento })
    .eq("id", caixaId);

  if (error) return { error: error.message };
  revalidatePath("/caixa");
  return { error: null };
}
