const fs = require('fs');
let c = fs.readFileSync('public/index.html', 'utf8');

// Add lock screen HTML before <nav>
c = c.replace(
  '<nav>',
  `<div id="lockScreen" style="display:none;position:fixed;inset:0;background:#15151e;z-index:999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:40px">
  <div style="font-size:1.5rem;font-weight:900;letter-spacing:2px;text-transform:uppercase;color:#fff">P10 Racing 2026</div>
  <div style="font-size:0.75rem;color:#767676;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px">Enter Access Code</div>
  <input id="codeInput" type="password" inputmode="numeric" maxlength="4" placeholder="••••" style="width:140px;padding:16px;text-align:center;font-size:1.5rem;letter-spacing:8px;background:#1e1e2e;border:1px solid #38383f;border-radius:4px;color:#fff;font-family:inherit;outline:none" onkeydown="if(event.key==='Enter')checkCode()">
  <button onclick="checkCode()" style="width:140px;padding:14px;background:#e8002d;border:none;border-radius:2px;color:#fff;font-family:inherit;font-size:0.9rem;font-weight:900;letter-spacing:3px;text-transform:uppercase;cursor:pointer">ENTER</button>
  <div id="codeError" style="color:#e8002d;font-size:0.8rem;display:none">Incorrect code</div>
</div>
<nav>`,
);

// Add auth logic at the top of the script block
c = c.replace(
  'let raceData = null;',
  `let raceData = null;
let APP_CODE = '';

function checkCode() {
  const input = document.getElementById('codeInput').value;
  fetch('/api/races', { headers: { 'x-app-code': input } })
    .then(r => {
      if (r.ok) {
        APP_CODE = input;
        sessionStorage.setItem('p10code', input);
        document.getElementById('lockScreen').style.display = 'none';
        document.querySelector('nav').style.display = 'flex';
        document.getElementById('picks').classList.add('active');
        init();
      } else {
        document.getElementById('codeError').style.display = 'block';
        document.getElementById('codeInput').value = '';
      }
    });
}

function apiFetch(url, opts = {}) {
  opts.headers = Object.assign({}, opts.headers, { 'x-app-code': APP_CODE });
  return fetch(url, opts);
}
`
);

// Replace all fetch('/api/ calls with apiFetch('/api/ (except the one in checkCode)
c = c.replace(/fetch\('\/api\//g, "apiFetch('/api/");
// But put back the one in checkCode
c = c.replace("apiFetch('/api/races', { headers: { 'x-app-code': input } })", "fetch('/api/races', { headers: { 'x-app-code': input } })");

// Show lock screen on load, hide nav until authed
c = c.replace(
  'async function init() {',
  `window.onload = function() {
  const saved = sessionStorage.getItem('p10code');
  if (saved) {
    APP_CODE = saved;
    document.getElementById('lockScreen').style.display = 'none';
    document.querySelector('nav').style.display = 'flex';
    document.getElementById('picks').classList.add('active');
    init();
  } else {
    document.getElementById('lockScreen').style.display = 'flex';
    document.querySelector('nav').style.display = 'none';
  }
};

async function init() {`
);

// Hide nav initially via inline style
c = c.replace('<nav>', '<nav style="display:none">');
// But only the real nav, not the string inside lockScreen
// Fix: the lockScreen has </div>\n<nav> so the second <nav> is the real one
// Actually we need to be careful - let's just set display none via CSS and let JS show it
// The replacement above added style to both... let's fix
// Count occurrences
const navCount = (c.match(/<nav/g) || []).length;
console.log('nav tags:', navCount);

fs.writeFileSync('public/index.html', c);
console.log('done');
