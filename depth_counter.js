
import fs from 'fs';

const content = fs.readFileSync('c:/Users/Lenovo/Downloads/cedar-property-compliance-and-risk-manager-suite/src/pages/ComplianceSetup.tsx', 'utf8');
const lines = content.split('\n');

let dT = 0;
let dP = 0;
let dB = 0;

console.log("Analyzing from line 469 (Return start)...");

for (let i = 468; i < lines.length; i++) {
  const line = lines[i];
  const lineNum = i + 1;
  
  // Tag counting
  const tO = (line.match(/<[a-zA-Z]|<>/g) || []).length;
  const tC = (line.match(/<\/[a-zA-Z]|<\/>/g) || []).length;
  const tS = (line.match(/\/>/g) || []).length;

  // Paren counting
  const pO = (line.match(/\(/g) || []).length;
  const pC = (line.match(/\)/g) || []).length;

  // Brace counting
  const bO = (line.match(/{/g) || []).length;
  const bC = (line.match(/}/g) || []).length;

  dT += tO - tC - tS;
  dP += pO - pC;
  dB += bO - bC;

  if (lineNum >= 469 && lineNum <= 1175) {
    console.log(`L${lineNum.toString().padStart(4, ' ')}: T:${dT.toString().padStart(2, ' ')} P:${dP.toString().padStart(2, ' ')} B:${dB.toString().padStart(2, ' ')} | ${line.trim()}`);
  }

  if (dT < 0 || dP < 0 || dB < 0) {
    console.log(`!!! IMBALANCE AT ${lineNum} !!! T:${dT} P:${dP} B:${dB}`);
    // Optional: reset to find next imbalance
    // if (dT < 0) dT = 0;
    // if (dP < 0) dP = 0;
    // if (dB < 0) dB = 0;
  }
}

console.log(`Final State: T:${dT} P:${dP} B:${dB}`);
