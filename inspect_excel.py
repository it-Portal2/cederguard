import pandas as pd
import openpyxl
import sys

# Ensure utf-8 output for printing
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def inspect_excel(file_path):
    wb = openpyxl.load_workbook(file_path, data_only=True)
    sheets = wb.sheetnames
    print(f"Sheets: {sheets}")
    
    output_file = r'c:\Users\Lenovo\Downloads\cedar-property-compliance-and-risk-manager-suite\excel_inspection.txt'
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(f"Sheets: {sheets}\n\n")
        
        for sheet in sheets:
            if any(keyword in sheet.lower() for keyword in ['kri', 'risk', 'calc', 'matrix', 'rag', 'framework']):
                f.write(f"\n--- Sheet: {sheet} ---\n")
                try:
                    df = pd.read_excel(file_path, sheet_name=sheet)
                    f.write(df.head(50).to_string())
                    f.write("\n\n")
                except Exception as e:
                    f.write(f"Error reading sheet {sheet}: {e}\n")

if __name__ == "__main__":
    inspect_excel(r'c:\Users\Lenovo\Downloads\cedar-property-compliance-and-risk-manager-suite\RIO v5.02.xlsm')
