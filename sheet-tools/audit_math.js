// Full independent scoring audit. For every player × every scored race, recompute
// the expected P10 points and Bonus from the raw picks + finishing order, and
// compare to the cell the sheet actually shows. Also audits that each Scores race
// column references the correct Results row (catches migration off-by-one).
// Read-only.
const path = require('path');
const { google } = require('googleapis');
const SHEET_ID = '1T__0CvsUq5Asq0-raVzxiXXvadfctATZwS7ANA-GQXo';

const PAYOFF = [1,2,4,6,8,10,12,15,18,25,18,15,12,10,8,6,4,2,1,1]; // finish pos 1..20 -> pts; 21,22 -> 0
function colL(n){let s='';while(n>0){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26);}return s;}
const norm = v => (v == null ? '' : String(v).trim());

(async () => {
  const auth = new google.auth.GoogleAuth({ keyFile: path.resolve(__dirname, '../credentials/service-account.json'), scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const sheets = google.sheets({ version: 'v4', auth });

  const [resR, picksR, scoresR, scoresF] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Results!A2:AC25', valueRenderOption: 'FORMATTED_VALUE' }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Picks!A1:D620', valueRenderOption: 'FORMATTED_VALUE' }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Scores!A2:BW25', valueRenderOption: 'FORMATTED_VALUE' }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Scores!B4:BW4', valueRenderOption: 'FORMULA' }),
  ]);
  const results = resR.data.values || [];
  const picks = picksR.data.values || [];
  const scores = scoresR.data.values || [];
  const formRow = (scoresF.data.values || [[]])[0]; // row-4 formulas, starting at col B (index0 = col B)

  // Scores player rows: idx2..(2+21). Match by name (col A).
  const scorePlayers = scores.slice(2).filter(r => norm(r[0]));
  const nameToScoreRow = {};
  scorePlayers.forEach(r => { nameToScoreRow[norm(r[0])] = r; });

  let totalMismatch = 0;
  let refProblems = 0;
  const perRaceIssues = [];

  // Iterate each Results row (calendar position p = j+1; Results sheet row = j+2)
  for (let j = 0; j < results.length; j++) {
    const rr = results[j];
    if (!rr || !norm(rr[1])) continue;              // no race name
    const raceName = norm(rr[1]);
    const p1 = norm(rr[4]);
    if (!p1) continue;                               // not scored yet
    const p = j + 1;                                 // calendar position
    const resultsSheetRow = j + 2;

    // finishing order E..Z = idx 4..25 ; P2 = F(idx5); 1stDNF = AA(idx26); DNFs = AB(idx27); DNS = AC(idx28)
    const order = rr.slice(4, 26).map(norm);         // [P1..P22]
    const resP2 = norm(rr[5]);
    const first = norm(rr[26]);
    const dnfs = norm(rr[27]).split(',').map(s => s.trim()).filter(Boolean);
    const dns  = norm(rr[28]).split(',').map(s => s.trim()).filter(Boolean);

    // --- column reference audit ---
    // Scores P10 col for race p (1-based) = 3p-1 ; formRow index = (col - 2)  (formRow[0] = col B = col2)
    const p10Col1 = 3 * p - 1;
    const f = formRow[p10Col1 - 2] || '';
    const mRef = f.match(/Results!E(\d+):Z\d+/);
    const refRow = mRef ? parseInt(mRef[1]) : null;
    if (refRow !== resultsSheetRow) {
      refProblems++;
      perRaceIssues.push(`  [REF] ${raceName} (${colL(p10Col1)}) formula references Results row ${refRow}, expected ${resultsSheetRow}`);
    }

    // --- Picks block for race p: first player sheet row = 3 + 25*(p-1); array idx = row-1 ---
    const blockStart = 3 + 25 * (p - 1);
    const pickMap = {};
    for (let i = 0; i < 22; i++) {
      const row = picks[(blockStart - 1) + i] || [];
      const nm = norm(row[0]);
      if (nm) pickMap[nm] = { p10: norm(row[1]), p2: norm(row[2]), dnf: norm(row[3]) };
    }

    // Scores cells for race p: P10 col idx (0-based within full row) = 3p-2 ; Bonus = 3p-1
    const p10Idx = 3 * p - 2, bonIdx = 3 * p - 1;

    let raceMismatch = 0;
    for (const name of Object.keys(nameToScoreRow)) {
      const pk = pickMap[name] || { p10: '', p2: '', dnf: '' };
      // expected P10
      let expP10;
      if (pk.p10 === '') expP10 = '';
      else if (dnfs.includes(pk.p10)) expP10 = 0;
      else if (dns.includes(pk.p10)) expP10 = 0;
      else {
        const pos = order.indexOf(pk.p10); // 0-based
        expP10 = (pos >= 0 && pos < 20) ? PAYOFF[pos] : 0;
      }
      // expected Bonus
      let expBon;
      if (pk.p10 === '' && pk.p2 === '' && pk.dnf === '') expBon = '';
      else {
        let b = 0;
        if (pk.p2 && pk.p2 === resP2) b += 5;
        if (pk.dnf.toUpperCase() === 'NO DNF' && first.toUpperCase() === 'NO DNF') b += 10;
        else if (pk.dnf && pk.dnf === first) b += 5;
        expBon = b;
      }
      const sheetRow = nameToScoreRow[name];
      const sP10 = norm(sheetRow[p10Idx]);
      const sBon = norm(sheetRow[bonIdx]);
      const eP10 = expP10 === '' ? '' : String(expP10);
      const eBon = expBon === '' ? '' : String(expBon);

      if (sP10 !== eP10 || sBon !== eBon) {
        raceMismatch++; totalMismatch++;
        if (raceMismatch <= 4) {
          perRaceIssues.push(`  [VAL] ${raceName} · ${name}: pick10="${pk.p10}" p2="${pk.p2}" dnf="${pk.dnf}" | sheet P10=${sP10} Bon=${sBon} | expected P10=${eP10} Bon=${eBon}`);
        }
      }
    }
    if (raceMismatch > 4) perRaceIssues.push(`  ... +${raceMismatch - 4} more mismatches in ${raceName}`);
  }

  console.log('='.repeat(72));
  console.log('SCORING AUDIT — recompute every cell from picks + finishing order');
  console.log('='.repeat(72));
  console.log(`Column-reference problems: ${refProblems}`);
  console.log(`Cell value mismatches:     ${totalMismatch}`);
  console.log('');
  if (perRaceIssues.length) { console.log('DETAILS:'); perRaceIssues.forEach(l => console.log(l)); }
  else console.log('✅ Every scored cell matches an independent recompute. Formulas are correct.');
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
