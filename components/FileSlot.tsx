'use client';

import { useRef, useState, DragEvent } from 'react';

interface FileSlotProps {
  label: string;
  hint: string;
  accept?: string;
  multiple?: boolean;
  files: File[];
  onChange: (files: File[]) => void;
}

export default function FileSlot({ label, hint, accept = '.json', multiple = false, files, onChange }: FileSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFiles(list: FileList | null) {
    if (!list) return;
    const arr = Array.from(list);
    onChange(multiple ? [...files, ...arr] : arr.slice(0, 1));
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  function removeFile(idx: number) {
    onChange(files.filter((_, i) => i !== idx));
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-sm font-medium text-ink-soft">{label}</label>
        <span className="text-xs text-slate">{hint}</span>
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-sm border-2 border-dashed px-4 py-5 text-center transition-colors ${
          dragOver ? 'border-brass bg-brass/5' : 'border-paper-line hover:border-brass/60'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <p className="text-sm text-slate">
          Drop {multiple ? 'files' : 'a file'} here, or{' '}
          <span className="text-brass-deep underline underline-offset-2">browse</span>
        </p>
      </div>
      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="data-field flex items-center justify-between rounded-sm bg-paper px-2.5 py-1.5 text-xs border border-paper-line"
            >
              <span className="truncate">{f.name}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(i);
                }}
                className="ml-2 text-slate hover:text-warn shrink-0"
                aria-label={`Remove ${f.name}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
