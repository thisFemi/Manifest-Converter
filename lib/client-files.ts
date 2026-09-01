export async function readJsonFile<T = any>(file: File): Promise<T> {
  const text = await file.text();
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    throw new Error(`"${file.name}" is not valid JSON.`);
  }
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
