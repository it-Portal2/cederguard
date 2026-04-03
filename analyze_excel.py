import pandas as pd
import json
import os

files = [
    "Programme Risk Register.xlsm",
    "Project Risk Register.xlsx",
    "Compliance Tracker.xlsx",
    "RIO v5.02.xlsm"
]

results = {}

for f in files:
    path = os.path.join(os.getcwd(), f)
    if os.path.exists(path):
        print(f"Processing {f}...")
        try:
            # Use openpyxl for .xlsx and .xlsm
            xl = pd.ExcelFile(path, engine='openpyxl')
            results[f] = {}
            for sheet in xl.sheet_names:
                df = xl.parse(sheet)
                # Just get the column names and some sample data to identify dropdown values
                results[f][sheet] = {
                    "columns": df.columns.tolist(),
                    "sample": df.head(10).to_dict(orient='records')
                }
        except Exception as e:
            print(f"Error processing {f}: {e}")
    else:
        print(f"File not found: {f}")

with open("excel_analysis.json", "w") as jf:
    json.dump(results, jf, indent=2, default=str)
