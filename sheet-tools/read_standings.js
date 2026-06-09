// One-off: dump season standings (sorted by total points desc) from the Scores tab.
// Used by the AI assistant when drafting race-weekend emails.
const { getSheets, SPREADSHEET_ID: SID } = require('../lib/auth');

(async () => {
  const sheets = getSheets();
  // Read everything horizontally — names in col A, season totals are at BV/BW per memory.
  // BV = season Pts (col index 73), BW = season Money won (col index 74). Read wider to be safe.
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SID,
    range: 'Scores!A1:CA30',
    valueRenderOption: 'FORMATTED_VALUE',
  });
  const rows = res.data.values || [];
  if (rows.length < 4) {
    console.log('Scores tab has no player rows.');
    return;
  }
  // Headers: row 2 holds race labels + "Season Total" / "Season $", row 3 holds sub-headers.
  // Find the season-total columns by scanning row 2 + row 3.
  const header2 = rows[1] || [];
  const header3 = rows[2] || [];
  let ptsCol = -1, moneyCol = -1;
  for (let i = 0; i < header2.length; i++) {
    const h2 = (header2[i] || '').toLowerCase();
    const h3 = (header3[i] || '').toLowerCase();
    if (h2.includes('season') || h3.includes('total') || h3.includes('season pts') || h3.includes('season points')) {
      // candidate — pick the first numeric-looking total col
      if (ptsCol === -1 && (h3.includes('pt') || h3.includes('total') || h2.includes('total'))) ptsCol = i;
      else if (moneyCol === -1 && (h3.includes('$') || h3.includes('money') || h3.includes('win'))) moneyCol = i;
    }
  }
  // Memory said BV/BW, but the sheet actually has SEASON TOTAL/Points at BP (67)
  // and TOTAL PAYOUT/$ at BQ (68). Pin money to ptsCol+1 if auto-detect missed.
  if (ptsCol === -1) ptsCol = 67;
  if (moneyCol === -1 || moneyCol === 74) moneyCol = ptsCol + 1;

  console.log(`Using ptsCol=${ptsCol} (${String.fromCharCode(65 + Math.floor(ptsCol / 26) - 1 || 0) + String.fromCharCode(65 + (ptsCol % 26))}) and moneyCol=${moneyCol}`);
  console.log('header2 at those cols:', header2[ptsCol], '|', header2[moneyCol]);
  console.log('header3 at those cols:', header3[ptsCol], '|', header3[moneyCol]);
  console.log('='.repeat(80));

  const players = [];
  for (let i = 3; i < rows.length; i++) {
    const r = rows[i] || [];
    const name = (r[0] || '').trim();
    if (!name) continue;
    const pts = parseFloat((r[ptsCol] || '0').toString().replace(/[^0-9.-]/g, '')) || 0;
    const money = (r[moneyCol] || '').toString().trim() || '$0';
    players.push({ name, pts, money });
  }
  // Sort by pts desc, then name
  players.sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name));
  // Assign competition ranks (ties share rank, next rank skips)
  let rank = 0, prevPts = null, seen = 0;
  for (const p of players) {
    seen++;
    if (p.pts !== prevPts) { rank = seen; prevPts = p.pts; }
    p.rank = rank;
  }
  console.log('STANDINGS (after most recent run):');
  for (const p of players) {
    console.log(`  ${String(p.rank).padStart(2)}.  ${p.name.padEnd(22)}  ${String(p.pts).padStart(4)}  ${String(p.money).padStart(6)}`);
  }
})().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
