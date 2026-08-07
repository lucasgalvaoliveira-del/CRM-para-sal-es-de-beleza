"use client";

import { Fragment, useState } from "react";
import NovoAgendamentoForm from "./NovoAgendamentoForm";
import AgendamentoBloco from "./AgendamentoBloco";
import type { AgendamentoRow, Cliente, NomeRelacionado, Profissional, Servico, Slot } from "./types";

function nomeRelacionado(valor: NomeRelacionado): string {
  if (!valor) return "—";
  return Array.isArray(valor) ? (valor[0]?.nome ?? "—") : valor.nome;
}

// Sobreposição real de intervalos — usada só aqui dentro (AgendaGrade),
// por agendamentoNoSlot, pra decidir se um agendamento ocupa um dado slot.
// O filtro "quais agendamentos pertencem ao dia" é feito em page.tsx via
// PostgREST (.lt()/.gt() contra os limites do dia local), não por esta
// função. Compara timestamps reais (epoch), nunca strings de horário
// local — é assim que um serviço de 60min que começa num slot cobre
// corretamente o slot seguinte também.
function sobrepoe(aInicio: string, aFim: string, bInicio: string, bFim: string): boolean {
  return new Date(aInicio).getTime() < new Date(bFim).getTime() && new Date(aFim).getTime() > new Date(bInicio).getTime();
}

