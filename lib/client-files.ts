export async function readJsonFile<T = any>(file: File): Promise<T> {
  const text = await file.text();
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    throw new Error(`"${file.name}" is not valid JSON.`);
  }
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
