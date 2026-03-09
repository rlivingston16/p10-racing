const fs = require('fs');
let c = fs.readFileSync('public/index.html', 'utf8');

// Fix results race header to use class
c = c.replace(
  'html += `<div class="card" style="margin-bottom:12px;border-left:none;"><h2>R${row[0]} — ${row[1]}</h2>',
  'html += `<div class="card" style="margin-bottom:12px;border-left:none;"><h2 class="results-race-header">R${row[0]} — ${row[1]}</h2>'
);

// Fix PAYOUT hide - the second loadLeaderboard table also needs hide-mobile on payout th
// The pot tracker table shouldn't show payout at all - it only has 2 cols, fine

fs.writeFileSync('public/index.html', c);
console.log('done');