export default function AgendaGrade({
  dataLocal,
  horarios,
  profissionais,
  clientes,
  servicos,
  agendamentos,
}: {
  dataLocal: string;
  horarios: Slot[];
  profissionais: Profissional[];
  clientes: Cliente[];
  servicos: Servico[];
  agendamentos: AgendamentoRow[];
}) {
  const colunas =
    profissionais.length > 0 ? profissionais : [{ id: "placeholder", nome: "Cadastre um profissional" }];

  const [slotSelecionado, setSlotSelecionado] = useState<{ profissionalId: string; horario: string } | null>(null);
  const [profissionalMobile, setProfissionalMobile] = useState(colunas[0].id);

  // Encontra o agendamento ATIVO que sobrepõe este slot pra este
  // profissional — cobre tanto o slot em que o agendamento começa quanto
  // qualquer slot seguinte que ele ainda ocupa (ex: serviço de 60min cobre
  // 2 slots de 30min). Compara [inicio,fim) reais de ambos os lados, nunca
  // horário local formatado.
  //
  // Cancelado/faltou NUNCA ocupa um slot aqui — a regra de negócio já os
  // exclui da exclusion constraint no banco (o horário está livre pra
  // reagendar assim que o status muda), e a UI precisa refletir isso: o
  // bloco de um agendamento cobre a célula inteira e intercepta o clique
  // (AgendamentoBloco faz stopPropagation no botão), então um cancelado
  // sendo "o único candidato" nesse slot travaria o clique de criação sem
  // nenhuma forma de contornar — um bug real encontrado em produção logo
  // após o merge da Agenda v1. Ver histórico de agendamentos cancelados é
  // uma feature futura (fora da grade de ocupação), não este componente.
  function agendamentoNoSlot(profissionalId: string, slot: Slot) {
    return agendamentos.find(
      (a) =>
        a.profissional_id === profissionalId &&
        a.status !== "cancelado" &&
        a.status !== "faltou" &&
        sobrepoe(a.inicio, a.fim, slot.inicio, slot.fim)
    );
  }

  // Um slot "é o início" de um agendamento quando o inicio real do
  // agendamento cai dentro do intervalo [slot.inicio, slot.fim) deste
  // slot específico — usado pra decidir se este slot renderiza o bloco
  // completo (clicável, com menu de status) ou só um preenchimento mudo
  // indicando "continua" (ainda ocupado, mas não repete o botão/menu).
  //
  // Limitação conhecida (hoje inalcançável): se o `inicio` real de um
  // agendamento for anterior ao primeiro slot visível do dia, nenhum slot
  // satisfaz slotEhInicio() e o bloco completo nunca é renderizado nesse
  // dia — só o preenchimento "···". Não alcançável hoje (horário comercial
  // fixo 08:00-18:00 em horarios_do_dia, e o formulário de criação só
  // oferece horários dessa mesma lista). Revisitar se essas premissas
  // mudarem (horário comercial configurável, serviço muito longo perto do
  // fechamento).
  function slotEhInicio(agendamento: AgendamentoRow, slot: Slot) {
    const inicioMs = new Date(agendamento.inicio).getTime();
    return inicioMs >= new Date(slot.inicio).getTime() && inicioMs < new Date(slot.fim).getTime();
  }

  function abrirFormulario(profissionalId: string, horario: string) {
    if (profissionalId === "placeholder") return;
    setSlotSelecionado({ profissionalId, horario });
  }

  return (
    <div>
      <h1 className="font-display text-3xl text-plum-950">Agenda</h1>
      <p className="text-ink-900/60 mt-1">Visão do dia por profissional.</p>

      {/* Grade — telas médias pra cima */}
      <div className="hidden md:block mt-8 rounded-2xl border border-plum-400/20 bg-white overflow-hidden">
        <div className="grid" style={{ gridTemplateColumns: `80px repeat(${colunas.length}, 1fr)` }}>
          <div className="bg-ivory-100" />
          {colunas.map((p) => (
            <div
              key={p.id}
              className="bg-ivory-100 px-4 py-3 text-sm font-medium text-plum-800 border-l border-plum-400/10"
            >
              {p.nome}
            </div>
          ))}

          {horarios.map((slot) => (
            <Fragment key={slot.horario}>
              <div className="px-3 py-3 text-xs text-ink-900/50 border-t border-plum-400/10">
                {slot.horario}
              </div>
              {colunas.map((p) => {
                const agendamento = p.id === "placeholder" ? undefined : agendamentoNoSlot(p.id, slot);
                const ehInicio = agendamento && slotEhInicio(agendamento, slot);
                return (
                  <div
                    key={`${p.id}-${slot.horario}`}
                    className="border-t border-l border-plum-400/10 min-h-10 hover:bg-sage-300/10 transition-colors"
                    onClick={() => !agendamento && abrirFormulario(p.id, slot.horario)}
                  >
                    {agendamento && ehInicio && (
                      <AgendamentoBloco
                        agendamento={{
                          id: agendamento.id,
                          status: agendamento.status,
                          clienteNome: nomeRelacionado(agendamento.clientes),
                          servicoNome: nomeRelacionado(agendamento.servicos),
                        }}
                      />
                    )}
                    {agendamento && !ehInicio && (
                      <div className="w-full h-full px-2 py-1 text-xs text-ink-900/30">···</div>
                    )}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {/* Lista "um profissional por vez" — telas estreitas */}
      <div className="md:hidden mt-8">
        <select
          value={profissionalMobile}
          onChange={(e) => setProfissionalMobile(e.target.value)}
          className="w-full rounded-lg border border-plum-400/30 px-3 py-2 text-sm mb-4"
        >
          {colunas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>

        <div className="rounded-2xl border border-plum-400/20 bg-white overflow-hidden divide-y divide-plum-400/10">
          {horarios.map((slot) => {
            const agendamento =
              profissionalMobile === "placeholder" ? undefined : agendamentoNoSlot(profissionalMobile, slot);
            const ehInicio = agendamento && slotEhInicio(agendamento, slot);
            return (
              <div
                key={slot.horario}
                className="flex items-center gap-3 px-4 py-3 hover:bg-sage-300/10 transition-colors"
                onClick={() => !agendamento && abrirFormulario(profissionalMobile, slot.horario)}
              >
                <span className="text-xs text-ink-900/50 w-12 shrink-0">{slot.horario}</span>
                {agendamento && ehInicio && (
                  <AgendamentoBloco
                    agendamento={{
                      id: agendamento.id,
                      status: agendamento.status,
                      clienteNome: nomeRelacionado(agendamento.clientes),
                      servicoNome: nomeRelacionado(agendamento.servicos),
                    }}
                  />
                )}
                {agendamento && !ehInicio && <span className="text-sm text-ink-900/30">···</span>}
                {!agendamento && <span className="text-sm text-ink-900/30">Livre</span>}
              </div>
            );
          })}
        </div>
      </div>

      {slotSelecionado && (
        <NovoAgendamentoForm
          dataLocal={dataLocal}
          horario={slotSelecionado.horario}
          profissionalId={slotSelecionado.profissionalId}
          profissionais={profissionais}
          clientes={clientes}
          servicos={servicos}
          onFechar={() => setSlotSelecionado(null)}
        />
      )}
    </div>
  );
}
