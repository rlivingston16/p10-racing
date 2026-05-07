/**
 * P10 Racing — v3 Results-tab patcher.
 *
 * Reshapes the Results tab so EVERY driver who appeared in the F1 race
 * (classified, DNF, or DNS) is visible somewhere on that race's row,
 * while still scoring 0 points to anyone who picked a non-finisher.
 *
 *   E:Z   (P1-P22)    — all drivers in F1 table order, no filtering
 *                        (was: classified-only via REGEXMATCH on Col1)
 *   AA    (First DNF) — last DNF row in F1's table = chronologically
 *                        first one out (unchanged from v2)
 *   AB    (DNFs)      — comma-separated list of all DNF drivers   (HIDDEN)
 *   AC    (DNS)       — comma-separated list of all DNS drivers   (HIDDEN)
 *
 * Also updates Scores tab P10 formulas to be DNF/DNS-aware: if a player's
 * P10 pick is in the DNFs or DNS list for that race, they score 0 even
 * though the driver now appears in the P-cols.
 *
 * AB and AC are hidden from view (hiddenByUser=true). Scoring formulas
 * still reference them.
 *
 * Idempotent — safe to re-run any time. Only writes formulas; doesn't
 * touch the URLs in column D or any other tab.
 *
 * Usage:
 *   node sheet-tools/patch_v3_all_drivers.js          # dry run, prints summary
 *   node sheet-tools/patch_v3_all_drivers.js --apply  # writes to live sheet
 */

const { getSheets, SPREADSHEET_ID } = require('../lib/auth');

const APPLY = process.argv.includes('--apply');
const sheets = getSheets();

const SCORE_ARR = '{1,2,4,6,8,10,12,15,18,25,18,15,12,10,8,6,4,2,1,1}';
const PLAYERS_PER_RACE = 22;
const PICKS_BLOCK_SIZE = 25;
const PICKS_HEADER_ROWS = 2;

