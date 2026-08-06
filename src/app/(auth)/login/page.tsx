"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login } from "../actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined);

  return (
    <form
      action={formAction}
      className="w-full max-w-sm rounded-2xl border border-plum-400/20 bg-white p-8 space-y-4"
    >
      <h1 className="font-display text-2xl text-plum-950">Entrar</h1>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-ink-900/50">E-mail</label>
        <input
          required
          type="email"
          name="email"
          className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600"
          placeholder="voce@salao.com"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-ink-900/50">Senha</label>
        <input
          required
          type="password"
          name="password"
          className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm focus:border-plum-600"
        />
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-plum-800 text-white py-2.5 text-sm font-medium hover:bg-plum-950 transition-colors disabled:opacity-50"
      >
        {pending ? "Entrando…" : "Entrar"}
      </button>

      <p className="text-sm text-ink-900/60 text-center">
        Ainda não tem conta?{" "}
        <Link href="/signup" className="text-plum-600 hover:underline">
          Criar salão
        </Link>
      </p>
    </form>
  );
}
