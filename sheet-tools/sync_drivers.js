/**
 * F1 Driver Sync
 * Scrapes the F1 drivers page, extracts all current driver names,
 * and updates the dropdown validation on the Picks tab.
 * Scheduled weekly to catch mid-season replacements.
 */

const https = require('https');
const { getSheets, SPREADSHEET_ID: SID } = require('../lib/auth');

const sheets = getSheets();

const BLOCK = 25; // rows per race block in Picks tab

// Words that should NOT be capitalized in names (e.g. "de", "van")
const LOWERCASE_WORDS = new Set(['de', 'van', 'der', 'den', 'le', 'la', 'el']);

function slugToName(slug) {
  return slug.split('-').map((word, i) => {
    if (i > 0 && LOWERCASE_WORDS.has(word)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');
}

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const opts = { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120' } };
    https.get(url, opts, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchPage(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function main() {
  console.log('🏎️  F1 Driver Sync');
  console.log('Fetching F1 2026 drivers page...');

  const html = await fetchPage('https://www.formula1.com/en/drivers');

  // Extract unique driver slugs from /en/drivers/{slug} links
  const slugRegex = /\/en\/drivers\/([a-z][a-z-]+[a-z])"/g;
  const slugs = new Set();
  let m;
  while ((m = slugRegex.exec(html)) !== null) {
    const slug = m[1];
    // Filter out non-driver pages (e.g. "hall-of-fame", "all")
    if (!slug.includes('hall') && slug !== 'all' && slug.split('-').length >= 2) {
      slugs.add(slug);
    }
  }

  const drivers = Array.from(slugs).map(slugToName).sort();
  console.log(`Found ${drivers.length} drivers:`);
  drivers.forEach(d => console.log(`  - ${d}`));

  if (drivers.length < 15) {
    console.log('⚠️  Too few drivers found — page structure may have changed. Aborting to avoid overwriting valid data.');
    return;
  }

  // Get Picks sheet ID
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SID });
  const picksSheet = meta.data.sheets.find(s => s.properties.title === 'Picks');
  const picksId = picksSheet.properties.sheetId;

  // Build dropdown values: drivers + NO DNF option for DNF column
  const driverValues = drivers.map(d => ({ userEnteredValue: d }));
  const dnfValues = [{ userEnteredValue: 'NO DNF' }, ...driverValues];

  // Auto-detect race count from Picks tab structure.
  // Race header rows start with "Round " (e.g. "Round 6 — Miami — Race Day: 5/3").
  // build_p10.js scaffolds 24, mid-season the sheet may have fewer.
  const colA = await sheets.spreadsheets.values.get({
    spreadsheetId: SID,
    range: 'Picks!A1:A1000'
  });
  const numRaces = (colA.data.values || []).filter(row => row[0] && row[0].startsWith('Round ')).length;
  if (numRaces === 0) {
    console.log('⚠️  No race header rows found in Picks tab — sheet may not be initialized. Aborting.');
    return;
  }
  console.log(`Detected ${numRaces} race blocks in Picks tab.`);

  // Update dropdowns for all detected race blocks
  const requests = [];
  for (let r = 0; r < numRaces; r++) {
    const dataStart = r * BLOCK + 2; // 0-based first player row
    const dataEnd   = dataStart + 22;

    // P10 and P2 picks (cols B, C = index 1, 2)
    requests.push({ setDataValidation: {
      range: { sheetId: picksId, startRowIndex: dataStart, endRowIndex: dataEnd, startColumnIndex: 1, endColumnIndex: 3 },
      rule: { condition: { type: 'ONE_OF_LIST', values: driverValues }, showCustomUi: true, strict: true }
    }});

    // DNF pick (col D = index 3): drivers + NO DNF
    requests.push({ setDataValidation: {
      range: { sheetId: picksId, startRowIndex: dataStart, endRowIndex: dataEnd, startColumnIndex: 3, endColumnIndex: 4 },
      rule: { condition: { type: 'ONE_OF_LIST', values: dnfValues }, showCustomUi: true, strict: true }
    }});
  }

  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SID, requestBody: { requests } });

  console.log(`\n✅ Dropdowns updated with ${drivers.length} drivers across all ${numRaces} race blocks (strict mode — free text rejected).`);
  
  // Report any changes from the previous known list
  const knownDrivers = [
    'Lando Norris','Oscar Piastri','Max Verstappen','Liam Lawson',
    'Charles Leclerc','Lewis Hamilton','George Russell','Kimi Antonelli',
    'Fernando Alonso','Lance Stroll','Pierre Gasly','Jack Doohan',
    'Alex Albon','Carlos Sainz','Esteban Ocon','Oliver Bearman',
    'Nico Hulkenberg','Gabriel Bortoleto','Yuki Tsunoda','Isack Hadjar'
  ];
  
  const added   = drivers.filter(d => !knownDrivers.includes(d));
  const removed = knownDrivers.filter(d => !drivers.includes(d));
  
  if (added.length)   console.log(`\n🆕 New drivers added: ${added.join(', ')}`);
  if (removed.length) console.log(`❌ Drivers no longer listed: ${removed.join(', ')}`);
  if (!added.length && !removed.length) console.log('\n✓ No lineup changes detected.');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
