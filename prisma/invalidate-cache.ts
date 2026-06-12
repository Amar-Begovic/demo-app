// This script just prints instructions since we can't call updateTag from outside Next.js
console.log(`
Cache je problem. Štofovi su u bazi (190), ali stranica je keširana sa starim podacima.

Rješenja:
1. Restartuj dev server (npm run dev)
2. Ili dodaj novi štof kroz UI - to će invalidirati cache
3. Ili otvori /fabrics stranicu u incognito modu

Štofovi su uspješno uvezeni u bazu!
`);
