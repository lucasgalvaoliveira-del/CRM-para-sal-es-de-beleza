"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type AuthState = { error: string } | undefined;

export async function login(_prevState: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });

  if (error) return { error: "E-mail ou senha inválidos." };
  redirect("/");
}

export async function signup(_prevState: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient();

  const nomeUsuario = String(formData.get("nomeUsuario"));
  const nomeEmpresa = String(formData.get("nomeEmpresa"));
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));

  const { error: signUpError } = await supabase.auth.signUp({ email, password });
  if (signUpError) return { error: signUpError.message };

  const { error: rpcError } = await supabase.rpc("criar_empresa_e_perfil", {
    nome_empresa: nomeEmpresa,
    nome_usuario: nomeUsuario,
  });
  if (rpcError) {
    return { error: "Conta criada, mas houve um erro ao configurar o salão. Tente fazer login." };
  }

  redirect("/");
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
