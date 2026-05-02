const { getSheets } = require('../lib/auth');

const sheets = getSheets();

const races = [
  [3,   'AWS HUNGARIAN GRAND PRIX (Round 13 - 7/26)'],
  [28,  'HEINEKEN DUTCH GRAND PRIX (Round 14 - 8/23)'],
  [53,  "PIRELLI GRAN PREMIO D'ITALIA (Round 15 - 9/6)"],
  [78,  'TAG HEUER GRAN PREMIO DE ESPANA (Round 16 - 9/13)'],
  [103, 'QATAR AIRWAYS AZERBAIJAN GRAND PRIX (Round 17 - 9/26)'],
  [128, 'SINGAPORE AIRLINES SINGAPORE GRAND PRIX (Round 18 - 10/11)'],
  [153, 'MSC CRUISES UNITED STATES GRAND PRIX (Round 19 - 10/25)'],
  [178, 'GRAN PREMIO DE LA CIUDAD DE MEXICO (Round 20 - 11/1)'],
  [203, 'MSC CRUISES GRANDE PREMIO DE SAO PAULO (Round 21 - 11/8)'],
  [228, 'HEINEKEN LAS VEGAS GRAND PRIX (Round 22 - 11/21)'],
  [253, 'QATAR AIRWAYS QATAR GRAND PRIX (Round 23 - 11/29)'],
  [278, 'ETIHAD AIRWAYS ABU DHABI GRAND PRIX (Round 24 - 12/6)'],
];

sheets.spreadsheets.values.batchUpdate({
  spreadsheetId: '10BgjRCjwf9AsvA4PEGePOdg3pR7GOjupRf6MLobNov8',
  requestBody: {
    valueInputOption: 'RAW',
    data: races.map(([row, name]) => ({ range: `Race 13-24!A${row}`, values: [[name]] }))
  }
}).then(r => console.log('Done! Updated', r.data.totalUpdatedCells, 'cells')).catch(e => console.error(e.message));
