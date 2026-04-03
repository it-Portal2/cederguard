import os
import json
import re

# Load the project list I fetched earlier
PROJECTS_FILE = "C:/Users/Lenovo/.gemini/antigravity/brain/5acff98d-7ab7-4a1f-9dc5-def580f6e443/.system_generated/steps/3665/output.txt"

with open(PROJECTS_FILE, 'r', encoding='utf-8') as f:
    data = json.load(f)

# Regex to find Chinese status markers
# 极速 is Speed, 休憩 is Rest
pattern = re.compile(r'[\s|&]*极速\s*\d+\s*(休憩\s*\d+)?')

cleanup_ops = []

for doc in data.get('documents', []):
    doc_name = doc['name'].split('/')[-1]
    fields = doc.get('fields', {})
    
    updates = {}
    
    # Check name
    if 'name' in fields and 'stringValue' in fields['name']:
        original = fields['name']['stringValue']
        cleaned = pattern.sub('', original).strip()
        if cleaned != original:
            updates['name'] = cleaned
            
    # Check scope
    if 'scope' in fields and 'stringValue' in fields['scope']:
        original = fields['scope']['stringValue']
        cleaned = pattern.sub('', original).strip()
        if cleaned != original:
            updates['scope'] = cleaned
            
    if updates:
        cleanup_ops.append({
            'doc_id': doc_name,
            'updates': updates
        })

print(json.dumps(cleanup_ops, indent=2))
