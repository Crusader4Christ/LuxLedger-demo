import type { Json } from './api';
/** RFC 4180-style fields, CRLF/LF, BOM and escaped double quotes. */
export function parseStatementCsv(input: string): Record<string, Json>[] {
  const text = input.replace(/^\uFEFF/, '');
  if (text.length > 1_000_000) throw new Error('CSV must be smaller than 1 MB');
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else field += c;
    } else if (c === '"' && !field && !closed) quoted = true;
    else if (c === ',') { row.push(field); field = ''; closed = false; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); if (row.some(v => v.trim())) rows.push(row);
      row = []; field = ''; closed = false;
    } else {
      if (closed || c === '"') throw new Error('Malformed CSV quoting');
      field += c;
    }
  }
  if (quoted) throw new Error('Unterminated CSV quoted field');
  row.push(field); if (row.some(v => v.trim())) rows.push(row);
  const headers = rows.shift()?.map(v => v.trim()) ?? [];
  const required = ['id', 'amount_minor', 'currency', 'reference', 'date'];
  if (required.some(h => !headers.includes(h)) || new Set(headers).size !== headers.length) throw new Error(`CSV requires unique headers: ${required.join(', ')}`);
  if (!rows.length || rows.length > 1000) throw new Error('Import between 1 and 1000 records per file');
  return rows.map((values, i) => {
    if (values.length !== headers.length) throw new Error(`CSV row ${i + 2} has a different column count`);
    const record = Object.fromEntries(headers.map((h, j) => [h, values[j]]));
    if (!/^[1-9][0-9]*$/.test(record.amount_minor)) throw new Error(`CSV row ${i + 2}: amount_minor must be a positive integer string`);
    if (!record.id.trim() || !record.reference.trim() || !record.currency.trim() || !Number.isFinite(Date.parse(record.date))) throw new Error(`CSV row ${i + 2}: missing identifier, currency, reference or valid date`);
    return { id: record.id, amount_minor: record.amount_minor, currency: record.currency, reference: record.reference,
      date: new Date(record.date).toISOString(), ...(record.description ? { description: record.description } : {}), raw: { source_line: i + 2 } };
  });
}
