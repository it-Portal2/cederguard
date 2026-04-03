const fs = require('fs');
const path = require('path');

// Helper to extract values for a key
function extractValues(content, key) {
    const regex = new RegExp(key + '[:\\s]+["\'](.*?)["\']', 'g');
    const matches = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
        matches.push(match[1]);
    }
    return matches;
}

// Extract REGS from regulations.html
const htmlPath = 'c:/Users/Lenovo/Downloads/cedar-property-compliance-and-risk-manager-suite/regulations.html';
const htmlContent = fs.readFileSync(htmlPath, 'utf8');
const htmlRegs = extractValues(htmlContent, 'name');

console.log('--- Regulations in regulations.html (Total: ' + htmlRegs.length + ') ---');

// Extract COMPLIANCE_ITEMS from complianceData.ts
const tsPath = 'c:/Users/Lenovo/Downloads/cedar-property-compliance-and-risk-manager-suite/src/data/complianceData.ts';
const tsContent = fs.readFileSync(tsPath, 'utf8');
const tsRegs = extractValues(tsContent, 'reg');

console.log('--- Regulations in complianceData.ts (Total: ' + tsRegs.length + ') ---');

// Compare
const missingInHtml = tsRegs.filter(r => !htmlRegs.includes(r));
const extraInHtml = htmlRegs.filter(r => !tsRegs.includes(r));

console.log('\n--- Regulations in complianceData.ts but NOT in regulations.html (' + missingInHtml.length + ') ---');
[...new Set(missingInHtml)].forEach(r => console.log('- ' + r));

console.log('\n--- Regulations in regulations.html but NOT in complianceData.ts (' + extraInHtml.length + ') ---');
[...new Set(extraInHtml)].forEach(r => console.log('- ' + r));

// Check for duplicates in tsRegs
const tsCounts = {};
tsRegs.forEach(r => tsCounts[r] = (tsCounts[r] || 0) + 1);
const tsDuplicates = Object.keys(tsCounts).filter(r => tsCounts[r] > 1);

if (tsDuplicates.length > 0) {
    console.log('\n--- Duplicates in complianceData.ts (' + tsDuplicates.length + ') ---');
    tsDuplicates.forEach(r => console.log('- ' + r + ' (' + tsCounts[r] + ' times)'));
}
