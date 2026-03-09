const fs = require('fs');
let c = fs.readFileSync('public/index.html', 'utf8');
const before = "html += `<tr><td style=\"text-align:left\">${row[0]}</td><td>${row[1]}</td></tr>`;";
const after = "html += `<tr><td style=\"text-align:left;text-transform:none;font-weight:400\">${row[0]}</td><td style=\"text-transform:none\">${row[1]}</td></tr>`;";
if (c.includes(before)) {
  c = c.replace(before, after);
  fs.writeFileSync('public/index.html', c);
  console.log('done');
} else {
  console.log('NOT FOUND');
}
