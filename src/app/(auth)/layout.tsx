export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ivory-50 flex flex-col items-center justify-center p-6">
      <div className="mb-8 text-center">
        <span className="font-display text-3xl text-plum-950 tracking-tight">Alva</span>
        <p className="text-xs text-plum-400 mt-1">gestão de estúdio</p>
      </div>
      {children}
    </div>
  );
}
