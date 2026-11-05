"""Read bounded XLSX reference data without macros, formulas, or external links."""
import io
import json
import posixpath
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

def read_sheet(data):
    if len(data) > 8 * 1024 * 1024:
        raise ValueError('表格不能超过 8MB')
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        infos = archive.infolist()
        if len(infos) > 2000 or sum(i.file_size for i in infos) > 24 * 1024 * 1024:
            raise ValueError('表格解压后过大，请精简后上传')
        def xml(name):
            raw = archive.read(name)
            if b'<!DOCTYPE' in raw or b'<!ENTITY' in raw:
                raise ValueError('不支持此表格 XML 格式')
            return ET.fromstring(raw)
        strings = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            strings = [''.join(n.itertext()) for n in xml('xl/sharedStrings.xml').findall(NS+'si')]
        relations = {r.attrib['Id']: r.attrib['Target'] for r in xml('xl/_rels/workbook.xml.rels') if r.attrib.get('TargetMode') != 'External'}
        output = []
        for sheet in xml('xl/workbook.xml').findall('.//'+NS+'sheet'):
            rid = sheet.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
            target = relations.get(rid, '')
            name = posixpath.normpath(target.lstrip('/') if target.startswith('/') else 'xl/'+target)
            if not name.startswith('xl/worksheets/'):
                continue
            output.append('工作表：'+sheet.attrib.get('name', ''))
            for row in xml(name).findall('.//'+NS+'row'):
                cells = []
                for cell in row.findall(NS+'c'):
                    value = cell.findtext(NS+'v', '')
                    kind = cell.attrib.get('t')
                    if kind == 's':
                        value = strings[int(value)]
                    elif kind == 'inlineStr':
                        value = ''.join(cell.find(NS+'is').itertext())
                    if cell.find(NS+'f') is not None and not value:
                        value = '[公式无缓存值，请重新计算并保存]'
                    if value:
                        cells.append(cell.attrib.get('r', '')+'='+value)
                if cells:
                    output.append('\t'.join(cells))
                if sum(map(len, output)) > 16000:
                    raise ValueError('表格内容超过 16000 字，请只保留需要的参考数据')
        if not output:
            raise ValueError('没有可读取的工作表')
        return '\n'.join(output)

if __name__ == '__main__':
    try:
        print(json.dumps({'text': read_sheet(sys.stdin.buffer.read(8*1024*1024+1))}, ensure_ascii=True))
    except Exception as error:
        print(json.dumps({'error': '无法读取 XLSX：'+str(error)}, ensure_ascii=True))
        sys.exit(1)
