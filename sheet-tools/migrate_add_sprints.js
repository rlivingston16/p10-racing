/**
 * Sprint-race migration: adds 2 sprint rounds to the P10 Racing sheet.
 *
 *   - Great Britain (Sprint) — 7/4, inserted before Great Britain main
 *   - Singapore (Sprint)     — 10/10, inserted before Singapore main
 *
 * Sheet structure after migration: 24 sequential rounds (1..24).
 *
 * Usage:
 *   node sheet-tools/migrate_add_sprints.js --sheet=<sheet_id>   (test on copy)
 *   node sheet-tools/migrate_add_sprints.js                       (live sheet)
 *
 * Idempotent: if any "(Sprint)" row already exists in Results!B, aborts cleanly.
 *
 * Bottom-up insert order (Singapore first, then Silverstone) so earlier inserts
 * don't shift later target positions.
 */

const path = require('path');
const { google } = require('googleapis');

// ----- config -----
const LIVE_SHEET_ID = '1T__0CvsUq5Asq0-raVzxiXXvadfctATZwS7ANA-GQXo';
const arg = process.argv.find((a) => a.startsWith('--sheet='));
const SHEET_ID = arg ? arg.split('=')[1] : LIVE_SHEET_ID;

const PICKS_BLOCK_SIZE = 25;
const PLAYERS_PER_BLOCK = 22;
const FIRST_PICKS_ROW = 3; // 1-indexed sheet row of the first player in race 1

// Bottom-up order — Singapore first so the Silverstone insert doesn't shift Singapore's target.
const SPRINTS = [
  { name: 'Singapore (Sprint)',      date: '10/10', insertBeforeName: 'Singapore' },
  { name: 'Great Britain (Sprint)',  date: '7/4',   insertBeforeName: 'Great Britain' },
];

// Tells the renumber/restamp/relabel logic which race names are sprints (no round number).
function isSprint(raceName) {
  return /\(Sprint\)$/i.test((raceName || '').trim());
}

// ----- helpers -----
function colLetter1(n) {
  // 1-indexed: A=1, Z=26, AA=27
  let s = '';
  let x = n;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.resolve(__dirname, '../credentials/service-account.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// ----- per-tab insert primitives -----

/** Insert 1 row in Results at insertRow (1-indexed). Clones formulas E:AC from
 *  the now-shifted next row (which is the original "insertBefore" race), then
 *  sets A/B/C/D = round placeholder / name / date / empty URL. */
async function insertResultsRow(sheets, tabId, insertRow, sprint) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [
        {
          insertDimension: {
            range: { sheetId: tabId.Results, dimension: 'ROWS', startIndex: insertRow - 1, endIndex: insertRow },
            inheritFromBefore: true,
          },
        },
        {
          // After insert, source race is at row insertRow + 1. Copy its formula columns into our new row.
          copyPaste: {
            source: {
              sheetId: tabId.Results,
              startRowIndex: insertRow,
              endRowIndex: insertRow + 1,
              startColumnIndex: 4, // E
              endColumnIndex: 29,  // AC exclusive
            },
            destination: {
              sheetId: tabId.Results,
              startRowIndex: insertRow - 1,
              endRowIndex: insertRow,
              startColumnIndex: 4,
              endColumnIndex: 29,
            },
            pasteType: 'PASTE_NORMAL',
          },
        },
      ],
    },
  });

  // Set the static A-D values. Round number is a placeholder — will get fixed in the renumber pass.
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Results!A${insertRow}:D${insertRow}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[0, sprint.name, sprint.date, '']] },
  });

  console.log(`    Results: inserted row ${insertRow} (${sprint.name}, ${sprint.date})`);
}

/** Insert a 25-row block in Picks at insertRow. Clones the full block from the
 *  now-shifted next race (so formulas, dropdowns, format, and player names all
 *  carry over), then clears player picks (B:D) and overwrites the race header. */
