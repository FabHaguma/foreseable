"""Read the original workbook for local preview only; never modifies the workbook."""
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

root = Path(__file__).resolve().parent.parent
ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
with zipfile.ZipFile(root / "call-sheet.xlsx") as archive:
    shared = ["".join(item.itertext()) for item in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("m:si", ns)]
    sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
    rows = []
    for row in sheet.findall(".//m:sheetData/m:row", ns):
        values = {}
        for cell in row:
            column = "".join(letter for letter in cell.attrib["r"] if letter.isalpha())
            value = cell.find("m:v", ns)
            values[column] = shared[int(value.text)] if cell.attrib.get("t") == "s" else value.text if value is not None else ""
        if values.get("A") and values.get("C") and values["A"] != "Code":
            rows.append(values)
fields = ["code", "section", "name", "partner", "listNo", "phone", "whatsapp", "context", "calledOn", "reached", "reason", "result", "promisedFor", "notes", "openedSeen"]
contacts = []
for row in rows:
    contact = {key: row.get(chr(65 + index), "") for index, key in enumerate(fields)}
    if contact["calledOn"]:
        minutes = round(float(contact["calledOn"]) * 1440) % 1440
        contact["calledOn"] = f"{minutes // 60:02}:{minutes % 60:02}"
    contacts.append(contact)
(root / "data").mkdir(exist_ok=True)
(root / "data/initial-contacts.json").write_text(json.dumps(contacts, ensure_ascii=False), encoding="utf-8")
print(f"Prepared {len(contacts)} contacts for local preview. The source workbook is unchanged.")
