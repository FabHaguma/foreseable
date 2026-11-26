const columns = [
  ['code', 'Code'], ['name', 'Name'], ['phone', 'Number'], ['calledOn', 'Called on'],
  ['reached', 'Reached'], ['reason', 'Why they had not started'], ['result', 'Result'],
  ['promisedFor', 'Promised for'], ['notes', 'Notes'], ['openedSeen', 'Opened Seen (Seen fills)']
];

export function exportCsv(contacts) {
  const cell = value => {
    let text = String(value ?? '');
    // Spreadsheet applications can execute formula-like cells, including +phone numbers.
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return '\ufeff' + [columns.map(([, label]) => cell(label)).join(','), ...contacts.map(contact => columns.map(([key]) => cell(contact[key])).join(','))].join('\r\n') + '\r\n';
}
