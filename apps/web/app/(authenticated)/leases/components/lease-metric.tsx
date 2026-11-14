export function LeaseMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-white/10 p-3">
      <div className="text-2xl font-bold text-white">{value}</div>
      {label}
    </div>
  );
}
