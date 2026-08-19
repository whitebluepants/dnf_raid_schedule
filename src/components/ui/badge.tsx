import type { HTMLAttributes } from "react";

export function Badge({ className = "", ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={`inline-flex items-center rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700 ${className}`} {...props} />;
}
