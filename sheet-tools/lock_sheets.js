/**
 * Lock all sheets in P10 Racing spreadsheet.
 * - Picks tab: locked except B:D pick cells for all 24 race blocks
 * - All other tabs: fully locked (no exceptions)
 * Only the owner (snowtop@gmail.com) can edit protected ranges.
 */

const { getSheets, SPREADSHEET_ID: SID } = require('../lib/auth');

const OWNER = 'snowtop@gmail.com'; // only this user can edit locked ranges
const BLOCK = 25;

const sheets = getSheets();

async function main() {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SID });
  const tabIds = {};
  meta.data.sheets.forEach(s => { tabIds[s.properties.title] = s.properties.sheetId; });

  // First remove any existing protections to avoid duplicates
  console.log('Removing existing protections...');
  const existing = meta.data.sheets.flatMap(s => 
    (s.protectedRanges || []).map(p => ({ deleteProtectedRange: { protectedRangeId: p.protectedRangeId } }))
  );
  if (existing.length > 0) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SID, requestBody: { requests: existing } });
    console.log(`Removed ${existing.length} existing protection(s)`);
  }

  const requests = [];

  // ── PICKS TAB: lock whole sheet, except pick cells B:D for each race ──
  const picksId = tabIds['Picks'];
  const unprotectedRanges = [];
  for (let r = 0; r < 24; r++) {
    const dataStart = r * BLOCK + 2; // 0-based first player row
    const dataEnd   = dataStart + 22;
    unprotectedRanges.push({
      sheetId: picksId,
      startRowIndex: dataStart,
      endRowIndex: dataEnd,
      startColumnIndex: 1, // col B
      endColumnIndex: 4    // col D (exclusive = B, C, D)
    });
  }

  requests.push({ addProtectedRange: { protectedRange: {
    range: { sheetId: picksId },
    description: 'Picks - locked except pick dropdowns',
    warningOnly: false,
    editors: { users: [OWNER] },
    unprotectedRanges
  }}});

  // ── ALL OTHER TABS: fully locked ──
  for (const [name, sheetId] of Object.entries(tabIds)) {
    if (name === 'Picks') continue;
    requests.push({ addProtectedRange: { protectedRange: {
      range: { sheetId },
      description: `${name} - fully locked`,
      warningOnly: false,
      editors: { users: [OWNER] }
    }}});
  }

  console.log('Applying protections...');
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SID, requestBody: { requests } });

  console.log('✅ Done!');
  console.log(`   - Picks tab: locked except B:D pick cells for all 24 races`);
  console.log(`   - Leaderboard, Results, Scores: fully locked`);
  console.log(`   - Only ${OWNER} can edit locked ranges`);
}

main().catch(console.error);
