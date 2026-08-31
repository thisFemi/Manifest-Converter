'use client';

export default function Stamp({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-2">
      <div className="stamp px-5 py-2 font-display font-semibold tracking-wide text-sm uppercase">
        {label}
      </div>
    </div>
  );
}
