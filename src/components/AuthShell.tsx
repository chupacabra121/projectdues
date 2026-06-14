export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <span className="font-display text-3xl tracking-tight text-foreground">
        Simple<span className="text-primary">Dues</span>
      </span>
    </div>
  );
}

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex-1 grid place-items-center px-4 py-12">
      <div className="w-full max-w-md">
        <Logo className="mb-8" />
        <div className="glass rounded-3xl shadow-sm p-8">
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1 mb-6">{subtitle}</p>
          {children}
        </div>
      </div>
    </main>
  );
}

export const inputCls =
  "w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring";
export const labelCls = "block text-sm font-medium text-foreground/80 mb-1";
export const primaryBtnCls =
  "w-full rounded-full bg-primary text-primary-foreground py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity";
