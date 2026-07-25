/**
 * Fix phantom scoring: a race must not contribute ANY points until it has run.
 *
 * The bug: the Bonus formula compared a player's pick directly against the
 * Results helper cells, e.g. IF(Picks!D278=Results!AA13,5,0). For a race that
 * hasn't run, Results!AA13 (first DNF) is blank — so a player who left their
 * DNF pick blank matched blank=blank and was awarded 5 points for a race that
 * never happened. Same hole on the P2 comparison (blank pick = blank result).
 * Symptoms seen live: Brian Wiffin +5 for un-run Hungary; Ted +5 for un-run
 * Belgium (grid data), Daniel +12/+10 for un-run Monaco/Spain back in May.
 *
 * The fix: gate both the P10 and Bonus formulas on the race having a result at
 * all — Results!E{row} (the P1 finisher) being non-blank. If the race hasn't
 * run, the cell renders "" and contributes nothing. This is robust whether the
 * blankness comes from a missing URL, a pre-race page (grid only), or an
 * IMPORTHTML that hasn't resolved.
 *
 * Idempotent: re-running detects the guard is already present and skips.
 *
 * Usage:
 *   node sheet-tools/fix_phantom_scoring.js --sheet=<id>   (test on a copy)
 *   node sheet-tools/fix_phantom_scoring.js --dry          (show, don't write)
 *   node sheet-tools/fix_phantom_scoring.js                (apply to live sheet)
 */

const path = require('path');
const { google } = require('googleapis');

const LIVE_SHEET_ID = '1T__0CvsUq5Asq0-raVzxiXXvadfctATZwS7ANA-GQXo';
const arg = process.argv.find(a => a.startsWith('--sheet='));
const SHEET_ID = arg ? arg.split('=')[1] : LIVE_SHEET_ID;
const DRY = process.argv.includes('--dry');

const FIRST_PLAYER_ROW = 4;
const LAST_PLAYER_ROW = 25;
const PICKS_BLOCK = 25;
const PICKS_FIRST_ROW = 3;

const PAYOFF = '{1,2,4,6,8,10,12,15,18,25,18,15,12,10,8,6,4,2,1,1}';

function colLetter1(n) { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }

/** P10 points, gated on the race having a result (Results!E{rr} non-blank). */
function p10Formula(pickRow, rr) {
  const P = `Picks!B${pickRow}`;
  return `=IF(Results!E${rr}="","",IFERROR(IF(${P}="","",`
    + `IF(IFERROR(MATCH(${P},SPLIT(Results!AB${rr},", ",FALSE),0),0)>0,0,`
    + `IF(IFERROR(MATCH(${P},SPLIT(Results!AC${rr},", ",FALSE),0),0)>0,0,`
    + `IFERROR(INDEX(${PAYOFF},MATCH(${P},Results!E${rr}:Z${rr},0)),0)))),""))`;
}

/** Bonus, gated on the race having a result AND on each pick being non-blank
 *  before it is compared (so blank pick can never match a blank result). */
function bonusFormula(pickRow, rr) {
  const p2 = `Picks!C${pickRow}`;
  const dnf = `Picks!D${pickRow}`;
  const p10 = `Picks!B${pickRow}`;
  return `=IF(Results!E${rr}="","",`
    + `IF(AND(${p10}="",${p2}="",${dnf}=""),"",`
    + `IF(AND(${p2}<>"",${p2}=Results!F${rr}),5,0)`
    + `+IF(AND(UPPER(${dnf})="NO DNF",Results!AA${rr}="NO DNF"),10,`
    + `IF(AND(${dnf}<>"",${dnf}=Results!AA${rr}),5,0))))`;
}

(async () => {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.resolve(__dirname, '../credentials/service-account.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  console.log('🔧 Phantom-scoring fix');
  console.log(`   sheet: ${SHEET_ID}${SHEET_ID === LIVE_SHEET_ID ? '  (LIVE)' : '  (copy)'}${DRY ? '   [DRY RUN]' : ''}`);
  console.log('='.repeat(74));

  // Race list, in calendar order, from Results
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID, range: 'Results!A2:E40', valueRenderOption: 'FORMATTED_VALUE',
  });
  const rows = res.data.values || [];
  const races = [];
  for (let j = 0; j < rows.length; j++) {
    const name = (rows[j] && rows[j][1] || '').trim();
    if (!name) continue;
    races.push({ pos: races.length + 1, name, resultsRow: j + 2, hasResult: !!(rows[j][4] || '').trim() });
  }
  console.log(`   ${races.length} races (${races.filter(r => r.hasResult).length} run, ${races.filter(r => !r.hasResult).length} upcoming)\n`);

  const data = [];
  for (const race of races) {
    const p10Col = colLetter1(3 * race.pos - 1);
    const bonCol = colLetter1(3 * race.pos);
    const p10Vals = [], bonVals = [];
    for (let r = FIRST_PLAYER_ROW; r <= LAST_PLAYER_ROW; r++) {
      const pickRow = PICKS_FIRST_ROW + PICKS_BLOCK * (race.pos - 1) + (r - FIRST_PLAYER_ROW);
      p10Vals.push([p10Formula(pickRow, race.resultsRow)]);
      bonVals.push([bonusFormula(pickRow, race.resultsRow)]);
    }
    data.push({ range: `Scores!${p10Col}${FIRST_PLAYER_ROW}:${p10Col}${LAST_PLAYER_ROW}`, values: p10Vals });
    data.push({ range: `Scores!${bonCol}${FIRST_PLAYER_ROW}:${bonCol}${LAST_PLAYER_ROW}`, values: bonVals });
    console.log(`   ${race.name.padEnd(24)} ${p10Col}/${bonCol}  (Results row ${race.resultsRow})${race.hasResult ? '' : '  [upcoming -> will render blank]'}`);
  }

  if (DRY) {
    console.log('\n[DRY RUN] Example gated formulas for the first upcoming race:');
    const up = races.find(r => !r.hasResult) || races[0];
    const pr = PICKS_FIRST_ROW + PICKS_BLOCK * (up.pos - 1);
    console.log('  P10:   ' + p10Formula(pr, up.resultsRow));
    console.log('  BONUS: ' + bonusFormula(pr, up.resultsRow));
    console.log('\nNothing written.');
    return;
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: 'USER_ENTERED', data },
  });
  console.log(`\n✅ Rewrote ${data.length} column ranges (${races.length} races × P10 + Bonus).`);
  console.log('   Un-run races now contribute nothing; blank picks can no longer match blank results.');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
