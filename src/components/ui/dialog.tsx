import type { ReactNode } from "react";

export function Dialog({ open, title, children }: { open: boolean; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">{children}</div>
    </div>
  );
}
