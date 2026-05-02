const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const SPREADSHEET_ID = '1T__0CvsUq5Asq0-raVzxiXXvadfctATZwS7ANA-GQXo';

function loadCredentials() {
  if (process.env.GOOGLE_CREDS && process.env.GOOGLE_TOKEN) {
    return {
      creds: JSON.parse(process.env.GOOGLE_CREDS),
      token: JSON.parse(process.env.GOOGLE_TOKEN),
    };
  }

  const searchDirs = [
    path.join(__dirname, '..', 'credentials'),
    path.join(__dirname, '..'),
    path.join(__dirname, '..', '..'),
  ];

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir);
    const credsFile = files.find((f) => /^client_secret_.*\.json$/.test(f));
    const tokenFile = files.find((f) => f === 'token.json');
    if (credsFile && tokenFile) {
      return {
        creds: JSON.parse(fs.readFileSync(path.join(dir, credsFile))),
        token: JSON.parse(fs.readFileSync(path.join(dir, tokenFile))),
      };
    }
  }

  throw new Error(
    'Google credentials not found. Set GOOGLE_CREDS and GOOGLE_TOKEN env vars, ' +
      'or place client_secret_*.json + token.json in p10app/credentials/.'
  );
}

function getAuth() {
  const { creds, token } = loadCredentials();
  const { client_id, client_secret, redirect_uris } = creds.installed;
  const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  auth.setCredentials(token);
  return auth;
}

function getSheets() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

module.exports = { getAuth, getSheets, SPREADSHEET_ID };
