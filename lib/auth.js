const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const SPREADSHEET_ID = '1T__0CvsUq5Asq0-raVzxiXXvadfctATZwS7ANA-GQXo';
const SHEETS_SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

const SEARCH_DIRS = [
  path.join(__dirname, '..', 'credentials'),
  path.join(__dirname, '..'),
  path.join(__dirname, '..', '..'),
];

function findFile(predicate) {
  for (const dir of SEARCH_DIRS) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir);
    const match = files.find(predicate);
    if (match) return path.join(dir, match);
  }
  return null;
}

function loadServiceAccountFromEnv() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT) {
    return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  }
  return null;
}

function loadServiceAccountFromDisk() {
  const candidate = findFile(
    (f) => f === 'service-account.json' || /-service-account\.json$/.test(f)
  );
  if (!candidate) return null;
  const parsed = JSON.parse(fs.readFileSync(candidate));
  if (parsed.type === 'service_account') return parsed;
  return null;
}

function loadOAuthFromEnv() {
  if (process.env.GOOGLE_CREDS && process.env.GOOGLE_TOKEN) {
    return {
      creds: JSON.parse(process.env.GOOGLE_CREDS),
      token: JSON.parse(process.env.GOOGLE_TOKEN),
    };
  }
  return null;
}

function loadOAuthFromDisk() {
  const credsPath = findFile((f) => /^client_secret_.*\.json$/.test(f));
  const tokenPath = findFile((f) => f === 'token.json');
  if (!credsPath || !tokenPath) return null;
  return {
    creds: JSON.parse(fs.readFileSync(credsPath)),
    token: JSON.parse(fs.readFileSync(tokenPath)),
  };
}

function getServiceAccountAuth() {
  const sa = loadServiceAccountFromEnv() || loadServiceAccountFromDisk();
  if (!sa) return null;
  return new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: SHEETS_SCOPES,
  });
}

function getOAuthAuth() {
  const oauth = loadOAuthFromEnv() || loadOAuthFromDisk();
  if (!oauth) return null;
  const { client_id, client_secret, redirect_uris } = oauth.creds.installed;
  const auth = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );
  auth.setCredentials(oauth.token);
  return auth;
}

const NO_CREDS_MESSAGE =
  'Google credentials not found. Provide one of:\n' +
  '  - service-account.json in p10app/credentials/ (recommended for normal scripts)\n' +
  '  - GOOGLE_SERVICE_ACCOUNT env var with the JSON contents\n' +
  '  - client_secret_*.json + token.json in p10app/credentials/ (required for owner-only ops)\n' +
  '  - GOOGLE_CREDS + GOOGLE_TOKEN env vars';

/**
 * Smart resolution: service account first (portable, no personal login),
 * OAuth as fallback. Use this for routine read/write scripts.
 */
function getAuth() {
  const auth = getServiceAccountAuth() || getOAuthAuth();
  if (!auth) throw new Error(NO_CREDS_MESSAGE);
  return auth;
}

/**
 * Force OAuth (snowtop owner). Required for operations that only the sheet
 * OWNER can perform — e.g. modifying protected ranges that don't already
 * include the caller. Service accounts cannot do these even if they're
 * Editors on the sheet.
 */
function getOwnerAuth() {
  const auth = getOAuthAuth();
  if (!auth) {
    throw new Error(
      'Owner OAuth credentials not found. This operation requires running as ' +
        'the sheet owner (snowtop@gmail.com). ' +
        'Place client_secret_*.json + token.json in p10app/credentials/ ' +
        'or set GOOGLE_CREDS + GOOGLE_TOKEN env vars.'
    );
  }
  return auth;
}

function getSheets() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

function getOwnerSheets() {
  return google.sheets({ version: 'v4', auth: getOwnerAuth() });
}

module.exports = {
  getAuth,
  getOwnerAuth,
  getServiceAccountAuth,
  getOAuthAuth,
  getSheets,
  getOwnerSheets,
  SPREADSHEET_ID,
};
