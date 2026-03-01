// ── Shared UI Primitives — RE Opportunity Engine ──────────────────────
// Single source of truth for all reusable atoms across the application.

export function Label({ children }) {
  return (
    <span className="text-[9px] font-black uppercase tracking-[0.15em] text-plt-muted mb-1.5 block font-sans">
      {children}
    </span>
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

// Panel — glassmorphism card with tactical header
export function Panel({ title, tag, children, className = "" }) {
  return (
    <div className={`bg-plt-panel border border-plt-border flex flex-col relative overflow-hidden rounded-xl shadow-sm ${className}`}>
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-plt-border bg-slate-50/80 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-1.5 bg-plt-accent rounded-full" />
          <span className="text-[11px] font-black uppercase tracking-widest text-plt-primary font-sans">{title}</span>
        </div>
        {tag && (
          <span className="text-[9px] font-bold text-plt-muted bg-white border border-plt-border px-2 py-0.5 rounded tracking-widest font-sans">
            {tag}
          </span>
        )}
      </div>
      <div className="p-5 flex-1 overflow-y-auto custom-scrollbar font-sans">{children}</div>
    </div>
  );
}

// Btn — standard action button with tactile feedback
export function Btn({ children, onClick, disabled, variant = "primary", className = "" }) {
  const variants = {
    primary: "bg-plt-accent text-white hover:bg-plt-accent-hover shadow-sm",
    success: "bg-plt-success text-white hover:bg-plt-success-hover shadow-sm",
    danger:  "bg-plt-danger text-white hover:bg-plt-danger-hover shadow-sm",
    ghost:   "bg-transparent border border-plt-border text-plt-secondary hover:bg-plt-hover hover:text-plt-primary",
    outline: "bg-transparent border border-plt-accent text-plt-accent hover:bg-plt-accent/5",
  };

  return (
    <button
      className={`w-full text-sm font-semibold py-2.5 px-4 transition-all duration-150 rounded-lg active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100 ${variants[variant]} ${className} font-sans`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

// StatusBadge — professional job history chip for the Execution History bar
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
      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border-2 border-l-4 transition-all duration-150 active:scale-[0.98] whitespace-nowrap font-sans ${
        isActive
          ? "bg-plt-accent border-plt-accent text-white shadow-lg shadow-plt-accent/20"
          : `bg-white ${leftBorder} border-plt-border text-plt-secondary hover:border-plt-accent/50 hover:shadow-sm`
      }`}
    >
      <StatusDot status={job.status} />
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
