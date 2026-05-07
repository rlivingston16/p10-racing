const { getSheets, SPREADSHEET_ID: SID } = require('../lib/auth');

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

const DRIVERS_2026 = [
  'Lando Norris','Oscar Piastri','Max Verstappen','Liam Lawson',
  'Charles Leclerc','Lewis Hamilton','George Russell','Kimi Antonelli',
  'Fernando Alonso','Lance Stroll','Pierre Gasly','Jack Doohan',
  'Alex Albon','Carlos Sainz','Esteban Ocon','Oliver Bearman',
  'Nico Hulkenberg','Gabriel Bortoleto','Yuki Tsunoda','Isack Hadjar'
];

const BLOCK = 25; // rows per race block

async function main() {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SID });
  const pickSheet = meta.data.sheets.find(s => s.properties.title === 'Picks');
  const picksId = pickSheet.properties.sheetId;

  // Step 1: Delete the sheet and recreate it fresh (cleanest way to remove all formatting)
  const tabsToKeep = meta.data.sheets.filter(s => s.properties.title !== 'Picks');
  
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SID,
    requestBody: { requests: [
      { deleteSheet: { sheetId: picksId } },
      { addSheet: { properties: { title: 'Picks', index: 1 } } }
    ]}
  });

  // Get new sheet ID
  const meta2 = await sheets.spreadsheets.get({ spreadsheetId: SID });
  const newPicksId = meta2.data.sheets.find(s => s.properties.title === 'Picks').properties.sheetId;
  console.log('Fresh Picks sheet created, id:', newPicksId);

  // Step 2: Build data
  const picksData = [];
  for (let r = 0; r < 24; r++) {
    const [round, name, date] = RACES[r];
    picksData.push([`Round ${round} — ${name} — Race Day: ${date}`, '', '', '']);
    picksData.push(['Player', 'P10 Pick', 'P2 Pick', 'DNF Pick']);
    for (let p = 0; p < 22; p++) {
      picksData.push([PLAYERS[p], '', '', '']);
    }
    picksData.push(['', '', '', '']);
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: SID,
    range: 'Picks!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: picksData }
  });
  console.log('Data written');

  // Step 3: Formatting
  const RED    = { red: 0.545, green: 0.102, blue: 0.102 };
  const WHITE  = { red: 1, green: 1, blue: 1 };
  const DARK   = { red: 0.15, green: 0.15, blue: 0.15 };
  const LGRAY  = { red: 0.93, green: 0.93, blue: 0.93 };

  const fmtReqs = [];

  for (let r = 0; r < 24; r++) {
    const titleRow  = r * BLOCK;        // 0-based
    const headerRow = r * BLOCK + 1;
    const dataStart = r * BLOCK + 2;
    const dataEnd   = r * BLOCK + 24;   // 22 players

    // Race title row: red bg, white bold, merged
    fmtReqs.push({ repeatCell: {
      range: { sheetId: newPicksId, startRowIndex: titleRow, endRowIndex: titleRow+1, startColumnIndex: 0, endColumnIndex: 4 },
      cell: { userEnteredFormat: { backgroundColor: RED, textFormat: { foregroundColor: WHITE, bold: true, fontSize: 11 }, horizontalAlignment: 'CENTER' }},
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
    }});
    fmtReqs.push({ mergeCells: {
      range: { sheetId: newPicksId, startRowIndex: titleRow, endRowIndex: titleRow+1, startColumnIndex: 0, endColumnIndex: 4 },
      mergeType: 'MERGE_ALL'
    }});

    // Column header row: dark bg, white bold
    fmtReqs.push({ repeatCell: {
      range: { sheetId: newPicksId, startRowIndex: headerRow, endRowIndex: headerRow+1, startColumnIndex: 0, endColumnIndex: 4 },
      cell: { userEnteredFormat: { backgroundColor: DARK, textFormat: { foregroundColor: WHITE, bold: true } }},
      fields: 'userEnteredFormat(backgroundColor,textFormat)'
    }});

    // Player rows: alternating white/light gray, black text
    for (let p = 0; p < 22; p++) {
      fmtReqs.push({ repeatCell: {
        range: { sheetId: newPicksId, startRowIndex: dataStart+p, endRowIndex: dataStart+p+1, startColumnIndex: 0, endColumnIndex: 4 },
        cell: { userEnteredFormat: { backgroundColor: p % 2 === 0 ? WHITE : LGRAY, textFormat: { foregroundColor: { red:0, green:0, blue:0 }, bold: false } }},
        fields: 'userEnteredFormat(backgroundColor,textFormat)'
      }});
    }
  }

  // Column widths
  fmtReqs.push({ updateDimensionProperties: { range: { sheetId: newPicksId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 160 }, fields: 'pixelSize' }});
  fmtReqs.push({ updateDimensionProperties: { range: { sheetId: newPicksId, dimension: 'COLUMNS', startIndex: 1, endIndex: 4 }, properties: { pixelSize: 140 }, fields: 'pixelSize' }});

  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SID, requestBody: { requests: fmtReqs } });
  console.log('Formatting applied');

  // Step 4: Driver dropdowns
  const dropReqs = [];
  for (let r = 0; r < 24; r++) {
    const dataStart = r * BLOCK + 2;
    const dataEnd   = dataStart + 22;
    dropReqs.push({ setDataValidation: {
      range: { sheetId: newPicksId, startRowIndex: dataStart, endRowIndex: dataEnd, startColumnIndex: 1, endColumnIndex: 3 },
      rule: { condition: { type: 'ONE_OF_LIST', values: DRIVERS_2026.map(d => ({ userEnteredValue: d })) }, showCustomUi: true, strict: true }
    }});
    dropReqs.push({ setDataValidation: {
      range: { sheetId: newPicksId, startRowIndex: dataStart, endRowIndex: dataEnd, startColumnIndex: 3, endColumnIndex: 4 },
      rule: { condition: { type: 'ONE_OF_LIST', values: ['NO DNF', ...DRIVERS_2026].map(d => ({ userEnteredValue: d })) }, showCustomUi: true, strict: true }
    }});
  }
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SID, requestBody: { requests: dropReqs } });
  console.log('✅ Picks tab rebuilt clean from scratch.');
}

main().catch(console.error);
