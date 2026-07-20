const STYLES: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-800 ring-amber-600/20",
  CONFIRMED: "bg-sky-50 text-sky-800 ring-sky-600/20",
  PACKED: "bg-cyan-50 text-cyan-800 ring-cyan-600/20",
  SHIPPED: "bg-blue-50 text-blue-800 ring-blue-600/20",
  DELIVERED: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  CANCELLED: "bg-slate-100 text-slate-600 ring-slate-500/20",
  RETURNED: "bg-rose-50 text-rose-800 ring-rose-600/20",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      data-testid="status-badge"
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[status] ?? STYLES.CANCELLED}`}
    >
      {status}
    </span>
  );
}
