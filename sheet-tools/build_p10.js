/**
 * P10 Racing 2026 — full sheet builder.
 *
 * ⚠️  WIPES THE LIVE SHEET. Use only for fresh builds / off-season scaffolding.
 *     For mid-season repairs (P-col formulas, dropdowns, First DNF tiebreak),
 *     prefer running patch_results_formulas.gs as Apps Script inside the sheet.
 *
 * Builds four tabs:
 *   - Leaderboard: season standings, payouts, pot tracker
 *   - Picks: vertical layout, 25-row block per race, cols A=Player B=P10 C=P2 D=DNF
 *   - Results: 22 P-cols (E:Z), First DNF (AA), DNFs list (AB), DNS list (AC)
 *   - Scores: per-race P10/Bonus/Win$ + season totals
 */

const { getSheets, SPREADSHEET_ID } = require('../lib/auth');

const BUY_IN = 2200;
const sheets = getSheets();

const PLAYERS = [
  'Adam Earp','Andrew Homer','Ben Napier','Bradley Bonnifield','Brian Wiffin',
  'Daniel Bohannon','Dee Baldwin','Elesa Livingston','Ginger Lumbard','James Wright',
  'Josh Adams','Junior Vazquez','Nash Livingston','Paul Frame','Phil Wowak',
  'Ross Livingston','Rye Livingston','Seth Martinez','Steve Homer','Ted Livingston',
  'Tedders Livingston','Tom Livingston'
];

const RACES = [
  [1,'Australia','3/8'],[2,'China','3/15'],[3,'Japan','3/29'],[4,'Bahrain','4/12'],
  [5,'Saudi Arabia','4/19'],[6,'Miami','5/3'],[7,'Canada','5/24'],[8,'Monaco','6/7'],
  [9,'Spain (Barcelona)','6/14'],[10,'Austria','6/28'],[11,'Great Britain','7/5'],
  [12,'Belgium','7/19'],[13,'Hungary','7/26'],[14,'Netherlands','8/23'],[15,'Italy','9/6'],
  [16,'Spain (Madrid)','9/13'],[17,'Azerbaijan','9/26'],[18,'Singapore','10/11'],
  [19,'USA','10/25'],[20,'Mexico','11/1'],[21,'Brazil','11/8'],[22,'Las Vegas','11/21'],
  [23,'Qatar','11/29'],[24,'Abu Dhabi','12/6']
];
const NUM_RACES = RACES.length;

// Initial driver dropdown list. sync_drivers.js refreshes this weekly from F1.com
// to catch mid-season replacements.
const DRIVERS_2026 = [
  'Lando Norris','Oscar Piastri',           // McLaren
  'Max Verstappen','Liam Lawson',           // Red Bull
  'Charles Leclerc','Lewis Hamilton',       // Ferrari
  'George Russell','Kimi Antonelli',        // Mercedes
  'Fernando Alonso','Lance Stroll',         // Aston Martin
  'Pierre Gasly','Jack Doohan',             // Alpine
  'Alex Albon','Carlos Sainz',              // Williams
  'Esteban Ocon','Oliver Bearman',          // Haas
  'Nico Hulkenberg','Gabriel Bortoleto',    // Kick Sauber
  'Yuki Tsunoda','Isack Hadjar'             // RB
];

// P10 scoring: P1=1, P2=2, P3=4, P4=6, P5=8, P6=10, P7=12, P8=15, P9=18, P10=25,
// then mirror back: P11=18 ... P20=1. Picks outside this range score 0.
const SCORE_ARR = '{1,2,4,6,8,10,12,15,18,25,18,15,12,10,8,6,4,2,1,1}';

