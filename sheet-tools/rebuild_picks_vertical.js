const { getSheets, SPREADSHEET_ID } = require('../lib/auth');

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

// 2026 F1 drivers
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

// Layout: 25 rows per race block
// Row 1: race header (merged A:D)
// Row 2: column headers
// Rows 3-24: 22 players
// Row 25: empty separator
const BLOCK_SIZE = 25;
const HEADER_ROWS = 2; // within each block before player data

// Returns 1-based sheet row for player p (0-based) in race r (0-based)
function playerRow(race, player) {
  return race * BLOCK_SIZE + HEADER_ROWS + 1 + player;
}
// Returns 1-based sheet row for race header
function raceHeaderRow(race) {
  return race * BLOCK_SIZE + 1;
}

async function main() {
  console.log('Getting sheet IDs...');
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const tabIds = {};
  meta.data.sheets.forEach(s => { tabIds[s.properties.title] = s.properties.sheetId; });

  const picksId = tabIds['Picks'];
  const scoresId = tabIds['Scores'];

  // ── BUILD PICKS DATA ──────────────────────────────────────────────────────
  console.log('Building vertical Picks layout...');
  const picksData = [];

  for (let r = 0; r < 24; r++) {
    const [round, name, date] = RACES[r];
    // Race header row
    picksData.push([`Round ${round} — ${name} — Race Day: ${date}`, '', '', '']);
    // Column headers
    picksData.push(['Player', 'P10 Pick', 'P2 Pick', 'DNF Pick']);
    // Player rows
    for (let p = 0; p < 22; p++) {
      picksData.push([PLAYERS[p], '', '', '']);
    }
    // Empty separator
    picksData.push(['', '', '', '']);
  }

  // Clear and rewrite Picks
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Picks!A1:D700'
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Picks!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: picksData }
  });

  // ── UNFREEZE FIRST (required before merging across all columns) ───────────
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: [{
      updateSheetProperties: {
        properties: { sheetId: picksId, gridProperties: { frozenColumnCount: 0, frozenRowCount: 0 } },
        fields: 'gridProperties.frozenColumnCount,gridProperties.frozenRowCount'
      }
    }]}
  });

  // ── FORMATTING ─────────────────────────────────────────────────────────────
  console.log('Applying formatting...');
  const RED      = { red: 0.545, green: 0.102, blue: 0.102 };
  const WHITE    = { red: 1, green: 1, blue: 1 };
  const DARK     = { red: 0.2, green: 0.2, blue: 0.2 };
  const LGRAY    = { red: 0.93, green: 0.93, blue: 0.93 };

  const fmtRequests = [];

  for (let r = 0; r < 24; r++) {
    const headerRow1 = raceHeaderRow(r) - 1; // 0-based
    const headerRow2 = headerRow1 + 1;
    const dataStart  = headerRow2 + 1;
    const dataEnd    = dataStart + 22;

    // Race title row — red background, white bold text
    fmtRequests.push({
      repeatCell: {
        range: { sheetId: picksId, startRowIndex: headerRow1, endRowIndex: headerRow1+1, startColumnIndex: 0, endColumnIndex: 4 },
        cell: { userEnteredFormat: {
          backgroundColor: RED,
          textFormat: { foregroundColor: WHITE, bold: true, fontSize: 11 },
          horizontalAlignment: 'CENTER'
        }},
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
      }
    });

    // Merge race title across A:D
    fmtRequests.push({
      mergeCells: {
        range: { sheetId: picksId, startRowIndex: headerRow1, endRowIndex: headerRow1+1, startColumnIndex: 0, endColumnIndex: 4 },
        mergeType: 'MERGE_ALL'
      }
    });

    // Column header row — dark background
    fmtRequests.push({
      repeatCell: {
        range: { sheetId: picksId, startRowIndex: headerRow2, endRowIndex: headerRow2+1, startColumnIndex: 0, endColumnIndex: 4 },
        cell: { userEnteredFormat: {
          backgroundColor: DARK,
          textFormat: { foregroundColor: WHITE, bold: true }
        }},
        fields: 'userEnteredFormat(backgroundColor,textFormat)'
      }
    });

    // Alternating row shading for player rows
    for (let p = 0; p < 22; p++) {
      fmtRequests.push({
        repeatCell: {
          range: { sheetId: picksId, startRowIndex: dataStart+p, endRowIndex: dataStart+p+1, startColumnIndex: 0, endColumnIndex: 4 },
          cell: { userEnteredFormat: {
            backgroundColor: p % 2 === 0 ? WHITE : LGRAY
          }},
          fields: 'userEnteredFormat(backgroundColor)'
        }
      });
    }
  }

  // No frozen columns — merging across all 4 cols is incompatible with frozen col 1

  // Set column widths: A=160, B/C/D=140
  fmtRequests.push({
    updateDimensionProperties: {
      range: { sheetId: picksId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
      properties: { pixelSize: 160 }, fields: 'pixelSize'
    }
  });
  fmtRequests.push({
    updateDimensionProperties: {
      range: { sheetId: picksId, dimension: 'COLUMNS', startIndex: 1, endIndex: 4 },
      properties: { pixelSize: 140 }, fields: 'pixelSize'
    }
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: fmtRequests }
  });

  // ── ADD DRIVER DROPDOWNS ─────────────────────────────────────────────────
  console.log('Adding driver dropdowns...');
  const dropdownRequests = [];

  for (let r = 0; r < 24; r++) {
    const dataStart = raceHeaderRow(r) - 1 + 2; // 0-based row of first player
    const dataEnd   = dataStart + 22;

    // P10 and P2 picks (cols B, C = index 1, 2): driver dropdown
    dropdownRequests.push({
      setDataValidation: {
        range: { sheetId: picksId, startRowIndex: dataStart, endRowIndex: dataEnd, startColumnIndex: 1, endColumnIndex: 3 },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: DRIVERS_2026.map(d => ({ userEnteredValue: d }))
          },
          showCustomUi: true,
          strict: true  // reject free text — typed names like "Stroll" silently break MATCH-based scoring
        }
      }
    });

    // DNF pick (col D = index 3): driver dropdown + NO DNF option
    dropdownRequests.push({
      setDataValidation: {
        range: { sheetId: picksId, startRowIndex: dataStart, endRowIndex: dataEnd, startColumnIndex: 3, endColumnIndex: 4 },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: ['NO DNF', ...DRIVERS_2026].map(d => ({ userEnteredValue: d }))
          },
          showCustomUi: true,
          strict: true
        }
      }
    });
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: dropdownRequests }
  });

  // ── REBUILD SCORES FORMULAS for vertical picks layout ────────────────────
  console.log('Rebuilding Scores tab formulas for new layout...');

  const SCORE_ARR = '{1,2,4,6,8,10,12,15,18,25,18,15,12,10,8,6,4,2,1,1}';

  function col(n) {
    let s = '', i = n + 1;
    while (i > 0) { s = String.fromCharCode(65 + (i - 1) % 26) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }

  const scoresRow1 = ['P10 Racing 2026 - Scores (auto-calculated)'];
  const scoresRow2 = ['Player'];
  const scoresRow3 = [''];

  for (let r = 1; r <= 24; r++) {
    const [round, name] = RACES[r-1];
    scoresRow2.push(`R${round} - ${name}`, '', '');
    scoresRow3.push('P10 Pts', 'Bonus', 'Win $');
  }
  const seasonCol = col(3 * 24 + 1);
  const payoutCol = col(3 * 24 + 2);
  scoresRow2.push('SEASON TOTAL', 'TOTAL PAYOUT');
  scoresRow3.push('Points', '$');

  const scoresData = [scoresRow1, scoresRow2, scoresRow3];

  for (let p = 0; p < PLAYERS.length; p++) {
    const scoreRow = p + 4;
    const row = [PLAYERS[p]];

    for (let r = 0; r < 24; r++) {
      const raceNum = r + 1;
      const pickRow = playerRow(r, p); // 1-based sheet row in Picks

      const p10Pick = `Picks!B${pickRow}`;
      const p2Pick  = `Picks!C${pickRow}`;
      const dnfPick = `Picks!D${pickRow}`;

      const resRowNum = r + 2; // Results tab row (row 2 = race 1)
      const resP2  = `Results!F${resRowNum}`;  // P2 = col F (index 5)
      const resP10Range = `Results!E${resRowNum}:Z${resRowNum}`; // P1-P22 = E:Z
      const resDNF  = `Results!AA${resRowNum}`; // First DNF
      const resDNFs = `Results!AB${resRowNum}`; // hidden DNFs list (used by scoring)
      const resDNS  = `Results!AC${resRowNum}`; // hidden DNS list (used by scoring)

      // P10 score: 0 if pick is in DNFs/DNS list, otherwise position-based score
      const p10Score = `=IFERROR(IF(${p10Pick}="","",IF(IFERROR(MATCH(${p10Pick},SPLIT(${resDNFs},", ",FALSE),0),0)>0,0,IF(IFERROR(MATCH(${p10Pick},SPLIT(${resDNS},", ",FALSE),0),0)>0,0,IFERROR(INDEX(${SCORE_ARR},MATCH(${p10Pick},${resP10Range},0)),0)))),"")`;

      // Bonus (P2 + DNF)
      const bonus = `=IF(${p10Pick}="",0,IF(${p2Pick}=${resP2},5,0)+IF(AND(UPPER(${dnfPick})="NO DNF",${resDNF}="NO DNF"),10,IF(${dnfPick}=${resDNF},5,0)))`;

      // Payout — $10 if this player's P10 score = max for the race
      const p10ScoreColLetter = col(3 * r + 1);
      const p10RaceRange = `${p10ScoreColLetter}$4:${p10ScoreColLetter}$25`;
      const payout = `=IF(${p10ScoreColLetter}${scoreRow}="","",IF(AND(${p10ScoreColLetter}${scoreRow}>0,${p10ScoreColLetter}${scoreRow}=MAX(${p10RaceRange})),"$10",""))`;

      row.push(p10Score, bonus, payout);
    }

    // Season total
    const p10Refs = Array.from({length: 24}, (_, r) => `${col(3*r+1)}${scoreRow}`);
    const bonRefs = Array.from({length: 24}, (_, r) => `${col(3*r+2)}${scoreRow}`);
    row.push(`=SUM(${p10Refs.join(',')})+SUM(${bonRefs.join(',')})`);

    // Total payout — sum booleans (COUNTIF can't take individual cells, needs a range)
    const winRefs = Array.from({length: 24}, (_, r) => `(${col(3*r+3)}${scoreRow}="$10")`);
    row.push(`=(${winRefs.join('+')})*10`);

    scoresData.push(row);
  }

  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Scores!A1:BT30'
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Scores!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: scoresData }
  });

  console.log('✅ Done! Picks tab is now vertical with dropdowns. Scores updated.');
}

main().catch(console.error);
