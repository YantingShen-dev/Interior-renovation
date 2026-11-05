import io
import sys
import zipfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts/studio'))
from importlib import import_module
read_sheet = import_module('read-render-sheet').read_sheet

def fixture(extra=''):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="材料清单" r:id="r1"/></sheets></workbook>')
        z.writestr('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>')
        z.writestr('xl/sharedStrings.xml', '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>蓝色墙漆</t></si></sst>')
        z.writestr('xl/worksheets/sheet1.xml', '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="B1"><v>50</v></c><c r="C1"><f>25*2</f><v>50</v></c><c r="D1"><f>HYPERLINK("https://example.test")</f></c></row>'+extra+'</sheetData></worksheet>')
    return buffer.getvalue()

text = read_sheet(fixture())
assert '材料清单' in text and 'A1=蓝色墙漆' in text and 'C1=50' in text
assert '公式无缓存值' in text and 'https://' not in text
try:
    read_sheet(fixture('<row><c t="inlineStr"><is><t>'+'x'*16001+'</t></is></c></row>'))
    raise AssertionError('oversize accepted')
except ValueError:
    pass
print('PASS XLSX names, shared strings, coordinates, cached formulas and content limits')
if '--fixture' in sys.argv:
    out = Path('.cache/render-reference.xlsx');out.parent.mkdir(exist_ok=True);out.write_bytes(fixture())
