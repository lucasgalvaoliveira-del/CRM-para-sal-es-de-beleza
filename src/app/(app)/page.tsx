export default function PainelPage() {
  return (
    <div>
      <h1 className="font-display text-3xl text-plum-950">Painel</h1>
      <p className="text-ink-900/70 mt-2 max-w-prose">
        Bem-vindo(a) ao Alva. Este é o esqueleto inicial do sistema — os
        indicadores de faturamento, ocupação da agenda e comissões vão
        aparecer aqui conforme os módulos de Caixa e Agenda forem alimentados
        com dados reais.
      </p>
      <div className="grid grid-cols-3 gap-4 mt-8">
        {[
          { label: "Faturamento hoje", value: "R$ 0,00" },
          { label: "Agendamentos hoje", value: "0" },
          { label: "Clientes cadastrados", value: "0" },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-plum-400/20 bg-white p-5">
            <p className="text-xs uppercase tracking-wide text-ink-900/50">{card.label}</p>
            <p className="font-display text-2xl text-plum-800 mt-2">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
