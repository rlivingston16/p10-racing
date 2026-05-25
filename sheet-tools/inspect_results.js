// Read-only diagnostic — inspect the live sheet.
// Default: Results tab (URLs, dates, P1/P2/DNFs).
// Pass --scores to read Daniel Bohannon's row from the Scores tab for verification.
const { getSheets, SPREADSHEET_ID: SID } = require('../lib/auth');

const mode = process.argv[2] === '--scores' ? 'scores' : 'results';

(async () => {
  const sheets = getSheets();

  if (mode === 'results') {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SID,
      range: 'Results!A1:AC30',
      valueRenderOption: 'FORMATTED_VALUE',
    });
    const rows = res.data.values || [];
    console.log(`Results tab — ${rows.length} rows`);
    console.log('='.repeat(80));
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.length) {
        console.log(`Row ${i + 1}: (empty)`);
        continue;
      }
      const [a, b, c, d, e, f] = [row[0] ?? '', row[1] ?? '', row[2] ?? '', row[3] ?? '', row[4] ?? '', row[5] ?? ''];
      const aa = row[26] ?? '';
      const ab = row[27] ?? '';
      const dShort = d ? d.slice(0, 60) + (d.length > 60 ? '…' : '') : '';
      console.log(`R${i + 1}  A:${a}  B:${b}  C:${c}  D:${dShort}  E(P1):${e}  F(P2):${f}  AA(1stDNF):${aa}  AB(DNFs):${ab}`);
    }
    return;
  }

  // scores mode — read row 1-3 (headers) + find Daniel Bohannon's row
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SID,
    range: 'Scores!A1:BW30',
    valueRenderOption: 'FORMATTED_VALUE',
  });
  const rows = res.data.values || [];
  if (!rows.length) {
    console.log('Scores tab is empty.');
    return;
  }
  const header2 = rows[1] || [];  // race labels
  const header3 = rows[2] || [];  // P10 Pts / Bonus / Win$
  console.log('Scores tab — Daniel Bohannon row');
  console.log('='.repeat(80));
  let danielRow = null;
  for (let i = 3; i < rows.length; i++) {
    if ((rows[i][0] || '').trim() === 'Daniel Bohannon') {
      danielRow = rows[i];
      break;
    }
  }
  if (!danielRow) {
    console.log('Daniel not found.');
    return;
  }
  // Walk in chunks of 3 cols starting at col B (index 1)
  let raceIdx = 0;
  for (let c = 1; c + 2 < danielRow.length; c += 3) {
    const raceLabel = (header2[c] || '').trim();
    if (!raceLabel || raceLabel.startsWith('Season') || raceLabel.startsWith('Total')) break;
    const p10 = danielRow[c] ?? '';
    const bonus = danielRow[c + 1] ?? '';
    const win = danielRow[c + 2] ?? '';
    console.log(`  ${raceLabel.padEnd(28)}  P10:${String(p10).padStart(4)}  Bonus:${String(bonus).padStart(4)}  Win$:${String(win).padStart(6)}`);
    raceIdx++;
    if (raceIdx >= 24) break;
  }
})().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
