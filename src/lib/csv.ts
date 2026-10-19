const FORMULA_PREFIX = /^[=+\-@\t\r]/;
const INVISIBLE = /[\u0000\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;
const PHONE = /^\+\d[\d\s().-]{6,}$/;

export function neutralizeCsvCell(value: string): string {
  const cleaned = value.replace(INVISIBLE, "");
  const visible = cleaned.trimStart();
  if (PHONE.test(visible)) return visible;
  if (FORMULA_PREFIX.test(visible)) return `'${visible}`;
  return cleaned;
}

function csvEscape(value: string): string {
  const safe = neutralizeCsvCell(value);
  if (/[",\r\n]/.test(safe)) return `"${safe.replaceAll('"', '""')}"`;
  return safe;
}

export function serializeCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
}

export function parseCsv(input: string): { headers: string[]; rows: string[][] } {
  const text = input.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      records.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    records.push(row);
  }

  const headers = (records.shift() ?? []).map((header) => header.trim());
  const rows = records.filter((record) => record.some((value) => value.trim() !== ""));
  return { headers, rows };
}

export function suggestMapping(headers: string[], aliases: Record<string, string[]>): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  for (const header of headers) {
    const key = header.toLowerCase().replace(/[^a-z0-9]/g, "");
    const field = Object.entries(aliases).find(
      ([name, names]) => !used.has(name) && (names.includes(key) || name.toLowerCase() === key),
    )?.[0];
    mapping[header] = field ?? "";
    if (field) used.add(field);
  }
  return mapping;
}