async function insertPicksBlock(sheets, tabId, insertRow, sprint) {
  const sourceStart = insertRow - 1 + PICKS_BLOCK_SIZE; // 0-indexed; the post-insert position of the shifted race
  const sourceEnd = sourceStart + PICKS_BLOCK_SIZE;
  const destStart = insertRow - 1;
  const destEnd = destStart + PICKS_BLOCK_SIZE;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [
        {
          insertDimension: {
            range: { sheetId: tabId.Picks, dimension: 'ROWS', startIndex: destStart, endIndex: destEnd },
            inheritFromBefore: true,
          },
        },
        {
          // Clone everything (values, formulas, formats, merges) from the shifted source block into the new gap.
          copyPaste: {
            source: {
              sheetId: tabId.Picks,
              startRowIndex: sourceStart,
              endRowIndex: sourceEnd,
              startColumnIndex: 0, // A
              endColumnIndex: 4,   // D exclusive  (Picks uses A..D)
            },
            destination: {
              sheetId: tabId.Picks,
              startRowIndex: destStart,
              endRowIndex: destEnd,
              startColumnIndex: 0,
              endColumnIndex: 4,
            },
            pasteType: 'PASTE_NORMAL',
          },
        },
        {
          // Second pass: copy the data validations (driver-name dropdowns) which PASTE_NORMAL does not include.
          copyPaste: {
            source: {
              sheetId: tabId.Picks,
              startRowIndex: sourceStart,
              endRowIndex: sourceEnd,
              startColumnIndex: 0,
              endColumnIndex: 4,
            },
            destination: {
              sheetId: tabId.Picks,
              startRowIndex: destStart,
              endRowIndex: destEnd,
              startColumnIndex: 0,
              endColumnIndex: 4,
            },
            pasteType: 'PASTE_DATA_VALIDATION',
          },
        },
        {
          // Wipe the cloned player picks (cols B:D for the 22 player rows at top of the block).
          updateCells: {
            range: {
              sheetId: tabId.Picks,
              startRowIndex: destStart,
              endRowIndex: destStart + PLAYERS_PER_BLOCK,
              startColumnIndex: 1, // B
              endColumnIndex: 4,   // D exclusive
            },
            rows: Array.from({ length: PLAYERS_PER_BLOCK }, () => ({
              values: [
                { userEnteredValue: { stringValue: '' } },
                { userEnteredValue: { stringValue: '' } },
                { userEnteredValue: { stringValue: '' } },
              ],
            })),
            fields: 'userEnteredValue',
          },
        },
      ],
    },
  });

  console.log(`    Picks: inserted 25-row block at rows ${insertRow}-${insertRow + 24}; cleared picks for ${sprint.name}`);
}

/** Insert 3 columns in Scores at insertCol (1-indexed) and populate with FRESH
 *  formulas. NOTE: do NOT copyPaste formulas from a shifted source — copyPaste
 *  shifts relative column references in the formula by the col delta, which
 *  breaks `Picks!B<row>` references (B - 3 = invalid → #REF!). Always generate
 *  formulas explicitly with the correct absolute Picks/Results coordinates.
 *
 *  Formula sources (verified against existing race-1 cells, 2026 season):
 *   - P10 Pts: lookup pick in Results P-cols (E:Z), excluding DNFs (AB) and DNS (AC).
 *     Payout array {1,2,4,6,8,10,12,15,18,25,18,15,12,10,8,6,4,2,1,1}.
 *   - Bonus: +5 for correct P2 (Results!F), +5 for correct First DNF (Results!AA),
 *     or +10 for correctly predicting "NO DNF".
 *   - Win$: $10 to whoever has the highest P10 Pts that race (ties share).
 *
 *  Caller is responsible for updating the row-2 race label separately. */
