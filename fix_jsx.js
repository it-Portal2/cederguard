
import fs from 'fs';

const path = 'c:/Users/Lenovo/Downloads/cedar-property-compliance-and-risk-manager-suite/src/pages/ComplianceSetup.tsx';
let content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');

// Fix Phase 3 Review block (if not already fixed)
// Line 701 should be </div>, 702 should be </div>, 703 should be </div>, 704 should be )}
// Wait, I already added one in Step 2127.
// Let's check current line 701.

// Fix Overlay block
// Find the block {showAnalysisExists && (
// It starts at 473.
// It ends at 526 in the current file.
// We want to make sure it has exactly 2 closing divs (for 474 and 475) and then )}.
// We remove the 3rd div (the one meant for 471).

const fixedLines = [];
let foundOverlayEnd = false;

for (let i = 0; i < lines.length; i++) {
  let line = lines[i];
  
  // Targeted fix for Overlay end (around 523-526)
  if (i >= 520 && i <= 530 && line.includes('</div>') && !foundOverlayEnd) {
      // We seek the 3-div sequence and turn it into 2.
      if (lines[i].includes('</div>') && lines[i+1].includes('</div>') && lines[i+2].includes('</div>')) {
          console.log("Found triple div at " + (i+1));
          fixedLines.push('          </div>');
          fixedLines.push('        </div>');
          fixedLines.push('      )}');
          i += 3; // Skip the original 3 divs and the )}
          foundOverlayEnd = true;
          continue;
      }
  }

  fixedLines.push(line);
}

fs.writeFileSync(path, fixedLines.join('\n'));
console.log("Applied targeted fixes.");
