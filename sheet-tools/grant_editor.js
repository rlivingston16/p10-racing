/**
 * Grant an email Editor access on every protected range of the P10 sheet.
 *
 * Why this exists: lock_sheets.js sets up protected ranges where only
 * the sheet owner (snowtop@gmail.com) is allowed to edit. After sharing
 * the sheet with a second account (e.g. a work account that Claude
 * Desktop's Google Sheets connector is tied to), that account is still
 * blocked on locked tabs unless added to each protection's allowed-editors
 * list. This script does that in one sweep.
 *
 * Idempotent: safe to re-run; emails already in the list are not
 * duplicated.
 *
 * Usage:
 *   node sheet-tools/grant_editor.js you@example.com
 */

// IMPORTANT: this script must run as the sheet OWNER (snowtop@gmail.com).
// Service accounts cannot modify protected ranges that don't already
// include them, even if they're Editors on the sheet. So we explicitly
// use OAuth credentials.
const { getOwnerSheets, SPREADSHEET_ID } = require('../lib/auth');

async function main() {
  const email = process.argv[2];
  if (!email || !email.includes('@')) {
    console.error('Usage: node sheet-tools/grant_editor.js <email>');
    process.exit(1);
  }

  const sheets = getOwnerSheets();

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'sheets(properties(sheetId,title),protectedRanges)',
  });

  const requests = [];
  let totalProtections = 0;
  let skipped = 0;

  for (const tab of meta.data.sheets) {
    const tabTitle = tab.properties.title;
    const protections = tab.protectedRanges || [];
    for (const p of protections) {
      totalProtections += 1;
      const currentUsers = (p.editors && p.editors.users) || [];
      if (currentUsers.includes(email)) {
        skipped += 1;
        continue;
      }
      const newUsers = [...currentUsers, email];
      requests.push({
        updateProtectedRange: {
          protectedRange: {
            protectedRangeId: p.protectedRangeId,
            editors: { users: newUsers },
          },
          fields: 'editors.users',
        },
      });
      console.log(
        `  + ${tabTitle} (protectionId=${p.protectedRangeId}): adding ${email}`
      );
    }
  }

  console.log(
    `Found ${totalProtections} protected ranges; ${skipped} already had ${email}; ${requests.length} to update.`
  );

  if (requests.length === 0) {
    console.log('Nothing to do. Done.');
    return;
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests },
  });

  console.log(`Granted ${email} editor access on ${requests.length} ranges.`);
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
