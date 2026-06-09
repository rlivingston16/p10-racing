// Verify the post-migration state of a sheet.
// Pass --sheet=<id> to target a specific sheet.
const { google } = require('googleapis');
const path = require('path');

const arg = process.argv.find((a) => a.startsWith('--sheet='));
const SHEET_ID = arg ? arg.split('=')[1] : '1T__0CvsUq5Asq0-raVzxiXXvadfctATZwS7ANA-GQXo';

async function client() {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.resolve(__dirname, '../credentials/service-account.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

(async () => {
  const sheets = await client();
  console.log(`Verifying sheet ${SHEET_ID}`);
  console.log('='.repeat(80));

  // 1. Results — 24 races in chronological order
  const results = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Results!A1:D30',
    valueRenderOption: 'FORMATTED_VALUE',
  });
  console.log('\n📋 Results tab:');
  (results.data.values || []).forEach((r, i) => {
    const [a, b, c, d] = [r[0] || '', r[1] || '', r[2] || '', r[3] || ''];
    const dShort = d ? d.slice(0, 50) + (d.length > 50 ? '…' : '') : '';
    if (a || b) console.log(`  R${i + 1}  A:${String(a).padStart(3)}  B:${String(b).padEnd(26)} C:${String(c).padEnd(8)} D:${dShort}`);
  });

  // 2. Scores tab race labels (row 2) — should be R1..R24 with correct names
  const labels = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Scores!A2:CA2',
    valueRenderOption: 'FORMATTED_VALUE',
  });
  console.log('\n🏁 Scores tab race labels (row 2):');
  const labelRow = (labels.data.values || [])[0] || [];
  labelRow.forEach((v, i) => {
    if (v && (v.startsWith('R') || v === 'SEASON TOTAL' || v === 'TOTAL PAYOUT' || v === 'Driver')) {
      const col = String.fromCharCode(65 + Math.floor(i / 26) - 1 || 0) + (i < 26 ? '' : String.fromCharCode(65 + (i % 26)));
      const colLetter = (() => {
        let s = '';
        let x = i + 1;
        while (x > 0) { const r = (x - 1) % 26; s = String.fromCharCode(65 + r) + s; x = Math.floor((x - 1) / 26); }
        return s;
      })();
      console.log(`  ${colLetter.padEnd(3)} ${v}`);
    }
  });

  // 3. SEASON TOTAL and TOTAL PAYOUT formulas (first player row)
  const totals = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Scores!BV4:BW4',
    valueRenderOption: 'FORMULA',
  });
  console.log('\n📊 Season-total formulas (row 4):');
  const tr = (totals.data.values || [])[0] || [];
  console.log(`  BV4 (SEASON TOTAL): ${tr[0] || '(empty)'}`);
  console.log(`  BW4 (TOTAL PAYOUT): ${tr[1] || '(empty)'}`);

  // 4. Standings: read all 22 player rows for SEASON TOTAL / TOTAL PAYOUT
  const standings = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Scores!A4:BW25',
    valueRenderOption: 'FORMATTED_VALUE',
  });
  console.log('\n🏆 Computed standings (should match live sheet since no new sprint data yet):');
  const stRows = standings.data.values || [];
  const players = stRows.map((r) => ({
    name: r[0] || '',
    pts: parseFloat((r[73] || '0').toString().replace(/[^0-9.-]/g, '')) || 0, // BV = col 74 1-indexed = idx 73
    money: (r[74] || '').toString().trim() || '$0', // BW = col 75 1-indexed = idx 74
  })).filter((p) => p.name);
  players.sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name));
  players.forEach((p, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. ${p.name.padEnd(22)} ${String(p.pts).padStart(4)} ${p.money.padStart(6)}`);
  });

  // 5. Picks tab — verify a sample block (the new Great Britain Sprint block at rows 203-227)
  const picksGB = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Picks!A203:D227',
    valueRenderOption: 'FORMATTED_VALUE',
  });
  console.log('\n🎯 Picks block sample — Great Britain (Sprint) rows 203-227:');
  const pRows = picksGB.data.values || [];
  pRows.forEach((r, i) => {
    const row = 203 + i;
    if (r[0] || r[1] || r[2] || r[3]) console.log(`  Row ${row}: A:${(r[0] || '').padEnd(20)} B:${(r[1] || '').padEnd(20)} C:${(r[2] || '').padEnd(20)} D:${r[3] || ''}`);
    else console.log(`  Row ${row}: (empty)`);
  });
})().catch((e) => { console.error('Error:', e.message); process.exit(1); });
