const fs = require('fs');

function extractValues(content, key) {
    const regex = new RegExp(key + '[:\\s]+["\'](.*?)["\']', 'g');
    const matches = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
        matches.push(match[1]);
    }
    return matches;
}

const htmlPath = 'c:/Users/Lenovo/Downloads/cedar-property-compliance-and-risk-manager-suite/regulations.html';
const htmlContent = fs.readFileSync(htmlPath, 'utf8');
const htmlRegs = extractValues(htmlContent, 'name');

const tsPath = 'c:/Users/Lenovo/Downloads/cedar-property-compliance-and-risk-manager-suite/src/data/complianceData.ts';
const tsContent = fs.readFileSync(tsPath, 'utf8');
const tsRegs = extractValues(tsContent, 'reg');

console.log('--- HTML Regs: ' + htmlRegs.length);
console.log('--- TS Regs: ' + tsRegs.length);

const missingInHtml = tsRegs.filter(r => !htmlRegs.includes(r));
const extraInHtml = htmlRegs.filter(r => !tsRegs.includes(r));

console.log('\n--- In TS but NOT in HTML (' + missingInHtml.length + ') ---');
[...new Set(missingInHtml)].sort().forEach(r => console.log('- ' + r));

console.log('\n--- In HTML but NOT in TS (' + extraInHtml.length + ') ---');
[...new Set(extraInHtml)].sort().forEach(r => console.log('- ' + r));

const tsCounts = {};
tsRegs.forEach(r => tsCounts[r] = (tsCounts[r] || 0) + 1);
const tsDuplicates = Object.keys(tsCounts).filter(r => tsCounts[r] > 1);

if (tsDuplicates.length > 0) {
    console.log('\n--- Duplicates in TS (' + tsDuplicates.length + ') ---');
    tsDuplicates.sort().forEach(r => console.log('- ' + r + ' (' + tsCounts[r] + ' times)'));
}
