const fs = require('fs');
let c = fs.readFileSync('public/index.html', 'utf8');

// Fix loadCurrentPicks to use apiFetch
c = c.replace(
  'const r = await fetch(`/api/picks/${currentRound}`);',
  'const r = await apiFetch(`/api/picks/${currentRound}`);'
);

fs.writeFileSync('public/index.html', c);
const out = fs.readFileSync('public/index.html', 'utf8');
console.log('fixed:', out.includes('apiFetch(`/api/picks/'));
