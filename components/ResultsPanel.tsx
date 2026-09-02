'use client';

import { useState } from 'react';
import JSZip from 'jszip';

export interface OutputFile {
  filename: string;
  data: unknown;
}

function downloadFile(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function downloadAllAsZip(files: OutputFile[], zipName: string) {
  const zip = new JSZip();
  files.forEach((f) => zip.file(f.filename, JSON.stringify(f.data, null, 2)));
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ResultsPanel({ files, zipName }: { files: OutputFile[]; zipName: string }) {
  const [expanded, setExpanded] = useState<number | null>(0);

  if (files.length === 0) return null;

  return (
    <div className="space-y-3">
      {files.length > 1 && (
        <button
          onClick={() => downloadAllAsZip(files, zipName)}
          className="w-full rounded-sm bg-brass-deep text-paper py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Download all ({files.length} files, .zip)
        </button>
      )}

      {files.map((f, i) => {
        const preview = JSON.stringify(f.data, null, 2);
        const isOpen = expanded === i;
        return (
          <div key={f.filename} className="rounded-sm border border-paper-line overflow-hidden">
            <div className="flex items-center justify-between bg-paper px-3 py-2">
              <button
                onClick={() => setExpanded(isOpen ? null : i)}
                className="data-field text-sm text-ink-soft flex items-center gap-2 hover:text-ink"
              >
                <span className="text-brass-deep">{isOpen ? '▾' : '▸'}</span>
                {f.filename}
              </button>
              <button
                onClick={() => downloadFile(f.filename, f.data)}
                className="text-xs font-medium text-brass-deep underline underline-offset-2 shrink-0"
              >
                Download
              </button>
            </div>
            {isOpen && (
              <pre className="data-field text-xs leading-relaxed bg-white px-3 py-3 overflow-auto max-h-80 border-t border-paper-line">
                {preview.length > 20000 ? preview.slice(0, 20000) + '\n\n… truncated in preview, full content is in the download' : preview}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}
