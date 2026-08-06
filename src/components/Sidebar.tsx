import Link from "next/link";

const links = [
  { href: "/", label: "Painel" },
  { href: "/agenda", label: "Agenda" },
  { href: "/caixa", label: "Caixa" },
  { href: "/clientes", label: "Clientes" },
  { href: "/servicos", label: "Serviços" },
  { href: "/produtos", label: "Produtos" },
  { href: "/relatorios", label: "Relatórios" },
];

export default function Sidebar() {
  return (
    <aside className="w-60 shrink-0 bg-plum-950 text-ivory-50 min-h-screen flex flex-col">
      <div className="px-6 py-8">
        <span className="font-display text-2xl tracking-tight">Alva</span>
        <p className="text-xs text-plum-400 mt-1">gestão de estúdio</p>
      </div>
      <nav className="flex-1 px-3 space-y-1">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="block rounded-lg px-3 py-2 text-sm text-ivory-100/90 hover:bg-plum-800 hover:text-white transition-colors"
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="px-6 py-6 text-xs text-plum-400">v0.1 · MVP</div>
    </aside>
  );
}
