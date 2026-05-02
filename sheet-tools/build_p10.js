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

// P1=1, P2=2, P3=4 ... P10=25 ... P20=1
const SCORE_ARR = '{1,2,4,6,8,10,12,15,18,25,18,15,12,10,8,6,4,2,1,1}';

// 0-based column index to letter(s)
function col(n) {
  let s = '', i = n + 1;
  while (i > 0) { s = String.fromCharCode(65 + (i - 1) % 26) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

// Results tab layout:
// Row 1: headers
// Rows 2-25: one row per race
//   A=Round, B=Name, C=Date, D=URL(input), E=P1, F=P2 ... X=P20, Y=FirstDNF
const RES_URL_COL = 'D';   // col index 3
const RES_P1_COL  = 4;     // col E = index 4  => P(pos) = col(4 + pos - 1)
const RES_DNF_COL = col(4 + 20); // col Y = index 24

// Picks tab layout:
// Row 1: title, Row 2: race headers (merged 3), Row 3: P10/P2/DNF labels
// Rows 4-25: player picks
// Cols: A=Player, then per race R: col(3R-2)=P10, col(3R-1)=P2, col(3R)=DNF
function picksCol(race, type) { return col(3 * (race - 1) + 1 + type); } // type 0=P10,1=P2,2=DNF
// Race 1: B(P10), C(P2), D(DNF) | Race 2: E, F, G | etc.

// Scores tab layout:
// Row 1: title, Row 2: race headers, Row 3: sub-headers
// Rows 4-25: player scores
// Cols: A=Player, then per race R: col(3R-2)=P10pts, col(3R-1)=Bonus, col(3R)=Payout
// Then: season total (col after last race), total payout
function scoresCol(race, type) { return col(3 * (race - 1) + 1 + type); } // same offsets as picks

// Results row for race index r (0-based): r+2 (row 2=race1)
function resRow(r) { return r + 2; }

async function main() {
  console.log('Getting spreadsheet info...');
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existing = meta.data.sheets;

  // Rename existing sheet, create new ones
  const tabNames = ['Leaderboard', 'Picks', 'Results', 'Scores'];
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

  // ─── RESULTS TAB ──────────────────────────────────────────────────────────
  console.log('Building Results tab...');
  const resHeader = ['Round', 'Race', 'Date', '← Paste F1 URL Here After Race →',
    ...Array.from({length: 20}, (_, i) => `P${i+1}`), 'First DNF'];
  const resRows = [resHeader];

  for (let r = 0; r < 24; r++) {
    const [round, name, date] = RACES[r];
    const urlRef = `${RES_URL_COL}${resRow(r)}`;
    const row = [round, name, date, '']; // URL is blank input
    // P1-P20 formulas
    for (let pos = 1; pos <= 20; pos++) {
      row.push(`=IFERROR(IF(${urlRef}="","",INDEX(IMPORTHTML(${urlRef},"table",1),${pos+1},3)),"")`);
    }
    // First DNF: last row of table with non-time TIME/RETIRED field, ordered by fewest laps
    row.push(`=IFERROR(IF(${urlRef}="","",IFERROR(INDEX(QUERY(IMPORTHTML(${urlRef},"table",1),"Select Col3 where not Col6 matches '.*:.*' and Col6<>'' and Col6<>'TIME/RETIRED' order by Col5 asc limit 1 label Col3 ''"),1,1),"NO DNF")),"NO DNF")`);
    resRows.push(row);
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Results!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: resRows }
  });

  // ─── PICKS TAB ────────────────────────────────────────────────────────────
  console.log('Building Picks tab...');
  // Row 1: title
  // Row 2: race name headers (every 3 cols)
  // Row 3: P10 / P2 / DNF labels
  // Rows 4-25: players

  const picksRow1 = ['P10 Racing 2026 - Player Predictions'];
  const picksRow2 = ['Player'];
  const picksRow3 = [''];
  for (let r = 1; r <= 24; r++) {
    const [round, name, date] = RACES[r - 1];
    picksRow2.push(`R${round} - ${name} (${date})`, '', '');
    picksRow3.push('P10 Pick', 'P2 Pick', 'DNF Pick');
  }

  const picksData = [picksRow1, picksRow2, picksRow3];
  PLAYERS.forEach(p => {
    const row = [p];
    for (let r = 1; r <= 24; r++) row.push('', '', '');
    picksData.push(row);
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Picks!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: picksData }
  });

  // ─── SCORES TAB ───────────────────────────────────────────────────────────
  console.log('Building Scores tab...');
  // Row 1: title
  // Row 2: race headers
  // Row 3: P10pts / Bonus / Win$
  // Rows 4-25: player scores
  // Col after last race: Season Points, Total Payout

  const scoresRow1 = ['P10 Racing 2026 - Scores'];
  const scoresRow2 = ['Player'];
  const scoresRow3 = [''];

  for (let r = 1; r <= 24; r++) {
    const [round, name, date] = RACES[r - 1];
    scoresRow2.push(`R${round} - ${name}`, '', '');
    scoresRow3.push('P10 Pts', 'Bonus', 'Win $');
  }
  // Season totals columns
  const seasonPtsCol = col(3 * 24 + 1); // col after all races
  const payoutTotalCol = col(3 * 24 + 2);
  scoresRow2.push('SEASON TOTAL', 'TOTAL PAYOUT');
  scoresRow3.push('Points', '$');

  const scoresData = [scoresRow1, scoresRow2, scoresRow3];

  for (let p = 0; p < PLAYERS.length; p++) {
    const playerRow = p + 4; // Rows 4-25
    const row = [PLAYERS[p]];

    const p10ScoreCols = []; // track P10-only score col refs for MAX calc

    for (let r = 1; r <= 24; r++) {
      const rIdx = r - 1;
      const resRowNum = resRow(rIdx);

      // Picks cell refs
      const p10Pick = `Picks!${picksCol(r, 0)}${playerRow}`;
      const p2Pick  = `Picks!${picksCol(r, 1)}${playerRow}`;
      const dnfPick = `Picks!${picksCol(r, 2)}${playerRow}`;

      // Results refs
      const resP2  = `Results!${col(RES_P1_COL + 1)}${resRowNum}`; // P2 driver
      const resP10Range = `Results!${col(RES_P1_COL)}${resRowNum}:Results!${col(RES_P1_COL + 19)}${resRowNum}`;
      const resDNF = `Results!${RES_DNF_COL}${resRowNum}`;

      // P10 score formula
      const p10ScoreFormula = `=IFERROR(IF(${p10Pick}="","",IFERROR(INDEX(${SCORE_ARR},MATCH(${p10Pick},${resP10Range},0)),0)),"")`;

      // Bonus: P2 (5pts) + DNF (5 or 10pts)
      const bonusFormula = `=IF(${p10Pick}="",0,IF(${p2Pick}=${resP2},5,0)+IF(AND(UPPER(${dnfPick})="NO DNF",${resDNF}="NO DNF"),10,IF(${dnfPick}=${resDNF},5,0)))`;

      // Payout: $10 if P10 score = max P10 score for this race (non-empty)
      // We'll use the P10 score col reference in this race
      const p10ScoreColForRace = scoresCol(r, 0);
      const p10RangeAllPlayers = `${p10ScoreColForRace}$4:${p10ScoreColForRace}$25`;
      const payoutFormula = `=IF(${p10ScoreColForRace}${playerRow}="","",IF(AND(${p10ScoreColForRace}${playerRow}>0,${p10ScoreColForRace}${playerRow}=MAX(${p10RangeAllPlayers})),"$10",""))`;

      row.push(p10ScoreFormula, bonusFormula, payoutFormula);
    }

    // Season total: sum of all P10 scores + bonuses
    const p10TotalsRange = [];
    const bonusTotalsRange = [];
    for (let r = 1; r <= 24; r++) {
      p10TotalsRange.push(`${scoresCol(r, 0)}${playerRow}`);
      bonusTotalsRange.push(`${scoresCol(r, 1)}${playerRow}`);
    }
    row.push(`=SUM(${p10TotalsRange.join(',')})+SUM(${bonusTotalsRange.join(',')})`);

    // Total payout: count "$10" cells × 10
    const payoutCols = [];
    for (let r = 1; r <= 24; r++) payoutCols.push(`${scoresCol(r, 2)}${playerRow}`);
    row.push(`=COUNTIF(${payoutCols.join(',')},"$10")*10`);

    scoresData.push(row);
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Scores!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: scoresData }
  });

  // ─── LEADERBOARD TAB ──────────────────────────────────────────────────────
  console.log('Building Leaderboard tab...');

  // Season total col and payout col in Scores tab
  const seasonTotalColLetter = col(3 * 24 + 1); // e.g. "BQ"
  const payoutColLetter = col(3 * 24 + 2);

  const lbData = [
    ['P10 RACING 2026 - SEASON STANDINGS'],
    [],
    ['Rank', 'Player', 'Season Points', 'Race Wins', 'Payout Won', 'Points Behind Leader'],
  ];

  // Use LARGE/INDEX/MATCH to sort. For simplicity, use a QUERY on Scores data.
  // Players data is in Scores!A4:A25 (names), season pts in Scores!{seasonTotalCol}4:25
  // I'll use SORT formula to auto-rank
  lbData.push([
    '=ARRAYFORMULA(IF(ISBLANK(B4:B25),"",RANK(C4:C25,C4:C25,0)))',
    `=IFERROR(QUERY({Scores!A4:A25,Scores!${seasonTotalColLetter}4:${seasonTotalColLetter}25,Scores!${payoutColLetter}4:${payoutColLetter}25},"Select Col1,Col2,Col3 order by Col2 desc"),"")`
  ]);

  // Actually, let me use a simpler approach - just reference the data directly sorted with SORT
  // I'll use a different structure: list players with formulas for their stats
  // Using SORT on the scores range

  // Simpler: just use SORT formula in B4
  const lbRows = [
    ['P10 RACING 2026 - SEASON STANDINGS'],
    [],
    ['Rank', 'Player', 'Season Pts', 'Race Wins', 'Total Payout'],
    [`=ARRAYFORMULA(IF(ISBLANK(B4:B25),"",RANK(C4:C25,C4:C25,0)))`,
     `=IFERROR(SORT(Scores!A4:A25,Scores!${seasonTotalColLetter}4:${seasonTotalColLetter}25,FALSE),"")`,
     ``,``,``],
  ];

  // Actually the cleanest is QUERY with sort. Let me write it properly:
  const lbFinal = [
    ['🏆 P10 RACING 2026 - SEASON STANDINGS'],
    [],
    ['Rank', 'Player', 'Season Pts', 'Race Wins ($10)', 'Total Payout'],
  ];

  // Sorted data using QUERY (returns sorted rows)
  // We'll join player name, season pts, race wins, total payout
  lbFinal.push(['', `=IFERROR(QUERY({Scores!A4:A25,Scores!${seasonTotalColLetter}4:${seasonTotalColLetter}25,ARRAYFORMULA(COUNTIF(REGEXMATCH(INDIRECT("Scores!B4:B25"),"."),TRUE)),Scores!${payoutColLetter}4:${payoutColLetter}25},"Select Col1,Col2,Col3,Col4 order by Col2 desc label Col1 '',Col2 '',Col3 '',Col4 ''"),"")`, '', '', '']);

  // Simpler approach: just show the data with individual formulas, sorted manually by RANK
  // I'll use SORT to create a sorted list and then RANK for positions

  const lbSimple = [
    ['🏆 P10 RACING 2026 - SEASON STANDINGS'],
    [],
    ['Rank', 'Player', 'Season Pts', 'Race Wins', 'Total Payout'],
  ];

  // Sorted table using SORT:
  lbSimple.push([
    '',
    `=IFERROR(INDEX(SORT({Scores!A4:A25,Scores!${seasonTotalColLetter}4:${seasonTotalColLetter}25,Scores!${payoutColLetter}4:${payoutColLetter}25},2,FALSE),ROW(A1),1),"")`,
    `=IFERROR(INDEX(SORT({Scores!A4:A25,Scores!${seasonTotalColLetter}4:${seasonTotalColLetter}25,Scores!${payoutColLetter}4:${payoutColLetter}25},2,FALSE),ROW(A1),2),"")`,
    '',
    `=IFERROR(INDEX(SORT({Scores!A4:A25,Scores!${seasonTotalColLetter}4:${seasonTotalColLetter}25,Scores!${payoutColLetter}4:${payoutColLetter}25},2,FALSE),ROW(A1),3),"")`
  ]);

  // Repeat for all 22 players with ROW(A2), ROW(A3), etc.
  for (let i = 1; i <= 21; i++) {
    lbSimple.push([
      ``,
      `=IFERROR(INDEX(SORT({Scores!A4:A25,Scores!${seasonTotalColLetter}4:${seasonTotalColLetter}25,Scores!${payoutColLetter}4:${payoutColLetter}25},2,FALSE),ROW(A${i+1}),1),"")`,
      `=IFERROR(INDEX(SORT({Scores!A4:A25,Scores!${seasonTotalColLetter}4:${seasonTotalColLetter}25,Scores!${payoutColLetter}4:${payoutColLetter}25},2,FALSE),ROW(A${i+1}),2),"")`,
      '',
      `=IFERROR(INDEX(SORT({Scores!A4:A25,Scores!${seasonTotalColLetter}4:${seasonTotalColLetter}25,Scores!${payoutColLetter}4:${payoutColLetter}25},2,FALSE),ROW(A${i+1}),3),"")`
    ]);
  }

  // Add rank formula after data is in
  // Row 4+i gets rank = RANK(C4+i, C4:C25, 0)
  for (let i = 0; i < 22; i++) {
    lbSimple[3 + i][0] = `=IFERROR(RANK(C${4+i},C4:C25,0),"")`;
  }

  // Pot tracker
  lbSimple.push([]);
  lbSimple.push(['💰 POT TRACKER']);
  lbSimple.push(['Total Buy-ins', `$${BUY_IN}`]);
  lbSimple.push(['Payouts Distributed', `=IFERROR(SUM(Scores!${payoutColLetter}4:${payoutColLetter}25),0)`]);
  lbSimple.push(['Remaining Pot', `=${BUY_IN}-E${3+22+3}`]);
  lbSimple.push([]);
  lbSimple.push(['Season Podium Payout Estimates (from remaining)']);
  lbSimple.push(['🥇 1st Place (~60%)', `=ROUND(E${3+22+4}*0.6,-1)`]);
  lbSimple.push(['🥈 2nd Place (~30%)', `=ROUND(E${3+22+4}*0.3,-1)`]);
  lbSimple.push(['🥉 3rd Place (~10%)', `=ROUND(E${3+22+4}*0.1,-1)`]);

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Leaderboard!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: lbSimple }
  });

  // ─── FORMATTING ───────────────────────────────────────────────────────────
  console.log('Applying formatting...');
  const RED = { red: 0.545, green: 0.102, blue: 0.102 };
  const WHITE = { red: 1, green: 1, blue: 1 };
  const GOLD = { red: 1, green: 0.843, blue: 0 };
  const LIGHT_GRAY = { red: 0.95, green: 0.95, blue: 0.95 };
  const DARK_TEXT = { red: 0.2, green: 0.2, blue: 0.2 };

  const lbSheetId = tabIds['Leaderboard'];
  const picksSheetId = tabIds['Picks'];
  const resultsSheetId = tabIds['Results'];
  const scoresSheetId = tabIds['Scores'];

  const fmtRequests = [
    // Leaderboard title row - big, red, white text
    {
      repeatCell: {
        range: { sheetId: lbSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 6 },
        cell: { userEnteredFormat: {
          backgroundColor: RED,
          textFormat: { foregroundColor: WHITE, bold: true, fontSize: 16 },
          horizontalAlignment: 'CENTER'
        }},
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
      }
    },
    // Leaderboard header row
    {
      repeatCell: {
        range: { sheetId: lbSheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 6 },
        cell: { userEnteredFormat: {
          backgroundColor: DARK_TEXT,
          textFormat: { foregroundColor: WHITE, bold: true },
        }},
        fields: 'userEnteredFormat(backgroundColor,textFormat)'
      }
    },
    // P1 row gold
    {
      repeatCell: {
        range: { sheetId: lbSheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 6 },
        cell: { userEnteredFormat: {
          backgroundColor: GOLD,
          textFormat: { bold: true }
        }},
        fields: 'userEnteredFormat(backgroundColor,textFormat)'
      }
    },
    // Picks title row
    {
      repeatCell: {
        range: { sheetId: picksSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 73 },
        cell: { userEnteredFormat: {
          backgroundColor: RED,
          textFormat: { foregroundColor: WHITE, bold: true, fontSize: 14 },
          horizontalAlignment: 'CENTER'
        }},
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
      }
    },
    // Picks race header row
    {
      repeatCell: {
        range: { sheetId: picksSheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 73 },
        cell: { userEnteredFormat: {
          backgroundColor: RED,
          textFormat: { foregroundColor: WHITE, bold: true }
        }},
        fields: 'userEnteredFormat(backgroundColor,textFormat)'
      }
    },
    // Picks sub-header row
    {
      repeatCell: {
        range: { sheetId: picksSheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 73 },
        cell: { userEnteredFormat: {
          backgroundColor: DARK_TEXT,
          textFormat: { foregroundColor: WHITE, bold: true }
        }},
        fields: 'userEnteredFormat(backgroundColor,textFormat)'
      }
    },
    // Results header
    {
      repeatCell: {
        range: { sheetId: resultsSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 25 },
        cell: { userEnteredFormat: {
          backgroundColor: RED,
          textFormat: { foregroundColor: WHITE, bold: true }
        }},
        fields: 'userEnteredFormat(backgroundColor,textFormat)'
      }
    },
    // Results URL column highlight
    {
      repeatCell: {
        range: { sheetId: resultsSheetId, startRowIndex: 1, endRowIndex: 25, startColumnIndex: 3, endColumnIndex: 4 },
        cell: { userEnteredFormat: {
          backgroundColor: { red: 1, green: 0.95, blue: 0.8 },
          textFormat: { bold: true }
        }},
        fields: 'userEnteredFormat(backgroundColor,textFormat)'
      }
    },
    // Scores title
    {
      repeatCell: {
        range: { sheetId: scoresSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 74 },
        cell: { userEnteredFormat: {
          backgroundColor: RED,
          textFormat: { foregroundColor: WHITE, bold: true, fontSize: 14 }
        }},
        fields: 'userEnteredFormat(backgroundColor,textFormat)'
      }
    },
    // Freeze rows & columns
    { updateSheetProperties: { properties: { sheetId: picksSheetId, gridProperties: { frozenRowCount: 3, frozenColumnCount: 1 } }, fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount' } },
    { updateSheetProperties: { properties: { sheetId: scoresSheetId, gridProperties: { frozenRowCount: 3, frozenColumnCount: 1 } }, fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount' } },
    { updateSheetProperties: { properties: { sheetId: resultsSheetId, gridProperties: { frozenRowCount: 1, frozenColumnCount: 1 } }, fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount' } },
    { updateSheetProperties: { properties: { sheetId: lbSheetId, gridProperties: { frozenRowCount: 3 } }, fields: 'gridProperties.frozenRowCount' } },
  ];

  // Alternate row shading on Picks
  for (let i = 0; i < 22; i++) {
    fmtRequests.push({
      repeatCell: {
        range: { sheetId: picksSheetId, startRowIndex: 3+i, endRowIndex: 4+i, startColumnIndex: 0, endColumnIndex: 73 },
        cell: { userEnteredFormat: { backgroundColor: i % 2 === 0 ? { red:1,green:1,blue:1 } : LIGHT_GRAY } },
        fields: 'userEnteredFormat(backgroundColor)'
      }
    });
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: fmtRequests }
  });

  console.log('✅ All done! Sheet built successfully.');
  console.log(`Open: https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`);
}

main().catch(console.error);