// 0-based column index to letter(s)
function col(n) {
  let s = '', i = n + 1;
  while (i > 0) { s = String.fromCharCode(65 + (i - 1) % 26) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

// Results tab layout:
//   Row 1: headers [Round, Race, Date, URL, P1..P22, First DNF, DNFs, DNS]
//   Rows 2-(NUM_RACES+1): one row per race
//     A=Round, B=Name, C=Date, D=URL(input), E..Z=P1..P22, AA=FirstDNF, AB=DNFs, AC=DNS
const RES_URL_COL    = 'D';
const RES_P1_COL_IDX = 4;          // 0-based: col E
const RES_P2_COL     = 'F';
const RES_P22_COL    = 'Z';        // last P-col after expansion (E + 21 = Z)
const RES_DNF_COL    = 'AA';       // First DNF
const RES_DNFS_COL   = 'AB';       // Comma-separated DNFs list
const RES_DNS_COL    = 'AC';       // Comma-separated DNS list

// Picks tab layout (vertical): 25 rows per race block.
//   Row 1 (of block): race header, merged A:D
//   Row 2: column headers [Player, P10 Pick, P2 Pick, DNF Pick]
//   Rows 3-24: 22 player rows
//   Row 25: blank separator
const BLOCK_SIZE  = 25;
const HEADER_ROWS = 2;
function playerRow(race, player) { return race * BLOCK_SIZE + HEADER_ROWS + 1 + player; } // 1-based
function raceHeaderRow(race)     { return race * BLOCK_SIZE + 1; }                         // 1-based

// Scores tab layout (horizontal): 1 row per player, 3 cols per race + 2 totals.
//   Row 1: title, Row 2: race headers, Row 3: P10/Bonus/Win$ sub-headers
//   Rows 4-25: 22 player rows
//   Per race R (1-based): col(3*(R-1)+1)=P10 Pts, col(3*(R-1)+2)=Bonus, col(3*(R-1)+3)=Win$
function scoresCol(race, type) { return col(3 * (race - 1) + 1 + type); }

function resRow(r) { return r + 2; } // race index (0-based) -> Results row (1-based)

async function main() {
  console.log('Getting spreadsheet info...');
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existing = meta.data.sheets;

  const requests = [];
  const firstId = existing[0].properties.sheetId;
  requests.push({ updateSheetProperties: { properties: { sheetId: firstId, title: 'Leaderboard' }, fields: 'title' } });
  for (const name of ['Picks', 'Results', 'Scores']) {
    if (!existing.find(s => s.properties.title === name)) {
      requests.push({ addSheet: { properties: { title: name } } });
    }
  }
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests } });

  const meta2 = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const tabIds = {};
  meta2.data.sheets.forEach(s => { tabIds[s.properties.title] = s.properties.sheetId; });
  console.log('Tabs:', Object.keys(tabIds));

  const lbSheetId      = tabIds['Leaderboard'];
  const picksSheetId   = tabIds['Picks'];
  const resultsSheetId = tabIds['Results'];
  const scoresSheetId  = tabIds['Scores'];

  // ─── RESULTS TAB ──────────────────────────────────────────────────────────
  console.log('Building Results tab (22 P-cols + DNF columns)...');
  const resHeader = [
    'Round', 'Race', 'Date', '← Paste F1 URL Here After Race →',
    ...Array.from({length: 22}, (_, i) => `P${i+1}`),
    'First DNF', 'DNFs', 'DNS'
  ];
  const resRows = [resHeader];

  for (let r = 0; r < NUM_RACES; r++) {
    const [round, name, date] = RACES[r];
    const rowNum = resRow(r);
    const row = [round, name, date, ''];

    // P1-P22 — filter on Col1 (Position) being numeric so DNFs / non-finishers
    // don't backfill into low P-slots. Filtering on Col6 (the v1 approach)
    // silently dropped the race winner because Sheets auto-formats the
    // leader's time string ("1:33:19.273") into a duration cell.
    for (let pos = 1; pos <= 22; pos++) {
      row.push(
        `=IFERROR(IF($D${rowNum}="","",IFERROR(REGEXREPLACE(INDEX(FILTER(IMPORTHTML($D${rowNum},"table",1),REGEXMATCH(TO_TEXT(INDEX(IMPORTHTML($D${rowNum},"table",1),,1)),"^[0-9]+$")),${pos},3),"[A-Z]{3}$",""),"")),"")`
      );
    }

    // First DNF — last row of the DNF section. Resolves lap-count ties
    // deterministically (Miami: Hadjar, not Gasly) because FILTER preserves
    // F1's table order. Race-not-yet-run guard via IF(E${rowNum}="").
    row.push(
      `=IF(E${rowNum}="","",IFERROR(LET(t,IMPORTHTML($D${rowNum},"table",1),d,FILTER(t,INDEX(t,,6)="DNF"),REGEXREPLACE(INDEX(d,ROWS(d),3),"[A-Z]{3}$","")),"NO DNF"))`
    );

    // DNFs — comma-separated list of every DNF'd driver. TEXTJOIN with codes
    // attached, then strip codes from the joined string (ARRAYFORMULA-broadcast
    // REGEXREPLACE doesn't work inside TEXTJOIN; post-join strip is RE2-safe).
    row.push(
      `=IF(E${rowNum}="","",IFERROR(REGEXREPLACE(TEXTJOIN(", ",TRUE,INDEX(FILTER(IMPORTHTML($D${rowNum},"table",1),INDEX(IMPORTHTML($D${rowNum},"table",1),,6)="DNF"),,3)),"([A-Z]{3})(, |$)","$2"),""))`
    );

    // DNS — same pattern, filtered on Col6="DNS".
    row.push(
      `=IF(E${rowNum}="","",IFERROR(REGEXREPLACE(TEXTJOIN(", ",TRUE,INDEX(FILTER(IMPORTHTML($D${rowNum},"table",1),INDEX(IMPORTHTML($D${rowNum},"table",1),,6)="DNS"),,3)),"([A-Z]{3})(, |$)","$2"),""))`
    );

    resRows.push(row);
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Results!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: resRows }
  });

  // ─── PICKS TAB (vertical) ─────────────────────────────────────────────────
  console.log('Building Picks tab (vertical, 25 rows per race)...');
  const picksData = [];
  for (let r = 0; r < NUM_RACES; r++) {
    const [round, name, date] = RACES[r];
    picksData.push([`Round ${round} — ${name} — Race Day: ${date}`, '', '', '']);
    picksData.push(['Player', 'P10 Pick', 'P2 Pick', 'DNF Pick']);
    for (let p = 0; p < PLAYERS.length; p++) {
      picksData.push([PLAYERS[p], '', '', '']);
    }
    picksData.push(['', '', '', '']);
  }

  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `Picks!A1:D${NUM_RACES * BLOCK_SIZE + 50}`
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Picks!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: picksData }
  });

  // Clear any frozen panes BEFORE we try to merge race-header rows across A:D —
  // a frozen first column blocks cross-column merges.
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: [{
      updateSheetProperties: {
        properties: { sheetId: picksSheetId, gridProperties: { frozenColumnCount: 0, frozenRowCount: 0 } },
        fields: 'gridProperties.frozenColumnCount,gridProperties.frozenRowCount'
      }
    }]}
  });

  // ─── SCORES TAB ───────────────────────────────────────────────────────────
  console.log('Building Scores tab (refs to vertical Picks + 22 P-col Results)...');
  const scoresRow1 = ['P10 Racing 2026 - Scores (auto-calculated)'];
  const scoresRow2 = ['Player'];
  const scoresRow3 = [''];
  for (let r = 1; r <= NUM_RACES; r++) {
    const [round, name] = RACES[r-1];
    scoresRow2.push(`R${round} - ${name}`, '', '');
    scoresRow3.push('P10 Pts', 'Bonus', 'Win $');
  }
  scoresRow2.push('SEASON TOTAL', 'TOTAL PAYOUT');
  scoresRow3.push('Points', '$');

  const seasonTotalCol = col(3 * NUM_RACES + 1);  // BV at NUM_RACES=24
  const payoutTotalCol = col(3 * NUM_RACES + 2);  // BW at NUM_RACES=24

  const scoresData = [scoresRow1, scoresRow2, scoresRow3];

  for (let p = 0; p < PLAYERS.length; p++) {
    const scoreRow = p + 4;       // Scores rows 4-25 hold the 22 players
    const row = [PLAYERS[p]];

    for (let r = 0; r < NUM_RACES; r++) {
      const raceNum = r + 1;
      const pickRow = playerRow(r, p);          // 1-based Picks row (vertical layout)
      const rowNum  = resRow(r);                // Results row

      const p10Pick = `Picks!B${pickRow}`;
      const p2Pick  = `Picks!C${pickRow}`;
      const dnfPick = `Picks!D${pickRow}`;

      const resP2       = `Results!${RES_P2_COL}${rowNum}`;
      const resP10Range = `Results!${col(RES_P1_COL_IDX)}${rowNum}:Results!${RES_P22_COL}${rowNum}`;
      const resDNF      = `Results!${RES_DNF_COL}${rowNum}`;

      // P10 score: index into SCORE_ARR by where the P10 pick finished in P1..P22.
      const p10Score = `=IFERROR(IF(${p10Pick}="","",IFERROR(INDEX(${SCORE_ARR},MATCH(${p10Pick},${resP10Range},0)),0)),"")`;

      // Bonus: 5pts for P2 hit, 5pts for DNF hit, 10pts for correctly predicting NO DNF.
      const bonus = `=IF(${p10Pick}="",0,IF(${p2Pick}=${resP2},5,0)+IF(AND(UPPER(${dnfPick})="NO DNF",${resDNF}="NO DNF"),10,IF(${dnfPick}=${resDNF},5,0)))`;

      // Payout: $10 if this player tied for max P10 score in the race.
      const p10ScoreColForRace = scoresCol(raceNum, 0);
      const p10RaceRange = `${p10ScoreColForRace}$4:${p10ScoreColForRace}$25`;
      const payout = `=IF(${p10ScoreColForRace}${scoreRow}="","",IF(AND(${p10ScoreColForRace}${scoreRow}>0,${p10ScoreColForRace}${scoreRow}=MAX(${p10RaceRange})),"$10",""))`;

      row.push(p10Score, bonus, payout);
    }

    // Season total: sum P10 + Bonus columns across all races.
    const p10Cells = Array.from({length: NUM_RACES}, (_, r) => `${scoresCol(r+1, 0)}${scoreRow}`);
    const bonCells = Array.from({length: NUM_RACES}, (_, r) => `${scoresCol(r+1, 1)}${scoreRow}`);
    row.push(`=SUM(${p10Cells.join(',')})+SUM(${bonCells.join(',')})`);

    // Total payout: count "$10" cells × $10. COUNTIF can't take a list of
    // individual cells, so build a sum of boolean comparisons.
    const winRefs = Array.from({length: NUM_RACES}, (_, r) => `(${scoresCol(r+1, 2)}${scoreRow}="$10")`);
    row.push(`=(${winRefs.join('+')})*10`);

    scoresData.push(row);
  }

  // Clear and write Scores. Range covers all race cols + 2 totals + buffer.
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `Scores!A1:${col(3 * NUM_RACES + 5)}30`
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Scores!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: scoresData }
  });

  // ─── LEADERBOARD TAB ──────────────────────────────────────────────────────
  console.log('Building Leaderboard tab...');
  const lbData = [
    ['🏆 P10 RACING 2026 - SEASON STANDINGS'],
    [],
    ['Rank', 'Player', 'Season Pts', 'Race Wins', 'Total Payout'],
  ];

  // Sorted standings via SORT(...) of {Names, Season Pts, Total Payout}.
  // Each row pulls the i-th sorted entry by index, so rows stay independent
  // and re-sort cleanly when scores change mid-season.
  const sourceRange = `{Scores!A4:A25,Scores!${seasonTotalCol}4:${seasonTotalCol}25,Scores!${payoutTotalCol}4:${payoutTotalCol}25}`;
  for (let i = 0; i < PLAYERS.length; i++) {
    const rowNum = 4 + i;
    lbData.push([
      `=IFERROR(RANK(C${rowNum},C4:C${4+PLAYERS.length-1},0),"")`,
      `=IFERROR(INDEX(SORT(${sourceRange},2,FALSE),${i+1},1),"")`,
      `=IFERROR(INDEX(SORT(${sourceRange},2,FALSE),${i+1},2),"")`,
      '',
      `=IFERROR(INDEX(SORT(${sourceRange},2,FALSE),${i+1},3),"")`
    ]);
  }

  // Pot tracker — appended after the standings table.
  // Standings occupy rows 1..(3 + PLAYERS.length); pot tracker starts after one blank.
  const standingsLastRow = 3 + PLAYERS.length;       // 1-based row of last standings entry
  const payoutsRow       = standingsLastRow + 4;     // "Payouts Distributed" row, 1-based
  const remainingRow     = payoutsRow + 1;           // "Remaining Pot" row, 1-based

  lbData.push([]);
  lbData.push(['💰 POT TRACKER']);
  lbData.push(['Total Buy-ins', `$${BUY_IN}`]);
  lbData.push(['Payouts Distributed', `=IFERROR(SUM(Scores!${payoutTotalCol}4:${payoutTotalCol}25),0)`]);
  lbData.push(['Remaining Pot', `=${BUY_IN}-B${payoutsRow}`]);
  lbData.push([]);
  lbData.push(['Season Podium Payout Estimates (from remaining)']);
  lbData.push(['🥇 1st Place (~60%)', `=ROUND(B${remainingRow}*0.6,-1)`]);
  lbData.push(['🥈 2nd Place (~30%)', `=ROUND(B${remainingRow}*0.3,-1)`]);
  lbData.push(['🥉 3rd Place (~10%)', `=ROUND(B${remainingRow}*0.1,-1)`]);

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Leaderboard!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: lbData }
  });

  // ─── PICKS DROPDOWNS ──────────────────────────────────────────────────────
  console.log('Adding strict-mode driver dropdowns to Picks...');
  const dropdownRequests = [];
  for (let r = 0; r < NUM_RACES; r++) {
    const dataStart = raceHeaderRow(r) - 1 + HEADER_ROWS; // 0-based first player row
    const dataEnd   = dataStart + PLAYERS.length;

    // P10/P2 picks — drivers only.
    dropdownRequests.push({ setDataValidation: {
      range: { sheetId: picksSheetId, startRowIndex: dataStart, endRowIndex: dataEnd, startColumnIndex: 1, endColumnIndex: 3 },
      rule: {
        condition: { type: 'ONE_OF_LIST', values: DRIVERS_2026.map(d => ({ userEnteredValue: d })) },
        showCustomUi: true,
        strict: true  // free text rejected — typed names like "Stroll" silently break MATCH-based scoring
      }
    }});

    // DNF pick — drivers + "NO DNF".
    dropdownRequests.push({ setDataValidation: {
      range: { sheetId: picksSheetId, startRowIndex: dataStart, endRowIndex: dataEnd, startColumnIndex: 3, endColumnIndex: 4 },
      rule: {
        condition: { type: 'ONE_OF_LIST', values: ['NO DNF', ...DRIVERS_2026].map(d => ({ userEnteredValue: d })) },
        showCustomUi: true,
        strict: true
      }
    }});
  }

  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests: dropdownRequests } });

  // ─── FORMATTING ───────────────────────────────────────────────────────────
  console.log('Applying formatting...');
  const RED       = { red: 0.545, green: 0.102, blue: 0.102 };
  const WHITE     = { red: 1, green: 1, blue: 1 };
  const GOLD      = { red: 1, green: 0.843, blue: 0 };
  const LGRAY     = { red: 0.93, green: 0.93, blue: 0.93 };
  const DARK_TEXT = { red: 0.2, green: 0.2, blue: 0.2 };
  const URL_HI    = { red: 1, green: 0.95, blue: 0.8 };

  const fmtRequests = [];

  // ── Leaderboard ──
  fmtRequests.push({ repeatCell: {
    range: { sheetId: lbSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 5 },
    cell: { userEnteredFormat: {
      backgroundColor: RED,
      textFormat: { foregroundColor: WHITE, bold: true, fontSize: 16 },
      horizontalAlignment: 'CENTER'
    }},
    fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
  }});
  fmtRequests.push({ repeatCell: {
    range: { sheetId: lbSheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 5 },
    cell: { userEnteredFormat: { backgroundColor: DARK_TEXT, textFormat: { foregroundColor: WHITE, bold: true } }},
    fields: 'userEnteredFormat(backgroundColor,textFormat)'
  }});
  fmtRequests.push({ repeatCell: {
    range: { sheetId: lbSheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 5 },
    cell: { userEnteredFormat: { backgroundColor: GOLD, textFormat: { bold: true } }},
    fields: 'userEnteredFormat(backgroundColor,textFormat)'
  }});

  // ── Results ──
  fmtRequests.push({ repeatCell: {
    range: { sheetId: resultsSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 29 },
    cell: { userEnteredFormat: { backgroundColor: RED, textFormat: { foregroundColor: WHITE, bold: true } }},
    fields: 'userEnteredFormat(backgroundColor,textFormat)'
  }});
  fmtRequests.push({ repeatCell: {
    range: { sheetId: resultsSheetId, startRowIndex: 1, endRowIndex: NUM_RACES + 1, startColumnIndex: 3, endColumnIndex: 4 },
    cell: { userEnteredFormat: { backgroundColor: URL_HI, textFormat: { bold: true } }},
    fields: 'userEnteredFormat(backgroundColor,textFormat)'
  }});

  // ── Scores ──
  fmtRequests.push({ repeatCell: {
    range: { sheetId: scoresSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 3 * NUM_RACES + 3 },
    cell: { userEnteredFormat: { backgroundColor: RED, textFormat: { foregroundColor: WHITE, bold: true, fontSize: 14 } }},
    fields: 'userEnteredFormat(backgroundColor,textFormat)'
  }});
  fmtRequests.push({ repeatCell: {
    range: { sheetId: scoresSheetId, startRowIndex: 1, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 3 * NUM_RACES + 3 },
    cell: { userEnteredFormat: { backgroundColor: DARK_TEXT, textFormat: { foregroundColor: WHITE, bold: true } }},
    fields: 'userEnteredFormat(backgroundColor,textFormat)'
  }});

  // ── Picks (vertical, per race block) ──
  for (let r = 0; r < NUM_RACES; r++) {
    const headerRow1 = raceHeaderRow(r) - 1; // 0-based row of race title
    const headerRow2 = headerRow1 + 1;       // 0-based row of column headers
    const dataStart  = headerRow2 + 1;       // 0-based first player row

    // Race title — red, white bold, centered, merged across A:D.
    fmtRequests.push({ repeatCell: {
      range: { sheetId: picksSheetId, startRowIndex: headerRow1, endRowIndex: headerRow1+1, startColumnIndex: 0, endColumnIndex: 4 },
      cell: { userEnteredFormat: {
        backgroundColor: RED,
        textFormat: { foregroundColor: WHITE, bold: true, fontSize: 11 },
        horizontalAlignment: 'CENTER'
      }},
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
    }});
    fmtRequests.push({ mergeCells: {
      range: { sheetId: picksSheetId, startRowIndex: headerRow1, endRowIndex: headerRow1+1, startColumnIndex: 0, endColumnIndex: 4 },
      mergeType: 'MERGE_ALL'
    }});

    // Column header row — dark.
    fmtRequests.push({ repeatCell: {
      range: { sheetId: picksSheetId, startRowIndex: headerRow2, endRowIndex: headerRow2+1, startColumnIndex: 0, endColumnIndex: 4 },
      cell: { userEnteredFormat: { backgroundColor: DARK_TEXT, textFormat: { foregroundColor: WHITE, bold: true } }},
      fields: 'userEnteredFormat(backgroundColor,textFormat)'
    }});

    // Alternating row shading on player rows.
    for (let p = 0; p < PLAYERS.length; p++) {
      fmtRequests.push({ repeatCell: {
        range: { sheetId: picksSheetId, startRowIndex: dataStart+p, endRowIndex: dataStart+p+1, startColumnIndex: 0, endColumnIndex: 4 },
        cell: { userEnteredFormat: { backgroundColor: p % 2 === 0 ? WHITE : LGRAY }},
        fields: 'userEnteredFormat(backgroundColor)'
      }});
    }
  }

  // ── Picks column widths: A=160, B/C/D=140 ──
  fmtRequests.push({ updateDimensionProperties: {
    range: { sheetId: picksSheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
    properties: { pixelSize: 160 }, fields: 'pixelSize'
  }});
  fmtRequests.push({ updateDimensionProperties: {
    range: { sheetId: picksSheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 4 },
    properties: { pixelSize: 140 }, fields: 'pixelSize'
  }});

  // ── Frozen panes. Picks stays at 0 (race-header A:D merge requires it). ──
  fmtRequests.push({ updateSheetProperties: {
    properties: { sheetId: picksSheetId, gridProperties: { frozenRowCount: 0, frozenColumnCount: 0 } },
    fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount'
  }});
  fmtRequests.push({ updateSheetProperties: {
    properties: { sheetId: scoresSheetId, gridProperties: { frozenRowCount: 3, frozenColumnCount: 1 } },
    fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount'
  }});
  fmtRequests.push({ updateSheetProperties: {
    properties: { sheetId: resultsSheetId, gridProperties: { frozenRowCount: 1, frozenColumnCount: 1 } },
    fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount'
  }});
  fmtRequests.push({ updateSheetProperties: {
    properties: { sheetId: lbSheetId, gridProperties: { frozenRowCount: 3 } },
    fields: 'gridProperties.frozenRowCount'
  }});

  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests: fmtRequests } });

  console.log('✅ All done.');
  console.log(`Open: https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`);
  console.log(`Results: 22 P-cols (E:Z), First DNF (AA), DNFs (AB), DNS (AC).`);
  console.log(`Picks: vertical, ${NUM_RACES} race blocks × ${BLOCK_SIZE} rows. Strict-mode driver dropdowns.`);
  console.log(`Scores: refs vertical Picks layout, P10 lookup E:Z, DNF lookup AA.`);
}

main().catch(console.error);