function col(n) {
  let s = '', i = n + 1;
  while (i > 0) { s = String.fromCharCode(65 + (i - 1) % 26) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

function picksPlayerRow(race0, player0) {
  return race0 * PICKS_BLOCK_SIZE + PICKS_HEADER_ROWS + 1 + player0;
}

function scoresColLetter(race1, type) {
  return col(3 * (race1 - 1) + 1 + type);
}

function buildResultsRow(rowNum) {
  const row = [];

  // P1-P22 (E:Z) — show every driver in F1's table order. No Col1 filter.
  for (let pos = 1; pos <= 22; pos++) {
    const tableRow = pos + 1; // F1 table row 1 is header; row 2 is P1
    row.push(
      `=IFERROR(IF($D${rowNum}="","",IFERROR(REGEXREPLACE(INDEX(IMPORTHTML($D${rowNum},"table",1),${tableRow},3),"[A-Z]{3}$",""),"")),"")`
    );
  }

  // AA First DNF — last DNF row by laps = first one out chronologically
  row.push(
    `=IF(E${rowNum}="","",IFERROR(LET(t,IMPORTHTML($D${rowNum},"table",1),d,FILTER(t,INDEX(t,,6)="DNF"),REGEXREPLACE(INDEX(d,ROWS(d),3),"[A-Z]{3}$","")),"NO DNF"))`
  );

  // AB DNFs — comma-list of every DNF driver (hidden, used by scoring)
  row.push(
    `=IF(E${rowNum}="","",IFERROR(REGEXREPLACE(TEXTJOIN(", ",TRUE,INDEX(FILTER(IMPORTHTML($D${rowNum},"table",1),INDEX(IMPORTHTML($D${rowNum},"table",1),,6)="DNF"),,3)),"([A-Z]{3})(, |$)","$2"),""))`
  );

  // AC DNS — comma-list of every DNS driver (hidden, used by scoring)
  row.push(
    `=IF(E${rowNum}="","",IFERROR(REGEXREPLACE(TEXTJOIN(", ",TRUE,INDEX(FILTER(IMPORTHTML($D${rowNum},"table",1),INDEX(IMPORTHTML($D${rowNum},"table",1),,6)="DNS"),,3)),"([A-Z]{3})(, |$)","$2"),""))`
  );

  return row;
}

function buildScoresP10Formula(race1, player0, numRaces) {
  const race0 = race1 - 1;
  const pickRow = picksPlayerRow(race0, player0);
  const resRowNum = race0 + 2;

  const p10Pick = `Picks!B${pickRow}`;
  const resP10Range = `Results!E${resRowNum}:Z${resRowNum}`;
  const resDNFs = `Results!AB${resRowNum}`;
  const resDNS = `Results!AC${resRowNum}`;

  return `=IFERROR(IF(${p10Pick}="","",IF(IFERROR(MATCH(${p10Pick},SPLIT(${resDNFs},", "),0),0)>0,0,IF(IFERROR(MATCH(${p10Pick},SPLIT(${resDNS},", "),0),0)>0,0,IFERROR(INDEX(${SCORE_ARR},MATCH(${p10Pick},${resP10Range},0)),0)))),"")`;
}

async function main() {
  console.log(APPLY ? '🔧 APPLY mode — writing to live sheet.' : '👁  DRY RUN — no changes will be made. Pass --apply to commit.');
  console.log();

  // 1. Detect race count from Results column A
  const resA = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Results!A2:A30'
  });
  const numRaces = (resA.data.values || []).filter(r => r[0]).length;
  if (numRaces === 0) throw new Error('No race rows found in Results column A.');
  console.log(`Detected ${numRaces} race rows in Results.`);

  // 2. Get sheet IDs (needed for hiding columns)
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const tabIds = {};
  meta.data.sheets.forEach(s => { tabIds[s.properties.title] = s.properties.sheetId; });
  const resultsId = tabIds['Results'];

  // 3. Build Results matrix: 22 P-cols + AA + AB + AC = 25 cols × numRaces rows
  const resultsMatrix = [];
  for (let r = 0; r < numRaces; r++) {
    resultsMatrix.push(buildResultsRow(r + 2));
  }
  console.log(`Built Results matrix: ${numRaces} rows × 25 cols (E:AC).`);

  // 4. Build Scores P10 formula updates (one ValueRange per race column,
  //    each spanning rows 4-25 for the 22 players)
  const scoresUpdates = [];
  for (let r = 1; r <= numRaces; r++) {
    const p10Col = scoresColLetter(r, 0);
    const formulas = [];
    for (let p = 0; p < PLAYERS_PER_RACE; p++) {
      formulas.push([buildScoresP10Formula(r, p, numRaces)]);
    }
    scoresUpdates.push({
      range: `Scores!${p10Col}4:${p10Col}${3 + PLAYERS_PER_RACE}`,
      values: formulas
    });
  }
  console.log(`Built Scores P10 updates: ${scoresUpdates.length} race columns × ${PLAYERS_PER_RACE} players = ${scoresUpdates.length * PLAYERS_PER_RACE} cells.`);

  // ── DRY RUN: show samples and exit ─────────────────────────────────────
  if (!APPLY) {
    console.log();
    console.log('--- Sample formulas that WOULD be written ---');
    console.log();
    console.log('Results row 2 (Australia), P1 cell (E2):');
    console.log('  ' + resultsMatrix[0][0]);
    console.log();
    console.log('Results row 2 (Australia), P19 cell (W2):');
    console.log('  ' + resultsMatrix[0][18]);
    console.log();
    console.log('Results row 2 (Australia), AA First DNF:');
    console.log('  ' + resultsMatrix[0][22]);
    console.log();
    console.log('Results row 2 (Australia), AB DNFs (hidden):');
    console.log('  ' + resultsMatrix[0][23]);
    console.log();
    console.log('Results row 2 (Australia), AC DNS (hidden):');
    console.log('  ' + resultsMatrix[0][24]);
    console.log();
    console.log('Scores P10 for race 1, player 0 (Adam Earp at row 4, col B):');
    console.log('  ' + scoresUpdates[0].values[0][0]);
    console.log();
    console.log('--- Plus: AA1/AB1/AC1 headers will be set, AB:AC columns will be hidden ---');
    console.log();
    console.log('Re-run with --apply to write these to the live sheet.');
    return;
  }

  // ── APPLY MODE ─────────────────────────────────────────────────────────

  // 5. Set Results headers AA1:AC1
  console.log('Writing Results headers AA1:AC1...');
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Results!AA1:AC1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [['First DNF', 'DNFs', 'DNS']] }
  });

  // 6. Write Results E2:AC{numRaces+1}
  console.log(`Writing Results E2:AC${numRaces + 1} (${numRaces * 25} cells)...`);
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `Results!E2:AC${numRaces + 1}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: resultsMatrix }
  });

  // 7. Batch write Scores P10 formulas
  console.log(`Writing Scores P10 formulas (${scoresUpdates.length * PLAYERS_PER_RACE} cells)...`);
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: scoresUpdates
    }
  });

  // 8. Hide columns AB and AC on Results tab
  console.log('Hiding columns AB and AC on Results tab...');
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{
        updateDimensionProperties: {
          range: {
            sheetId: resultsId,
            dimension: 'COLUMNS',
            startIndex: 27,  // AB (0-indexed)
            endIndex: 29     // through AC inclusive
          },
          properties: { hiddenByUser: true },
          fields: 'hiddenByUser'
        }
      }]
    }
  });

  console.log();
  console.log('✅ All done.');
  console.log(`Results: P-cols show all drivers, First DNF in AA, DNFs/DNS hidden in AB/AC.`);
  console.log(`Scores: P10 formulas now return 0 for DNF/DNS picks.`);
  console.log(`Verify the sheet in your browser, then run sync_drivers.js if you want a fresh dropdown refresh.`);
}

main().catch(e => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
