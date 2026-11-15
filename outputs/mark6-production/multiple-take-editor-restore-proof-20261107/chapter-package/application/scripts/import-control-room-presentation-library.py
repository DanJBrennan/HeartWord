"""Import Dan's approved control-room workbook into presentation-only SQLite tables."""
import json, os, re, sqlite3, sys, time, zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

def cells(workbook, sheet_name):
    with zipfile.ZipFile(workbook) as z:
        shared=[]
        if "xl/sharedStrings.xml" in z.namelist():
            root=ET.fromstring(z.read("xl/sharedStrings.xml")); shared=["".join(x.text or "" for x in s.iter(NS+"t")) for s in root.findall(NS+"si")]
        book=ET.fromstring(z.read("xl/workbook.xml")); rels=ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        rel_map={r.attrib['Id']:r.attrib['Target'] for r in rels}
        sheet=next(s for s in book.find(NS+"sheets") if s.attrib['name']==sheet_name)
        target=rel_map[sheet.attrib[REL+'id']].lstrip('/')
        if not target.startswith('xl/'): target='xl/'+target
        root=ET.fromstring(z.read(target)); rows=[]
        for row in root.iter(NS+'row'):
            values=[]
            for cell in row.findall(NS+'c'):
                v=cell.find(NS+'v'); value='' if v is None else v.text or ''
                if cell.attrib.get('t')=='s' and value: value=shared[int(value)]
                elif cell.attrib.get('t')=='inlineStr': value=''.join(t.text or '' for t in cell.iter(NS+'t'))
                values.append(value)
            rows.append(values)
        return rows

def agents(value): return [x.strip() for x in str(value).split(',') if x.strip()]
def parse_lines(script, fallback):
    result=[]
    for number, raw in enumerate(str(script).splitlines(), 1):
        match=re.match(r'^\s*([^:]{1,80}):\s*(.+)$', raw)
        speaker, text=(match.group(1).strip(), match.group(2).strip()) if match else (fallback, raw.strip())
        if text: result.append((number, speaker, text))
    return result

def main():
    workbook=Path(sys.argv[1]); data_dir=Path(os.environ.get('HEARTWORD_DATA_DIR', r'C:\Users\danbr\HeartWordData'))
    db=sqlite3.connect(data_dir/'db'/'heartword.sqlite'); now=int(time.time()*1000)
    db.execute('DELETE FROM control_room_presentation_lines'); db.execute('DELETE FROM control_room_presentation_items')
    insert_item='INSERT INTO control_room_presentation_items VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
    insert_line='INSERT INTO control_room_presentation_lines VALUES (?,?,?,?,?)'
    count={'utterance':0,'exchange':0,'lines':0}
    for index,row in enumerate(cells(workbook,'Mission & Purpose Statements')[1:],2):
        if len(row)<4 or not row[1] or not row[3]: continue
        item=f'purpose-{row[0] or index}'; person=str(row[1]).strip()
        db.execute(insert_item,(item,'utterance',row[2] or None,'purpose statement',None,None,json.dumps([person]),workbook.name,'Mission & Purpose Statements',index,1,now))
        db.execute(insert_line,(item+'-1',item,1,person,str(row[3]).strip())); count['utterance']+=1; count['lines']+=1
    for index,row in enumerate(cells(workbook,'Sample Exchanges')[1:],2):
        if len(row)<5 or not row[4]: continue
        people=agents(row[2]); item=f'exchange-{row[0] or index}'
        db.execute(insert_item,(item,'exchange',row[1] or None,row[3] or None,row[5] or None,row[6] or None,json.dumps(people),workbook.name,'Sample Exchanges',index,1,now))
        for number,speaker,text in parse_lines(row[4],people[0] if people else 'Cast'):
            db.execute(insert_line,(f'{item}-{number}',item,number,speaker,text)); count['lines']+=1
        count['exchange']+=1
    db.commit(); print(json.dumps(count))
if __name__=='__main__': main()
