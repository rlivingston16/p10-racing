const fs = require('fs');
let c = fs.readFileSync('public/index.html', 'utf8');

// Clear dropdowns when player changes, before loading their picks
c = c.replace(
  'async function loadCurrentPicks() {\n  const player = document.getElementById(\'playerSelect\').value;\n  if (!player) return;',
  `async function loadCurrentPicks() {
  const player = document.getElementById('playerSelect').value;
  // Clear picks on player change
  document.getElementById('p10Select').value = '';
  document.getElementById('p2Select').value = '';
  document.getElementById('dnfSelect').value = '';
  document.getElementById('currentPicks').innerHTML = '';
  if (!player) return;`
);

fs.writeFileSync('public/index.html', c);
console.log('done:', c.includes('Clear picks on player change'));
