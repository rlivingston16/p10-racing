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

const SCORE_ARR = '{1,2,4,6,8,10,12,15,18,25,18,15,12,10,8,6,4,2,1,1}';
const BLOCK = 25;

function col(n) {
  let s = '', i = n + 1;
  while (i > 0) { s = String.fromCharCode(65 + (i - 1) % 26) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

// Picks layout: race r (0-based), player p (0-based)
// Row = r*BLOCK + 3 + p (1-based)
function pickRow(r, p) { return r * BLOCK + 3 + p; }

// Scores layout: 3 cols per race (P10pts, Bonus, Win$)
// Col A = player name, Race r (0-based) starts at col index 3r+1
function scoresCol(r, type) { return col(3 * r + 1 + type); } // type 0=P10pts,1=Bonus,2=Win$

const seasonCol = col(3 * 24 + 1); // BV
const payoutCol = col(3 * 24 + 2); // BW

async function main() {
  console.log('Rebuilding Scores tab with fixed formulas...');

  const scoresRow1 = ['P10 Racing 2026 - Scores (auto-calculated)'];
  const scoresRow2 = ['Player'];
  const scoresRow3 = [''];

  for (let r = 0; r < 24; r++) {
    const [round, name] = RACES[r];
    scoresRow2.push(`R${round} - ${name}`, '', '');
    scoresRow3.push('P10 Pts', 'Bonus', 'Win $');
  }
  scoresRow2.push('SEASON TOTAL', 'TOTAL PAYOUT');
  scoresRow3.push('Points', '$');

  const scoresData = [scoresRow1, scoresRow2, scoresRow3];

  for (let p = 0; p < PLAYERS.length; p++) {
    const scoreRow = p + 4;
    const row = [PLAYERS[p]];

    for (let r = 0; r < 24; r++) {
      const resRowNum = r + 2; // Results row: race 0 = row 2

      const p10Pick = `Picks!B${pickRow(r, p)}`;
      const p2Pick  = `Picks!C${pickRow(r, p)}`;
      const dnfPick = `Picks!D${pickRow(r, p)}`;

      const resP2       = `Results!F${resRowNum}`;           // P2 driver col F
      const resP10Range = `Results!E${resRowNum}:X${resRowNum}`; // P1-P20 cols E:X (FIXED)
      const resDNF      = `Results!Y${resRowNum}`;           // First DNF col Y

      // P10 score
      const p10Score = `=IFERROR(IF(${p10Pick}="","",IFERROR(INDEX(${SCORE_ARR},MATCH(${p10Pick},${resP10Range},0)),0)),"")`;
      // Bonus
      const bonus = `=IF(${p10Pick}="",0,IF(${p2Pick}=${resP2},5,0)+IF(AND(UPPER(${dnfPick})="NO DNF",${resDNF}="NO DNF"),10,IF(${dnfPick}=${resDNF},5,0)))`;
      // Payout
      const p10ScoreCol = scoresCol(r, 0);
      const payout = `=IF(${p10ScoreCol}${scoreRow}="","",IF(AND(${p10ScoreCol}${scoreRow}>0,${p10ScoreCol}${scoreRow}=MAX(${p10ScoreCol}$4:${p10ScoreCol}$25)),"$10",""))`;

      row.push(p10Score, bonus, payout);
    }

    // Season total
    const p10Refs = Array.from({length: 24}, (_, r) => `${scoresCol(r,0)}${scoreRow}`);
    const bonRefs = Array.from({length: 24}, (_, r) => `${scoresCol(r,1)}${scoreRow}`);
    row.push(`=SUM(${p10Refs.join(',')})+SUM(${bonRefs.join(',')})`);

    // Total payout
    const winRefs = Array.from({length: 24}, (_, r) => `(${scoresCol(r,2)}${scoreRow}="$10")`);
    row.push(`=(${winRefs.join('+')})*10`);

    scoresData.push(row);
  }

  await sheets.spreadsheets.values.clear({ spreadsheetId: SID, range: 'Scores!A1:BZ30' });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SID,
    range: 'Scores!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: scoresData }
  });

  console.log('✅ Scores rebuilt — #REF! errors fixed.');
}

main().catch(console.error);
