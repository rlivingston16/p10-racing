const { getSheets } = require('../lib/auth');

// NOTE: this script targets a different (older) sheet ID than the main P10 sheet.
// See PROJECT.md > "Sheet IDs" if you need to point it at the live sheet.
const SHEET_ID = '1YkH5FIIwmE_LiMsLrOpiyxaoO1juZh9Bt5M7xfcQ7ok';
const sheets = getSheets();

function stripCode(name) {
  // Remove trailing 3-letter uppercase code e.g. "Lando NorrisNOR" -> "Lando Norris"
  return name.replace(/[A-Z]{3}$/, '').trim();
}

function parsePosition(pos) {
  // "P1" -> 1, "P10" -> 10, etc.
  const m = pos.match(/^P(\d+)$/);
  return m ? parseInt(m[1]) : null;
}

async function getTab(tab) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A1:N400`
  });
  return res.data.values || [];
}

function extractRaces(rows) {
  const races = [];
  let currentRace = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    // Check if col K has a position label (P1-P20)
    const posCell = row[9];  // col J (0-indexed)
    const driverCell = row[10]; // col K
    const scoreCell = row[11]; // col L

    // Race header row: col A has race name, col K has "Driver"
    const isRaceHeader = row[0] && (row[0].includes('GRAND PRIX') || row[0].includes('Grand Prix') || row[0].includes('PRIX') || row[0].includes('GRAN PREMIO') || row[0].includes('GRANDE PR'));
    if (driverCell === 'Driver' || isRaceHeader) {
      if (isRaceHeader) {
        currentRace = { name: row[0], results: [] };
        races.push(currentRace);
      }
      continue;
    }

    if (currentRace && posCell && driverCell) {
      const pos = parsePosition(posCell);
      if (pos !== null) {
        const driver = stripCode(driverCell);
        const dnf = scoreCell === 'DNF' || scoreCell === 'dnf';
        if (driver) {
          currentRace.results.push({ pos, driver, dnf });
        }
      }
    }
  }
  return races;
}

async function run() {
  const rows1 = await getTab('Race 1-12');
  const rows2 = await getTab('Race 13-24');

  const races1 = extractRaces(rows1);
  const races2 = extractRaces(rows2);
  const allRaces = [...races1, ...races2];

  console.log(`Found ${allRaces.length} races total\n`);

  // Tally positions per driver
  const driverStats = {}; // driver -> { positions: [], dnfs: 0 }

  for (const race of allRaces) {
    for (const { pos, driver, dnf } of race.results) {
      if (!driver) continue;
      if (!driverStats[driver]) driverStats[driver] = { positions: [], dnfs: 0 };
      driverStats[driver].positions.push(pos);
      if (dnf) driverStats[driver].dnfs++;
    }
  }

  // Sort by average position
  const sorted = Object.entries(driverStats)
    .map(([driver, { positions, dnfs }]) => {
      const avg = positions.reduce((a, b) => a + b, 0) / positions.length;
      return { driver, avg, races: positions.length, dnfs, positions };
    })
    .sort((a, b) => a.avg - b.avg);

  console.log('DRIVER AVERAGE FINISHING POSITION — 2025 F1 SEASON');
  console.log('='.repeat(60));
  console.log(`${'Driver'.padEnd(25)} ${'Avg Pos'.padEnd(10)} ${'Races'.padEnd(8)} DNFs`);
  console.log('-'.repeat(60));
  for (const { driver, avg, races, dnfs } of sorted) {
    console.log(`${driver.padEnd(25)} ${avg.toFixed(2).padEnd(10)} ${String(races).padEnd(8)} ${dnfs}`);
  }
}

run().catch(console.error);
