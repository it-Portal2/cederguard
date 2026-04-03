import fs from 'fs';

const rawData = JSON.parse(fs.readFileSync('src/data/complianceRegisterData.json', 'utf8'));

// First row is headers
const dataRows = rawData.slice(1);

const cleanData = dataRows.map(row => ({
  domain: row["RiskTrack Pro \u2014 Programme & Project Compliance Register  |  v6.0 \u2014 All Domains Expanded to Milestone-Based Sub-Rows"] || '',
  regulation: row["Unnamed: 1"] || '',
  authority: row["Unnamed: 2"] || '',
  riskLevel: row["Unnamed: 3"] || '',
  requirement: row["Unnamed: 4"] || '',
  penalty: row["Unnamed: 5"] || '',
  trigger: row["Unnamed: 6"] || '',
  automatedAction: row["Unnamed: 7"] || '',
  dependencies: row["Unnamed: 8"] || '',
  userTasks: row["Unnamed: 9"] || '',
  definitionOfDone: row["Unnamed: 10"] || '',
}));

// Filter out empty rows if any
const filteredData = cleanData.filter(d => d.regulation.trim() !== '');

const tsContent = `export interface ComplianceRegisterItem {
  domain: string;
  regulation: string;
  authority: string;
  riskLevel: "Critical" | "High" | "Medium" | "Low" | string;
  requirement: string;
  penalty: string;
  trigger: string;
  automatedAction: string;
  dependencies: string;
  userTasks: string;
  definitionOfDone: string;
}

export const COMPLIANCE_REGISTER: ComplianceRegisterItem[] = ${JSON.stringify(filteredData, null, 2)};
`;

fs.writeFileSync('src/data/complianceRegisterData.ts', tsContent);
console.log('Successfully wrote src/data/complianceRegisterData.ts with ' + filteredData.length + ' items.');