async function insertScoresTriplet(sheets, tabId, insertCol1, sprint, racePosition) {
  const destStartCol = insertCol1 - 1;
  const destEndCol = destStartCol + 3;

  // Step 1: insert 3 blank cols (inherits dimension properties from the col before).
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [
        {
          insertDimension: {
            range: { sheetId: tabId.Scores, dimension: 'COLUMNS', startIndex: destStartCol, endIndex: destEndCol },
            inheritFromBefore: true,
          },
        },
        {
          // Copy FORMAT + data validation from the col triplet immediately after the gap so visual
          // styling matches the rest of the sheet. Format paste doesn't touch values/formulas.
          copyPaste: {
            source: {
              sheetId: tabId.Scores,
              startRowIndex: 0,
              endRowIndex: 30,
              startColumnIndex: destEndCol,       // shifted source = 3 cols to the right
              endColumnIndex: destEndCol + 3,
            },
            destination: {
              sheetId: tabId.Scores,
              startRowIndex: 0,
              endRowIndex: 30,
              startColumnIndex: destStartCol,
              endColumnIndex: destEndCol,
            },
            pasteType: 'PASTE_FORMAT',
          },
        },
      ],
    },
  });

  // Step 2: generate explicit formulas (don't rely on copyPaste — it shifts relative col refs and breaks Picks!B).
  const P = racePosition;
  const ptsCol = colLetter1(3 * P - 1);
  const bonusCol = colLetter1(3 * P);
  const winCol = colLetter1(3 * P + 1);
  const resRow = 1 + P; // Results sheet row for this race

  const data = [];
  for (let R = 4; R <= 25; R++) {
    const picksRow = 25 * P + R - 26; // = 3 + 25*(P-1) + (R-4)
    const ptsFormula =
      `=IFERROR(IF(Picks!B${picksRow}="","",` +
      `IF(IFERROR(MATCH(Picks!B${picksRow},SPLIT(Results!AB${resRow},", ",FALSE),0),0)>0,0,` +
      `IF(IFERROR(MATCH(Picks!B${picksRow},SPLIT(Results!AC${resRow},", ",FALSE),0),0)>0,0,` +
      `IFERROR(INDEX({1,2,4,6,8,10,12,15,18,25,18,15,12,10,8,6,4,2,1,1},` +
      `MATCH(Picks!B${picksRow},Results!E${resRow}:Z${resRow},0)),0)))),"")`;
    const bonusFormula =
      `=IF(AND(Picks!B${picksRow}="",Picks!C${picksRow}="",Picks!D${picksRow}=""),"",` +
      `IF(Picks!C${picksRow}=Results!F${resRow},5,0)+` +
      `IF(AND(UPPER(Picks!D${picksRow})="NO DNF",Results!AA${resRow}="NO DNF"),10,` +
      `IF(Picks!D${picksRow}=Results!AA${resRow},5,0)))`;
    const winFormula =
      `=IF(${ptsCol}${R}="","",IF(AND(${ptsCol}${R}>0,${ptsCol}${R}=MAX(${ptsCol}$4:${ptsCol}$25)),"$10",""))`;

    data.push({ range: `Scores!${ptsCol}${R}`, values: [[ptsFormula]] });
    data.push({ range: `Scores!${bonusCol}${R}`, values: [[bonusFormula]] });
    data.push({ range: `Scores!${winCol}${R}`, values: [[winFormula]] });
  }
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: 'USER_ENTERED', data },
  });

  console.log(`    Scores: inserted 3 cols at ${colLetter1(insertCol1)} for ${sprint.name}; wrote 66 fresh formulas`);
}

// ----- end-of-migration cleanup -----

