const fs = require('fs');
const f = 'C:/Users/amarb/Desktop/nokta/lib/utils/__tests__/print-helpers.test.ts';
let c = fs.readFileSync(f, 'utf8');

// Detect line ending
const eol = c.includes('\r\n') ? '\r\n' : '\n';

// Add serialNumber after loadingNumber in both places
const old = `loadingNumber: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),`;
const nw = `loadingNumber: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),${eol}  serialNumber: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),`;

let count = 0;
while (c.includes(old)) {
  c = c.replace(old, nw);
  count++;
}
fs.writeFileSync(f, c);
console.log(`Done. Replaced ${count} occurrences.`);
