export async function readJsonFile<T = any>(file: File): Promise<T> {
  const text = await file.text();
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    throw new Error(`"${file.name}" is not valid JSON.`);
  }
}

export interface NamedJson<T = any> {
  /** Display name derived from the source filename / zip entry name, no extension. */
  name: string;
  data: T;
}

function baseName(path: string): string {
  const last = path.split('/').pop() || path;
  return last.replace(/\.json$/i, '');
}

// Accepts a mix of .json files and .zip files (each zip may contain many
// .json files — the "batch of manifests as a zipped folder" case). Returns
// every JSON's parsed content paired with a display name, in a stable order
// (per-file entries first in upload order, then each zip's entries in
// archive order). Mirrors readXmlOrZipFiles below but for JSON input.
export async function readJsonOrZipFiles<T = any>(files: File[]): Promise<NamedJson<T>[]> {
  const { default: JSZip } = await import('jszip');
  const results: NamedJson<T>[] = [];

  for (const file of files) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.zip')) {
      const zip = await JSZip.loadAsync(file);
      const entries = Object.values(zip.files)
        .filter((f) => !f.dir && f.name.toLowerCase().endsWith('.json'))
        .sort((a, b) => a.name.localeCompare(b.name));
      if (entries.length === 0) {
        throw new Error(`"${file.name}" doesn't contain any .json files.`);
      }
      for (const entry of entries) {
        const text = await entry.async('text');
        try {
          results.push({ name: baseName(entry.name), data: JSON.parse(text) as T });
        } catch (e) {
          throw new Error(`"${entry.name}" inside "${file.name}" is not valid JSON.`);
        }
      }
    } else if (lower.endsWith('.json')) {
      const text = await file.text();
      try {
        results.push({ name: baseName(file.name), data: JSON.parse(text) as T });
      } catch (e) {
        throw new Error(`"${file.name}" is not valid JSON.`);
      }
    } else {
      throw new Error(`"${file.name}" is not a .json or .zip file.`);
    }
  }

  return results;
}

export function sanitizeFilename(s: string): string {
  return (s || 'unnamed').replace(/[^a-zA-Z0-9_.-]+/g, '_');
}

// Accepts a mix of .xml files and .zip files (each zip may contain many
// .xml files — the common "BL files as a zipped folder" case). Returns the
// raw XML text of every .xml file found, in a stable order (per-file entries
// first in upload order, then each zip's entries in archive order).
export async function readXmlOrZipFiles(files: File[]): Promise<string[]> {
  const { default: JSZip } = await import('jszip');
  const results: string[] = [];

  for (const file of files) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.zip')) {
      const zip = await JSZip.loadAsync(file);
      const entries = Object.values(zip.files)
        .filter((f) => !f.dir && f.name.toLowerCase().endsWith('.xml'))
        .sort((a, b) => a.name.localeCompare(b.name));
      if (entries.length === 0) {
        throw new Error(`"${file.name}" doesn't contain any .xml files.`);
      }
      for (const entry of entries) {
        results.push(await entry.async('text'));
      }
    } else if (lower.endsWith('.xml')) {
      results.push(await file.text());
    } else {
      throw new Error(`"${file.name}" is not a .xml or .zip file.`);
    }
  }

  return results;
}

export function downloadJson(filename: string, data: unknown) {
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

export interface ZippableFile {
  filename: string;
  data: unknown;
}

// Zips every file (each pretty-printed as JSON) and triggers a browser
// download of the archive. Shared by ResultsPanel's "Download all" button
// and by callers that want conversion results delivered as a zip
// automatically, without an extra click.
export async function downloadFilesAsZip(files: ZippableFile[], zipName: string) {
  const { default: JSZip } = await import('jszip');
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
