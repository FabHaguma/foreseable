export function parseCsv(text) {
  text = text.replace(/^\ufeff/, '');
  const rows = []; let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else if (quoted || !value) quoted = !quoted;
      else value += char;
    } else if (char === ',' && !quoted) { row.push(value); value = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(value); rows.push(row); row = []; value = '';
    } else value += char;
  }
  if (quoted) throw new Error('The CSV has an unclosed quote. Please export it again.');
  if (value || row.length) { row.push(value); rows.push(row); }
  return rows;
}
