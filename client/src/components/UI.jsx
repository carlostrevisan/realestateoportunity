// ── Shared UI Primitives — RE Opportunity Engine ──────────────────────
// Single source of truth for all reusable atoms across the application.

import { Label as ShadLabel } from "./ui/label";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

export function Label({ children }) {
  return (
    <ShadLabel className="text-[9px] font-black uppercase tracking-[0.15em] text-plt-muted mb-1.5 block font-sans">
      {children}
    </ShadLabel>
  );
}

export function Val({ children, green, yellow, red, lg }) {
  let color = "text-plt-primary";
  if (green) color = "text-plt-success";
  if (yellow) color = "text-plt-warning";
  if (red) color = "text-plt-danger";
  return (
    <span className={`${color} font-sans font-bold ${lg ? "text-xl font-black tracking-tighter" : "text-xs"}`}>
      {children}
    </span>
  );
}

export function StatusDot({ status }) {
  const map = {
    running:   "bg-plt-accent animate-pulse shadow-[0_0_8px_var(--plt-accent)]",
    completed: "bg-plt-success shadow-[0_0_8px_var(--plt-success)]",
    failed:    "bg-plt-danger shadow-[0_0_8px_var(--plt-danger)]",
    pending:   "bg-plt-warning animate-pulse",
    idle:      "bg-plt-border",
  };
  return (
    <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${map[status] || map.idle}`} />
  );
}

export function Panel({ title, tag, children }) {
  return (
    <div className="bg-white border border-plt-border rounded-xl shadow-sm font-sans">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-plt-border">
        <span className="text-[9px] font-bold uppercase tracking-widest text-plt-muted">{title}</span>
        {tag && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-plt-bg text-plt-muted border border-plt-border">{tag}</span>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// Btn — shadcn Button wrapper with variant mapping + data-variant for testability
const VARIANT_MAP = {
  primary: "default",
  success: "success",
  danger:  "destructive",
  ghost:   "ghost",
  outline: "outline",
};

export function Btn({ children, onClick, disabled, variant = "primary", className = "" }) {
  return (
    <Button
      variant={VARIANT_MAP[variant] ?? "default"}
      disabled={disabled}
      onClick={onClick}
      data-variant={variant}
      className={`w-full font-sans ${className}`}
    >
      {children}
    </Button>
  );
}

// StatusBadge — job history chip using shadcn Badge colors
const STATUS_BORDER = {
  running:   "border-l-plt-accent",
  completed: "border-l-plt-success",
  failed:    "border-l-plt-danger",
  pending:   "border-l-plt-warning",
};

export function StatusBadge({ job, isActive, onClick }) {
  const shortId = job.id.toString().substring(0, 6);
  const leftBorder = STATUS_BORDER[job.status] || "border-l-plt-border";

  return (
    <button
      onClick={onClick}
      data-active={isActive}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all duration-150 active:scale-[0.98] whitespace-nowrap font-sans ${
        isActive
          ? "bg-plt-accent border-2 border-plt-accent text-white shadow-lg shadow-plt-accent/20"
          : `bg-white border-2 border-l-4 ${leftBorder} border-plt-border text-plt-secondary hover:border-plt-accent/50 hover:shadow-sm`
      }`}
    >
      {isActive
        ? <span className="inline-block w-2 h-2 rounded-full flex-shrink-0 bg-white/80" />
        : <StatusDot status={job.status} />
      }
      <div className="flex flex-col items-start leading-tight">
        <span className={`text-[11px] font-semibold ${isActive ? "text-white" : "text-plt-primary"}`}>
          {job.type}
        </span>
        <span className={`text-[9px] ${isActive ? "text-white/60" : "text-plt-muted"}`}>
          #{shortId}
        </span>
      </div>
    </button>
  );
}
