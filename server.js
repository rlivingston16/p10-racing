const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SPREADSHEET_ID = '1T__0CvsUq5Asq0-raVzxiXXvadfctATZwS7ANA-GQXo';

function getAuth() {
  let creds, token;
  if (process.env.GOOGLE_CREDS) {
    creds = JSON.parse(process.env.GOOGLE_CREDS);
    token = JSON.parse(process.env.GOOGLE_TOKEN);
  } else {
    creds = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'client_secret_809278874397-lkut5se9tnv4j4n9ku7sjpu6nmuhsn4p.apps.googleusercontent.com.json')));
    token = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'token.json')));
  }
  const { client_id, client_secret, redirect_uris } = creds.installed;
  const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  auth.setCredentials(token);
  return auth;
}

function getSheets() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

const PLAYERS = [
  'Adam Earp','Andrew Homer','Ben Napier','Bradley Bonnifield','Brian Wiffin',
  'Daniel Bohannon','Dee Baldwin','Elesa Cooperson','Ginger Lumbard','James Wright',
  'Josh Adams','Junior Vazquez','Nash Livingston','Paul Frame','Phil Wowak',
  'Ross Livingston','Rye Livingston','Seth Martinez','Steve Homer','Ted Livingston',
  'Tedders Livingston','Tom Livingston'
];

const DRIVERS = [
  'Alexander Albon','Arvid Lindblad','Carlos Sainz','Charles Leclerc','Esteban Ocon',
  'Fernando Alonso','Franco Colapinto','Gabriel Bortoleto','George Russell','Isack Hadjar',
  'Kimi Antonelli','Lance Stroll','Lando Norris','Lewis Hamilton','Liam Lawson',
  'Max Verstappen','Nico Hulkenberg','Oliver Bearman','Oscar Piastri','Pierre Gasly',
  'Sergio Perez','Valtteri Bottas'
];

const DNF_DRIVERS = ['NO DNF', ...DRIVERS];

// GET /api/leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const sheets = getSheets();
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leaderboard!A3:D25',
      valueRenderOption: 'FORMATTED_VALUE'
    });
    res.json(r.data.values || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/scores
app.get('/api/scores', async (req, res) => {
  try {
    const sheets = getSheets();
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Scores!A2:BV25',
      valueRenderOption: 'FORMATTED_VALUE'
    });
    res.json(r.data.values || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/results
app.get('/api/results', async (req, res) => {
  try {
    const sheets = getSheets();
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Results!A1:AA25',
      valueRenderOption: 'FORMATTED_VALUE'
    });
    res.json(r.data.values || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/picks/:round
app.get('/api/picks/:round', async (req, res) => {
  try {
    const round = parseInt(req.params.round);
    const startRow = (round - 1) * 25 + 3;
    const endRow = startRow + 21;
    const sheets = getSheets();
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `Picks!A${startRow}:D${endRow}`,
      valueRenderOption: 'FORMATTED_VALUE'
    });
    res.json(r.data.values || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/races - get race list + current round
app.get('/api/races', async (req, res) => {
  try {
    const sheets = getSheets();
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Results!A2:D25',
      valueRenderOption: 'FORMATTED_VALUE'
    });
    const rows = r.data.values || [];
    // Find next race (no result yet = P1 col empty)
    const sheets2 = getSheets();
    const r2 = await sheets2.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Results!E2:E25',
      valueRenderOption: 'FORMATTED_VALUE'
    });
    const results = r2.data.values || [];
    let nextRound = 1;
    for (let i = 0; i < results.length; i++) {
      if (results[i] && results[i][0]) nextRound = i + 2;
      else { nextRound = i + 1; break; }
    }
    res.json({ races: rows, nextRound, players: PLAYERS, drivers: DRIVERS, dnfDrivers: DNF_DRIVERS });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/picks - submit picks
app.post('/api/picks', async (req, res) => {
  try {
    const { playerName, round, p10, p2, dnf } = req.body;
    const playerIndex = PLAYERS.indexOf(playerName);
    if (playerIndex === -1) return res.status(400).json({ error: 'Invalid player' });
    
    const row = (round - 1) * 25 + 3 + playerIndex;
    const sheets = getSheets();
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Picks!B${row}:D${row}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[p10, p2, dnf]] }
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`P10 app running on port ${PORT}`));
