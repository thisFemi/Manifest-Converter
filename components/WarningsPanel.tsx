'use client';

export default function WarningsPanel({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="rounded-sm border border-warn/30 bg-warn/[0.04] px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-warn mb-1.5">
        Inspection notes — best-effort field mappings
      </p>
      <ul className="space-y-1">
        {warnings.map((w, i) => (
          <li key={i} className="text-xs text-ink-soft leading-relaxed">
            <span className="text-warn mr-1">•</span>
            {w}
          </li>
        ))}
      </ul>
    </div>
  );
}
