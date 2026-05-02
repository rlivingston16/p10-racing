/**
 * F1 Auto Results Updater
 * Fetches the F1 2026 race results page, extracts URLs for completed races,
 * and updates the Results tab in the P10 Racing spreadsheet.
 * Run every Monday morning to pick up weekend race results.
 */

const https = require('https');
const { getSheets, SPREADSHEET_ID: SID } = require('../lib/auth');

const sheets = getSheets();

// Map F1 URL slugs to our race round numbers
// Key: slug as it appears in the F1 URL, Value: round number (1-24)
const SLUG_TO_ROUND = {
  'australia':          1,
  'china':              2,
  'japan':              3,
  'bahrain':            4,
  'saudi-arabia':       5,
  'miami':              6,
  'canada':             7,
  'monaco':             8,
  'barcelona-catalunya': 9,  // R9 - Barcelona
  'spain':              16,  // R16 - Madrid (F1 uses "spain" slug for both circuits)
  'madrid':             16,  // fallback
  'austria':            10,
  'great-britain':      11,
  'belgium':            12,
  'hungary':            13,
  'netherlands':        14,
  'italy':              15,
  'madrid':             16,  // Spain R16 (Madrid circuit)
  'azerbaijan':         17,
  'singapore':          18,
  'united-states':      19,
  'mexico':             20,
  'brazil':             21,
  'las-vegas':          22,
  'qatar':              23,
  'abu-dhabi':          24,
};

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      }
    };
    https.get(url, opts, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchPage(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function main() {
  console.log('🏎️  F1 Auto Results Updater');
  console.log('Fetching F1 2026 race results page...');

  const html = await fetchPage('https://www.formula1.com/en/results/2026/races');

  // Extract all race result links matching the pattern
  const linkRegex = /href="(\/en\/results\/2026\/races\/(\d+)\/([^/]+)\/race-result)"/g;
  const found = {};
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const [, path, id, slug] = match;
    const fullUrl = `https://www.formula1.com${path}`;
    const round = SLUG_TO_ROUND[slug];

    if (round) {
      found[round] = { url: fullUrl, slug, id };
      console.log(`  ✅ Round ${round} (${slug}): ${fullUrl}`);
    } else {
      console.log(`  ⚠️  Unknown slug: ${slug} (id: ${id}) — skipping`);
    }
  }

  if (Object.keys(found).length === 0) {
    console.log('No race results found yet — season may not have started or page structure changed.');
    return;
  }

  // Read current Results tab to see which URLs are already filled
  const current = await sheets.spreadsheets.values.get({
    spreadsheetId: SID,
    range: 'Results!A2:D25'  // Rows 2-25, cols A-D (round, name, date, url)
  });

  const rows = current.data.values || [];
  const updates = [];

  for (const row of rows) {
    const round = parseInt(row[0]);
    const currentUrl = row[3] || '';

    if (found[round]) {
      const sheetRow = round + 1;
      if (currentUrl !== found[round].url) {
        updates.push({ range: `Results!D${sheetRow}`, values: [[found[round].url]] });
        console.log(`  📝 Updating Round ${round} URL`);
      } else {
        console.log(`  ⏭️  Round ${round} already up to date`);
      }
    }
  }

  if (updates.length === 0) {
    console.log('No new URLs to update.');
    return;
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SID,
    requestBody: {
      valueInputOption: 'RAW',
      data: updates
    }
  });

  console.log(`\n✅ Done! Updated ${updates.length} race URL(s) in the Results tab.`);
  console.log('Scores and Leaderboard will auto-calculate from the new data.');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
