// CSV untuk Excel: BOM UTF-8, CRLF, dan pencegahan formula injection.
const cell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const csvResponse = (filename, head, rows) => new Response('﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n'), {
  headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${filename}"` },
});
