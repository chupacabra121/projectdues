export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="h-8 w-8 rounded-lg bg-indigo-600 text-white grid place-items-center font-bold text-sm">
        C
      </div>
      <span className="text-lg font-semibold tracking-tight">ChapterOS</span>
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
        <Logo className="justify-center mb-8" />
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-sm text-gray-500 mt-1 mb-6">{subtitle}</p>
          {children}
        </div>
      </div>
    </main>
  );
}

export const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500";
export const labelCls = "block text-sm font-medium text-gray-700 mb-1";
export const primaryBtnCls =
  "w-full rounded-lg bg-indigo-600 text-white py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors";
