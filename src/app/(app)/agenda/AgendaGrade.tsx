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

  // Encontra o agendamento que sobrepõe este slot pra este profissional —
  // cobre tanto o slot em que o agendamento começa quanto qualquer slot
  // seguinte que ele ainda ocupa (ex: serviço de 60min cobre 2 slots de
  // 30min). Compara [inicio,fim) reais de ambos os lados, nunca horário
  // local formatado.
  //
  // Prefere um agendamento ativo (bloqueia o slot); um cancelado/faltou
  // só aparece se não houver nenhum ativo sobrepondo o mesmo slot —
  // assim o slot libera pra novo agendamento, mas o cancelado ainda
  // pode ser visto/reaberto se for o único ocupando aquele horário.
  function agendamentoNoSlot(profissionalId: string, slot: Slot) {
    const candidatos = agendamentos.filter(
      (a) => a.profissional_id === profissionalId && sobrepoe(a.inicio, a.fim, slot.inicio, slot.fim)
    );
    return (
      candidatos.find((a) => a.status !== "cancelado" && a.status !== "faltou") ??
      candidatos[0]
    );
  }

  // Um slot está de fato ocupado (bloqueia a criação de um novo
  // agendamento) só quando o agendamento retornado por agendamentoNoSlot é
  // ativo. Como agendamentoNoSlot sempre prefere devolver um ativo quando
  // existe um sobrepondo o slot, checar o status do próprio retorno basta —
  // não precisa de uma segunda busca: se o retornado ainda é
  // cancelado/faltou, é porque nenhum ativo sobrepõe este slot.
  function slotOcupado(agendamento: AgendamentoRow | undefined) {
    return !!agendamento && agendamento.status !== "cancelado" && agendamento.status !== "faltou";
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
  //
  // Nota à parte: antes de agendamentoNoSlot preferir um ativo (ver acima),
  // um cancelado/faltou com `inicio` mais cedo podia "sombrear" um ativo
  // sobrepondo o mesmo slot — o `.find()` sem preferência de status podia
  // devolver o cancelado em todo slot que ambos sobrepusessem, inclusive no
  // slot de início do ativo, deixando o ativo sem nenhum slot onde
  // slotEhInicio() fosse satisfeita pra ele. Isso não dependia do horário
  // comercial fixo, então já era alcançável dentro do expediente normal.
  // Com a preferência por ativo, esse caminho está fechado: o ativo é
  // sempre devolvido quando sobrepõe o slot, então sempre tem seu slot de
  // início corretamente identificado. A limitação documentada acima (limite
  // do expediente) é a única que permanece.
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
                    onClick={() => !slotOcupado(agendamento) && abrirFormulario(p.id, slot.horario)}
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
                onClick={() => !slotOcupado(agendamento) && abrirFormulario(profissionalMobile, slot.horario)}
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
