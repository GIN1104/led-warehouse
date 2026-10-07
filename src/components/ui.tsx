import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function buttonClass(variant: "primary" | "ghost" | "danger" = "primary", className?: string) {
  return cn(
    "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
    variant === "primary" && "bg-copper text-white hover:bg-copper-dark",
    variant === "ghost" && "border border-line bg-sand text-ink hover:border-copper/40",
    variant === "danger" && "border border-alert/30 bg-white text-alert hover:bg-rose-50",
    className,
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? <p className="mb-1 text-xs font-medium tracking-[0.16em] text-copper uppercase">{eyebrow}</p> : null}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm leading-6 text-ink/70">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Flash({ error, ok }: { error?: string; ok?: string }) {
  if (error) {
    return <p className="mb-4 rounded-md border border-alert/30 bg-rose-50 px-3 py-2 text-sm text-alert">{error}</p>;
  }
  if (ok) {
    return <p className="mb-4 rounded-md border border-moss/30 bg-lime-50 px-3 py-2 text-sm text-moss">{ok}</p>;
  }
  return null;
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-lg border border-line bg-sand p-4 shadow-sm", className)}>{children}</section>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-ink/80">{label}</span>
      {children}
    </label>
  );
}

export const controlClass =
  "h-10 rounded-md border border-line bg-white px-3 text-sm text-ink outline-none ring-copper/30 placeholder:text-ink/40 focus:ring-2";

export function Badge({
  tone,
  children,
}: {
  tone: "neutral" | "ok" | "warn" | "alert";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "neutral" && "bg-ink/5 text-ink/80",
        tone === "ok" && "bg-lime-100 text-moss",
        tone === "warn" && "bg-amber-100 text-amber-900",
        tone === "alert" && "bg-rose-100 text-alert",
      )}
    >
      {children}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-ink/60">{children}</p>;
}
