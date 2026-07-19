// Read-only audit: independently recompute each player's season total from the
// per-race P10 Pts + Bonus columns and compare to the sheet's SEASON TOTAL (BV)
// and TOTAL PAYOUT (BW). Flags any mismatch — catches stale/half-refreshed reads
// and formula drift.
const { google } = require('googleapis');
const path = require('path');

const SHEET_ID = '1T__0CvsUq5Asq0-raVzxiXXvadfctATZwS7ANA-GQXo';

function colLetter1(n) { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }
function num(v) { return parseFloat((v || '0').toString().replace(/[^0-9.-]/g, '')) || 0; }

(async () => {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.resolve(__dirname, '../credentials/service-account.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  // How many races does the sheet have? Count race labels in Scores row 2.
  const labelRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID, range: 'Scores!A2:CA2', valueRenderOption: 'FORMATTED_VALUE',
  });
  const labels = (labelRes.data.values || [[]])[0];
  // Race triplets start at col B (index 1), stride 3, until SEASON TOTAL.
  const races = [];
  for (let i = 1; i < labels.length; i += 3) {
    const label = (labels[i] || '').trim();
    if (!label || /SEASON TOTAL/i.test(label) || /TOTAL PAYOUT/i.test(label)) break;
    races.push({ label, ptsCol: i, bonusCol: i + 1, winCol: i + 2 }); // 0-indexed
  }

  // Read the full player block A4:CA25.
  const dataRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID, range: 'Scores!A4:CA25', valueRenderOption: 'FORMATTED_VALUE',
  });
  const rows = dataRes.data.values || [];

  // Locate SEASON TOTAL / TOTAL PAYOUT columns from the label row.
  let btIdx = -1, bpIdx = -1;
  for (let i = 0; i < labels.length; i++) {
    if (/SEASON TOTAL/i.test(labels[i] || '')) btIdx = i;
    if (/TOTAL PAYOUT/i.test(labels[i] || '')) bpIdx = i;
  }

  console.log(`Races counted: ${races.length}  |  SEASON TOTAL col: ${colLetter1(btIdx + 1)}  |  TOTAL PAYOUT col: ${colLetter1(bpIdx + 1)}`);
  console.log('='.repeat(92));

  let mismatches = 0;
  const players = [];
  for (const r of rows) {
    const name = (r[0] || '').trim();
    if (!name) continue;

    // Independent recompute
    let recPts = 0, recWins = 0;
    for (const race of races) {
      recPts += num(r[race.ptsCol]) + num(r[race.bonusCol]);
      if ((r[race.winCol] || '').toString().includes('$10')) recWins += 1;
    }
    const recMoney = recWins * 10;

    const sheetPts = num(r[btIdx]);
    const sheetMoney = num(r[bpIdx]);

    const ptsOk = recPts === sheetPts;
    const moneyOk = recMoney === sheetMoney;
    if (!ptsOk || !moneyOk) {
      mismatches++;
      console.log(`⚠️  ${name.padEnd(20)} pts: sheet=${sheetPts} recompute=${recPts} ${ptsOk ? '' : '<-- MISMATCH'}   money: sheet=$${sheetMoney} recompute=$${recMoney} ${moneyOk ? '' : '<-- MISMATCH'}`);
    }
    players.push({ name, pts: sheetPts, money: sheetMoney, recPts, recMoney });
  }

  if (mismatches === 0) {
    console.log('✅ All player totals reconcile: sheet SEASON TOTAL / TOTAL PAYOUT match independent recompute.');
  } else {
    console.log(`\n❌ ${mismatches} player(s) mismatched — sheet may be mid-recalc or a formula drifted.`);
  }

  // Also flag any per-race cell that is still empty for a race that already has results,
  // which would indicate a partial IMPORTHTML refresh.
  console.log('\nPer-race fill check (blank P10 Pts for a scored race = possible mid-refresh):');
  const resultsRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID, range: 'Results!B2:E30', valueRenderOption: 'FORMATTED_VALUE',
  });
  const resRows = resultsRes.data.values || [];
  // Map race label -> whether Results has a P1 filled (col E, index 3 here since B2 start => B=0,C=1,D=2,E=3)
  const scored = {};
  for (const rr of resRows) {
    const rname = (rr[0] || '').trim();
    const p1 = (rr[3] || '').trim();
    if (rname) scored[rname] = !!p1;
  }
  let blanks = 0;
  for (const race of races) {
    // strip "Rn - " prefix to compare to Results names
    const clean = race.label.replace(/^R\d+\s*-\s*/, '').trim();
    if (!scored[clean]) continue; // race not yet scored, blank is expected
    // check if ALL players blank in this race's pts col (would be suspicious) - just check first player
    const anyFilled = rows.some((r) => (r[0] || '').trim() && (r[race.ptsCol] || '').toString().trim() !== '');
    if (!anyFilled) { blanks++; console.log(`  ⚠️  "${race.label}" is scored in Results but Scores column is entirely blank`); }
  }
  if (blanks === 0) console.log('  ✅ Every scored race has populated Scores columns.');

  // Print the ranked standings the email would use.
  console.log('\nRanked standings (sheet values):');
  players.sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name));
  let rank = 0, prev = null, seen = 0;
  for (const p of players) { seen++; if (p.pts !== prev) { rank = seen; prev = p.pts; } console.log(`  ${String(rank).padStart(2)}. ${p.name.padEnd(20)} ${String(p.pts).padStart(4)}  $${p.money}`); }
})().catch((e) => { console.error('Error:', e.message); process.exit(1); });
