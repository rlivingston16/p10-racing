// Read-only diagnostic — dump Scores tab formulas + headers so we can plan the
// sprint-race insert without breaking cross-tab references.
// Outputs: race-label headers + the actual formulas for the first player row.
const { getSheets, SPREADSHEET_ID: SID } = require('../lib/auth');

function colLetter(idx) {
  // 0-indexed → A,B,...Z,AA,AB,...
  let s = '';
  let n = idx;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

(async () => {
  const sheets = getSheets();
  // Pull row 2 (race name), row 3 (sub-header), row 4 (first player FORMULAS).
  const fmt = await sheets.spreadsheets.values.get({
    spreadsheetId: SID,
    range: 'Scores!A2:CA4',
    valueRenderOption: 'FORMATTED_VALUE',
  });
  const formulas = await sheets.spreadsheets.values.get({
    spreadsheetId: SID,
    range: 'Scores!A4:CA4',
    valueRenderOption: 'FORMULA',
  });
  const labels = fmt.data.values || [];
  const fRow = (formulas.data.values || [])[0] || [];
  const r2 = labels[0] || [];
  const r3 = labels[1] || [];
  const playerRow = labels[2] || [];

  console.log('Scores tab — formula audit for first player row');
  console.log('='.repeat(100));
  for (let i = 0; i < Math.max(r2.length, r3.length, fRow.length); i++) {
    const col = colLetter(i);
    const race = (r2[i] || '').trim();
    const sub = (r3[i] || '').trim();
    const value = playerRow[i];
    const formula = fRow[i];
    if (!race && !sub && !formula && !value) continue;
    const fShort = formula ? (String(formula).length > 90 ? String(formula).slice(0, 87) + '...' : formula) : '';
    console.log(`${col.padEnd(3)} | race=${race.padEnd(22)} | sub=${sub.padEnd(12)} | value=${String(value || '').padEnd(6)} | formula=${fShort}`);
  }
})().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
