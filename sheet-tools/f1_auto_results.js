/**
 * F1 Auto Results Updater
 *
 * Fetches the F1 2026 race results page, extracts URLs for every published race,
 * and writes them into Results!D for races that have already happened.
 *
 * Matching is by race NAME (Results!B) — not by F1's canonical round number —
 * because the sheet uses a sequential 1..N numbering for the abbreviated 22-race
 * 2026 season (Bahrain + Saudi Arabia dropped). Round-number matching produced
 * a 2-round offset for every race after Miami, leaking real results into the
 * wrong rows. Date gating (Results!C) also clears stale URLs from rows whose
 * race hasn't happened yet.
 *
 * Run after a race weekend. Idempotent: re-running does nothing for rows
 * already in the correct state.
 */

const https = require('https');
const { getSheets, SPREADSHEET_ID: SID } = require('../lib/auth');

const sheets = getSheets();

// Map F1's URL slug → the race name as it appears in Results!B (exact, case-sensitive).
// Bahrain + Saudi Arabia are kept here so the mapping survives a future re-add,
// even though they're absent from the current sheet.
const SLUG_TO_NAME = {
  'australia':           'Australia',
  'china':               'China',
  'japan':               'Japan',
  'bahrain':             'Bahrain',
  'saudi-arabia':        'Saudi Arabia',
  'miami':               'Miami',
  'canada':              'Canada',
  'monaco':              'Monaco',
  'barcelona-catalunya': 'Spain (Barcelona)',
  'spain':               'Spain (Madrid)',
  'madrid':              'Spain (Madrid)',
  'austria':             'Austria',
  'great-britain':       'Great Britain',
  'belgium':             'Belgium',
  'hungary':             'Hungary',
  'netherlands':         'Netherlands',
  'italy':               'Italy',
  'azerbaijan':          'Azerbaijan',
  'singapore':           'Singapore',
  'united-states':       'USA',
  'mexico':              'Mexico',
  'brazil':              'Brazil',
  'las-vegas':           'Las Vegas',
  'qatar':               'Qatar',
  'abu-dhabi':           'Abu Dhabi',
};

const SEASON_YEAR = 2026;

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      }
    };
    https.get(url, opts, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchPage(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// Sheet stores dates as "M/D" (e.g. "5/24"). Year is implicit from the season.
function parseRaceDate(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  return new Date(SEASON_YEAR, parseInt(m[1], 10) - 1, parseInt(m[2], 10));
}

async function main() {
  console.log('🏎️  F1 Auto Results Updater');
  console.log(`Fetching F1 ${SEASON_YEAR} race results page...`);

  const html = await fetchPage(`https://www.formula1.com/en/results/${SEASON_YEAR}/races`);

  const raceRegex = new RegExp(
    `href="(\\/en\\/results\\/${SEASON_YEAR}\\/races\\/(\\d+)\\/([^/]+)\\/race-result)"`,
    'g'
  );
  const sprintRegex = new RegExp(
    `href="(\\/en\\/results\\/${SEASON_YEAR}\\/races\\/(\\d+)\\/([^/]+)\\/sprint-result)"`,
    'g'
  );

  const found = {};  // race name → URL  (sprints get the "(Sprint)" suffix to match Results!B)
  let match;

  // Main-race result URLs
  while ((match = raceRegex.exec(html)) !== null) {
    const [, path, , slug] = match;
    const fullUrl = `https://www.formula1.com${path}`;
    const name = SLUG_TO_NAME[slug];
    if (name) {
      if (!found[name]) {
        found[name] = fullUrl;
        console.log(`  ✅ ${name} (${slug}): ${fullUrl}`);
      }
    } else {
      console.log(`  ⚠️  Unknown slug: ${slug} — skipping`);
    }
  }

  // Sprint result URLs (same id/slug as main race, but /sprint-result instead of /race-result).
  // F1.com publishes them on the same season page. They land in our Results!B rows as
  // "{race name} (Sprint)" — see add_sprint_races migration for the (Sprint) suffix convention.
  while ((match = sprintRegex.exec(html)) !== null) {
    const [, path, , slug] = match;
    const fullUrl = `https://www.formula1.com${path}`;
    const baseName = SLUG_TO_NAME[slug];
    if (!baseName) continue;
    const sprintName = `${baseName} (Sprint)`;
    if (!found[sprintName]) {
      found[sprintName] = fullUrl;
      console.log(`  ✅ ${sprintName} (${slug} sprint): ${fullUrl}`);
    }
  }

  if (Object.keys(found).length === 0) {
    console.log('No race URLs found — season may not have started or page structure changed.');
    return;
  }

  // Read Results A:D so we can match by name (col B) and check date (col C).
  const current = await sheets.spreadsheets.values.get({
    spreadsheetId: SID,
    range: 'Results!A2:D30',
  });

  const rows = current.data.values || [];
  const updates = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = (row[1] || '').trim();
    const dateStr = (row[2] || '').trim();
    const currentUrl = row[3] || '';
    const sheetRow = i + 2;  // A2 starts at row 2

    if (!name) continue;

    const raceDate = parseRaceDate(dateStr);
    const isFuture = !raceDate || raceDate > today;

    if (isFuture) {
      if (currentUrl) {
        updates.push({ range: `Results!D${sheetRow}`, values: [['']] });
        console.log(`  🧹 Clearing stale URL for upcoming race: ${name} (${dateStr || 'no date'})`);
      }
      continue;
    }

    const targetUrl = found[name];
    if (!targetUrl) {
      console.log(`  ⚠️  ${name} — race date has passed but no URL published yet`);
      continue;
    }

    if (currentUrl !== targetUrl) {
      updates.push({ range: `Results!D${sheetRow}`, values: [[targetUrl]] });
      console.log(`  📝 Updating ${name} URL`);
    } else {
      console.log(`  ⏭️  ${name} already up to date`);
    }
  }

  if (updates.length === 0) {
    console.log('\n✅ Nothing to update — sheet is already in sync.');
    return;
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SID,
    requestBody: {
      valueInputOption: 'RAW',
      data: updates,
    }
  });

  console.log(`\n✅ Done! Applied ${updates.length} cell update(s) in the Results tab.`);
  console.log('Scores and Leaderboard will auto-calculate from the new data.');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