/** Renumber Results!A. Only GP races get sequential numbers 1..N; sprints get blank. */
async function renumberResultsColumn(sheets) {
  const cur = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Results!A2:B40',
  });
  const rows = cur.data.values || [];
  const races = rows.filter((r) => (r[1] || '').trim()).map((r) => (r[1] || '').trim());

  const updates = [];
  let gpCounter = 0;
  for (const name of races) {
    if (isSprint(name)) {
      updates.push(['']); // blank for sprints
    } else {
      gpCounter += 1;
      updates.push([gpCounter]);
    }
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Results!A2:A${races.length + 1}`,
    valueInputOption: 'RAW',
    requestBody: { values: updates },
  });
  console.log(`  Renumbered Results!A: ${gpCounter} GPs numbered 1..${gpCounter}, ${races.length - gpCounter} sprints blank`);
}

/** Update race labels in Scores!row 2. GP labels get "Rn - " prefix; sprint labels get just the name. */
async function updateScoresLabels(sheets) {
  const cur = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Results!A2:B40',
  });
  const rows = cur.data.values || [];
  const races = rows.filter((r) => (r[1] || '').trim()).map((r) => (r[1] || '').trim());

  const valueRanges = [];
  let gpCounter = 0;
  for (let i = 0; i < races.length; i++) {
    const col = colLetter1(3 * (i + 1) - 1); // first col of race i's triplet
    const label = isSprint(races[i]) ? races[i] : `R${++gpCounter} - ${races[i]}`;
    valueRanges.push({ range: `Scores!${col}2`, values: [[label]] });
  }
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: 'RAW', data: valueRanges },
  });
  console.log(`  Updated ${races.length} race labels in Scores!row 2 (${gpCounter} GPs prefixed, ${races.length - gpCounter} sprints plain)`);
}

/** Re-stamp the per-race headers in the Picks tab. The Picks tab uses a
 *  "tail header" layout: race N's header is at row 25*(N-1)+1, col-headers at
 *  row 25*(N-1)+2, and players at rows (3 + 25*(N-1)) through +21. When we
 *  clone a block during migration, the cloned block's tail header still points
 *  to whatever the SOURCE block was followed by — wrong for the new ordering.
 *  Re-stamp every header to match the current Results tab. */
async function restampPicksHeaders(sheets) {
  const cur = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Results!A2:C40',
    valueRenderOption: 'FORMATTED_VALUE',
  });
  const races = (cur.data.values || [])
    .filter((r) => (r[1] || '').trim())
    .map((r) => ({ aValue: (r[0] || '').trim(), name: (r[1] || '').trim(), date: (r[2] || '').trim() }));

  // Each race occupies a 25-row block in Picks. Block position is determined by ORDER in Results, not by round number.
  const data = [];
  for (let i = 0; i < races.length; i++) {
    const race = races[i];
    const headerRow = 25 * i + 1;        // 1, 26, 51, ..., for races at positions 1, 2, 3 in the calendar
    const colHeaderRow = headerRow + 1;
    const prefix = isSprint(race.name) ? '' : `Round ${race.aValue} — `;
    data.push({
      range: `Picks!A${headerRow}`,
      values: [[`${prefix}${race.name} — Race Day: ${race.date}`]],
    });
    data.push({
      range: `Picks!A${colHeaderRow}:D${colHeaderRow}`,
      values: [['Player', 'P10 Pick', 'P2 Pick', 'DNF Pick']],
    });
  }
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: 'RAW', data },
  });
  console.log(`  Re-stamped ${races.length} race headers in Picks tab (sprints get plain "{name} — Race Day:" with no round prefix)`);
}

/** Rewrite SEASON TOTAL and TOTAL PAYOUT formulas to include all current race columns. */
async function rewriteSeasonTotals(sheets) {
  // Determine race count from Results
  const cur = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Results!A2:B40',
  });
  const raceCount = (cur.data.values || []).filter((r) => (r[1] || '').trim()).length;

  // Column positions after migration:
  const seasonTotalCol1 = 3 * raceCount + 2; // 1-indexed col for SEASON TOTAL
  const totalPayoutCol1 = seasonTotalCol1 + 1;
  const seasonTotalCol = colLetter1(seasonTotalCol1);
  const totalPayoutCol = colLetter1(totalPayoutCol1);

  // Build the formula text using row 4 references. We'll then copy-paste it down to rows 5-25.
  const ptsCells = [];
  const bonusCells = [];
  const winCells = [];
  for (let n = 1; n <= raceCount; n++) {
    ptsCells.push(colLetter1(3 * n - 1) + '4');     // race n P10 Pts col
    bonusCells.push(colLetter1(3 * n) + '4');       // race n Bonus col
    winCells.push(colLetter1(3 * n + 1) + '4');     // race n Win$ col
  }
  const seasonTotalFormula = `=SUM(${ptsCells.join(',')})+SUM(${bonusCells.join(',')})`;
  const totalPayoutFormula = `=(${winCells.map((c) => `(${c}="$10")`).join('+')})*10`;

  // Write the row-4 formulas.
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: `Scores!${seasonTotalCol}4`, values: [[seasonTotalFormula]] },
        { range: `Scores!${totalPayoutCol}4`, values: [[totalPayoutFormula]] },
      ],
    },
  });

  // Copy-paste the row-4 formulas down to rows 5-25 (rel refs adjust per row).
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const scoresTabId = meta.data.sheets.find((s) => s.properties.title === 'Scores').properties.sheetId;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [
        {
          copyPaste: {
            source: {
              sheetId: scoresTabId,
              startRowIndex: 3,        // row 4 (0-indexed)
              endRowIndex: 4,
              startColumnIndex: seasonTotalCol1 - 1,
              endColumnIndex: totalPayoutCol1, // inclusive of payout
            },
            destination: {
              sheetId: scoresTabId,
              startRowIndex: 4,        // rows 5..25 (0-indexed 4..24)
              endRowIndex: 25,
              startColumnIndex: seasonTotalCol1 - 1,
              endColumnIndex: totalPayoutCol1,
            },
            pasteType: 'PASTE_FORMULA',
          },
        },
      ],
    },
  });

  console.log(`  Rewrote SEASON TOTAL @ ${seasonTotalCol}4..25 and TOTAL PAYOUT @ ${totalPayoutCol}4..25`);
  console.log(`    SEASON TOTAL row 4: ${seasonTotalFormula.slice(0, 100)}${seasonTotalFormula.length > 100 ? '...' : ''}`);
  console.log(`    TOTAL PAYOUT row 4: ${totalPayoutFormula.slice(0, 100)}${totalPayoutFormula.length > 100 ? '...' : ''}`);
}

// ----- main -----
async function main() {
  console.log(`🏎️  Sprint-race migration`);
  console.log(`    Target sheet: ${SHEET_ID}`);
  console.log(`    Live sheet?   ${SHEET_ID === LIVE_SHEET_ID ? 'YES (live!)' : 'no (copy)'}`);
  console.log('='.repeat(80));

  const sheets = await getSheetsClient();

  // === Step 1: meta + current race list ===
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const tabId = {};
  for (const s of meta.data.sheets) tabId[s.properties.title] = s.properties.sheetId;
  for (const need of ['Results', 'Picks', 'Scores']) {
    if (tabId[need] === undefined) throw new Error(`Missing required tab: ${need}`);
  }

  const cur = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Results!A2:B40',
  });
  const raceRows = cur.data.values || [];

  // === Step 2: idempotency + position computation ===
  for (const sprint of SPRINTS) {
    if (raceRows.some((r) => (r[1] || '').trim() === sprint.name)) {
      console.log(`✋ Aborting: "${sprint.name}" already exists. Migration already ran?`);
      return;
    }
    const idx = raceRows.findIndex((r) => (r[1] || '').trim() === sprint.insertBeforeName);
    if (idx === -1) throw new Error(`Cannot find "${sprint.insertBeforeName}" in Results`);
    sprint.preMigrationPosition = idx + 1; // 1-indexed
    sprint.resultsInsertRow = idx + 2;     // 1-indexed sheet row
    sprint.picksInsertRow = FIRST_PICKS_ROW + PICKS_BLOCK_SIZE * idx;
    sprint.scoresInsertCol1 = 1 + 3 * idx + 1; // 1-indexed (B for race 1 = col 2; insertion is BEFORE the race's first col)
    console.log(
      `  ${sprint.name.padEnd(28)} pos=${sprint.preMigrationPosition} ` +
      `Results-row=${sprint.resultsInsertRow} ` +
      `Picks-rows=${sprint.picksInsertRow}..${sprint.picksInsertRow + PICKS_BLOCK_SIZE - 1} ` +
      `Scores-cols=${colLetter1(sprint.scoresInsertCol1)}..${colLetter1(sprint.scoresInsertCol1 + 2)}`
    );
  }

  // === Step 3: for each sprint (bottom-up), do the three inserts ===
  for (const sprint of SPRINTS) {
    console.log(`\n📥 Inserting ${sprint.name}...`);
    await insertResultsRow(sheets, tabId, sprint.resultsInsertRow, sprint);
    await insertPicksBlock(sheets, tabId, sprint.picksInsertRow, sprint);
    await insertScoresTriplet(sheets, tabId, sprint.scoresInsertCol1, sprint, sprint.preMigrationPosition);
  }

  // === Step 4: renumber Results!A, update Scores labels, rewrite season-total formulas ===
  console.log('\n🔧 Cleanup pass...');
  await renumberResultsColumn(sheets);
  await updateScoresLabels(sheets);
  await restampPicksHeaders(sheets);
  await rewriteSeasonTotals(sheets);

  console.log('\n✅ Migration complete!');
}

main().catch((e) => {
  console.error('\n❌ Error:', e.message);
  if (e.errors) console.error(JSON.stringify(e.errors, null, 2));
  process.exit(1);
});
