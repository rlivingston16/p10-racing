const fs = require('fs');
let c = fs.readFileSync('public/index.html', 'utf8');

// Standings: hide payout column on mobile
c = c.replace(
  `html += '<tr><th>Rank</th><th>Player</th><th>Pts</th><th>Payout</th></tr>';`,
  `html += '<tr><th>Rank</th><th>Player</th><th>Pts</th><th class="hide-mobile">Payout</th></tr>';`
);
c = c.replace(
  `html += \`<tr class="\${cls}"><td>\${row[0]||''}</td><td>\${row[1]||''}</td><td>\${row[2]||''}</td><td>\${row[3]||''}</td></tr>\`;`,
  `html += \`<tr class="\${cls}"><td>\${row[0]||''}</td><td>\${row[1]||''}</td><td>\${row[2]||''}</td><td class="hide-mobile">\${row[3]||''}</td></tr>\`;`
);

// Scores: hide Bonus and Win$ columns on mobile
c = c.replace(
  "html += `<th>${r.name}</th><th>Bonus</th><th>Win</th>`;",
  "html += `<th>${r.name}</th><th class=\"hide-mobile\">Bonus</th><th class=\"hide-mobile\">Win</th>`;"
);
c = c.replace(
  "html += `<td>${p10 === '0' ? '' : p10}</td><td>${bonus === '0' ? '' : bonus}</td><td>${win === '$10' ? '<span class=\"badge\">$10</span>' : ''}</td>`;",
  "html += `<td>${p10 === '0' ? '' : p10}</td><td class=\"hide-mobile\">${bonus === '0' ? '' : bonus}</td><td class=\"hide-mobile\">${win === '$10' ? '<span class=\"badge\">$10</span>' : ''}</td>`;"
);

fs.writeFileSync('public/index.html', c);
console.log('done');
