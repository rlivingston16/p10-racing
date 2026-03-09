const fs = require('fs');
let c = fs.readFileSync('public/index.html', 'utf8');

// Remove hide-mobile from standings payout column
c = c.replace(
  'html += \'<tr><th>Rank</th><th>Player</th><th>Pts</th><th class="hide-mobile">Payout</th></tr>\';',
  'html += \'<tr><th>Rank</th><th>Player</th><th>Pts</th><th>Payout</th></tr>\';'
);
c = c.replace(
  'html += `<tr class="${cls}"><td>${row[0]||\'\'}</td><td>${row[1]||\'\'}</td><td>${row[2]||\'\'}</td><td class="hide-mobile">${row[3]||\'\'}</td></tr>`;',
  'html += `<tr class="${cls}"><td>${row[0]||\'\'}</td><td>${row[1]||\'\'}</td><td>${row[2]||\'\'}</td><td>${row[3]||\'\'}</td></tr>`;'
);

fs.writeFileSync('public/index.html', c);
console.log('done, checking...');
// verify
const out = fs.readFileSync('public/index.html', 'utf8');
console.log('hide-mobile in standings:', out.includes('hide-mobile">Payout'));
