export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge status-${status}`}>{status.replace(/_/g, " ")}</span>;
}
