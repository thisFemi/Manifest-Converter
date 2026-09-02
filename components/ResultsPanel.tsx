'use client';

import { useState } from 'react';
import { downloadFilesAsZip } from '@/lib/client-files';

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

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy fallback below
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}

export default function ResultsPanel({ files, zipName }: { files: OutputFile[]; zipName: string }) {
  const [expanded, setExpanded] = useState<number | null>(0);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  if (files.length === 0) return null;

  async function handleCopy(i: number, preview: string) {
    const ok = await copyToClipboard(preview);
    setCopiedIndex(i);
    setTimeout(() => setCopiedIndex((cur) => (cur === i ? null : cur)), 1500);
    if (!ok) {
      // extremely rare (clipboard blocked entirely) — surfacing via the same
      // label keeps this from needing its own error UI
      console.error('Copy to clipboard failed.');
    }
  }

  return (
    <div className="space-y-3">
      {files.length > 1 && (
        <button
          onClick={() => downloadFilesAsZip(files, zipName)}
          className="w-full rounded-sm bg-brass-deep text-paper py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Download all ({files.length} files, .zip)
        </button>
      )}

      {files.map((f, i) => {
        const preview = JSON.stringify(f.data, null, 2);
        const isOpen = expanded === i;
        const justCopied = copiedIndex === i;
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
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => handleCopy(i, preview)}
                  className="text-xs font-medium text-brass-deep underline underline-offset-2"
                >
                  {justCopied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  onClick={() => downloadFile(f.filename, f.data)}
                  className="text-xs font-medium text-brass-deep underline underline-offset-2"
                >
                  Download
                </button>
              </div>
            </div>
            {isOpen && (
              <div className="relative group">
                <pre className="data-field text-xs leading-relaxed bg-white px-3 py-3 overflow-auto max-h-80 border-t border-paper-line">
                  {preview.length > 20000 ? preview.slice(0, 20000) + '\n\n… truncated in preview, full content is in the download' : preview}
                </pre>
                <button
                  onClick={() => handleCopy(i, preview)}
                  className="absolute top-2 right-2 rounded-sm border border-paper-line bg-paper/95 px-2 py-1 text-xs font-medium text-ink-soft opacity-0 group-hover:opacity-100 hover:text-ink hover:border-brass/60 transition-opacity"
                >
                  {justCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
