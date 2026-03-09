const fs = require('fs');
let c = fs.readFileSync('public/index.html', 'utf8');

// Replace mobile CSS block entirely
c = c.replace(
`  /* Mobile */
  @media (max-width: 480px) {
    .view { padding: 10px; }
    .card { padding: 14px 12px; }
    td, th { padding: 8px 6px; font-size: 0.8rem; }
    .hide-mobile { display: none; }
    nav button { font-size: 0.7rem; padding: 12px 4px; letter-spacing: 0; }
  }`,
`  /* Mobile */
  @media (max-width: 600px) {
    .view { padding: 10px; }
    .card { padding: 14px 0; }
    .card h2 { padding: 0 14px 14px; }
    td, th { padding: 10px 8px; font-size: 0.85rem; }
    .hide-mobile { display: none; }
    nav button { font-size: 0.7rem; padding: 12px 4px; letter-spacing: 0; }
    select, button.submit, .race-badge, label, .current-picks, .pick-item, #pickMsg { margin-left: 14px; margin-right: 14px; width: calc(100% - 28px); box-sizing: border-box; }
    button.submit { width: calc(100% - 28px); }
    .race-badge { display: inline-block; width: auto; }
    .results-race-header { padding: 0 14px; }
  }`
);

fs.writeFileSync('public/index.html', c);
console.log('done');
