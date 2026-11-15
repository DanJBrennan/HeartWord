"""Focused additive canon import using existing characters/version/assets tables.
Default verifies only. --apply adds the explicitly authorized four visual sets.
No provider calls, migrations, voices, project creation or production dispatch.
"""
import json, hashlib, sqlite3, shutil, uuid, time, sys
from pathlib import Path
from datetime import datetime, timezone

ROOT=Path(__file__).resolve().parent
DATA=Path('C:/Users/danbr/HeartWordData')
DB=DATA/'db/heartword.sqlite'
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,v):p.write_text(json.dumps(v,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
plan=read(ROOT/'import-plan.json')
assert len(plan['assets'])==10 and plan['imageCalls']==8 and not plan['paidFallback']
names={'herod':'Herod Antipas','john-the-baptist':'John the Baptist','herodias':'Herodias','herodias-daughter':'Herodias’s daughter (unnamed)'}
facts={
 'herod':'Same mature Papuan face, close salt-and-pepper curls and short beard as approved headshot. Bareheaded reconstruction. Fine cream ankle-length tunic with clean bound neckline; deep burgundy mantle, narrow gold woven borders and burgundy/gold sash; brown leather sandals. Final body references govern court wardrobe; old portrait neckline texture is identity-only, not costume authority.',
 'john-the-baptist':'John the Baptist, distinct from John son of Zebedee and Jesus. Same lean Papuan face, compact curly hair and long dark chin beard as approved headshot. Plain rough brown hair-cloth tunic, simple leather belt and worn leather sandals. No court finery. Generic standing pose is not a new narrative event.',
 'herodias':'Same mature Papuan woman, face and gathered curls as approved headshot. Finely finished clay-ochre long dress and deep umber mantle with narrow woven gold edging, matching sash and brown leather sandals. Final body references govern court wardrobe; old portrait rough neckline is identity-only.',
 'herodias-daughter':'Herodias’s unnamed daughter; exact age unspecified. Same youthful Papuan face and gathered dark curls as approved headshot. Modest opaque teal ankle-length dress with sleeves below elbows, secure neckline, cream shoulder drape/sash, restrained woven edging and flat leather sandals. Nonsexual portrayal and natural graceful movement. No personal name or exact age invented.'
}
for a in plan['assets']:
    assert a['key'] in names and sha(Path(a['path']))==a['sha256']
with sqlite3.connect(DB.as_uri()+'?mode=ro',uri=True) as c:
    c.row_factory=sqlite3.Row
    existing=[dict(r) for r in c.execute("SELECT * FROM characters WHERE region='Papuan' AND (lower(name) LIKE '%herod%' OR lower(name) LIKE '%baptist%')")]
    assert not existing,'Relevant canon now exists; reconcile rather than duplicate'
    assert c.execute("SELECT count(*) FROM projects WHERE lower(language)='hatam' AND lower(book)='mark' AND chapter=6").fetchone()[0]==0
if '--apply' not in sys.argv:
    print(json.dumps({'status':'preflight_passed_no_changes','newCharacters':4,'assets':10,'voicesAssigned':0,'productionStarted':False}));sys.exit(0)
if (ROOT/'import-receipt.json').exists():raise RuntimeError('Retained import receipt exists; no replay')

stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup=DATA/'backups'/('canon-mark6-'+stamp)
backup.mkdir(parents=True,exist_ok=False)
with sqlite3.connect(DB.as_uri()+'?mode=ro',uri=True) as source,sqlite3.connect(backup/'heartword-before-canon.sqlite') as target:
    source.backup(target)
    assert target.execute('PRAGMA quick_check').fetchone()[0]=='ok'
now=int(time.time()*1000);created=[]
for key,name in names.items():
    slug='herod-antipas' if key=='herod' else key
    folder=DATA/'assets/characters'/slug/'v1'
    folder.mkdir(parents=True,exist_ok=False)
    assets=[]
    for a in (a for a in plan['assets'] if a['key']==key):
        destination=folder/(a['pose']+'.png')
        with Path(a['path']).open('rb') as src,destination.open('xb') as dst:shutil.copyfileobj(src,dst)
        assert sha(destination)==a['sha256']
        assets.append({**a,'canonPath':str(destination.relative_to(DATA/'assets')).replace('\\','/'),'assetId':str(uuid.uuid4())})
    item={'key':key,'name':name,'characterId':str(uuid.uuid4()),'versionId':str(uuid.uuid4()),'scope':'global','region':'Papuan','version':'v1','assets':assets,'facts':facts[key]}
    save(folder/'provenance.json',{'authority':plan['authority'],'character':item,'headwearDecision':plan['headwearDecision'] if key=='herod' else None,'visualReview':plan['review'],'imageTool':'built-in image_gen','newBodyCallsForUnit':8,'paidFallback':False,'voiceApproved':False,'fullProductionHold':True})
    created.append(item)

c=sqlite3.connect(DB,timeout=30);c.row_factory=sqlite3.Row;c.execute('PRAGMA foreign_keys=ON');c.execute('BEGIN IMMEDIATE')
try:
    tables=['characters','character_versions','character_assets']
    before={t:[dict(r) for r in c.execute('SELECT * FROM '+t+' ORDER BY id')] for t in tables}
    beforeIds={t:{r['id'] for r in before[t]} for t in tables}
    oldFK={tuple(r) for r in c.execute('PRAGMA foreign_key_check')}
    assert not c.execute("SELECT id FROM characters WHERE region='Papuan' AND (lower(name) LIKE '%herod%' OR lower(name) LIKE '%baptist%')").fetchone()
    save(backup/'canon-rows-before.json',before)
    for item in created:
        key=item['key'];note='Dan explicitly accepted the exact headshot and delegated needed body references plus canon addition on 2026-11-01. Assistant reviewed final body references under that authority; no claim Dan individually inspected every body image. '+facts[key]+' Headshot identity and final body wardrobe are separate authorities. Court costumes/headwear are documented artistic reconstructions. No voice assigned/approved. No full-production approval. Provenance: characters/'+('herod-antipas' if key=='herod' else key)+'/v1/provenance.json'
        c.execute("INSERT INTO characters (id,name,scope_kind,scope_book,scope_chapter,canon_status,region,created_at,updated_at) VALUES (?,?,'global',NULL,NULL,'approved','Papuan',?,?)",(item['characterId'],item['name'],now,now))
        c.execute("INSERT INTO character_versions (id,character_id,version_label,status,voice_provider,voice_id,locked_visual_facts,notes,created_at) VALUES (?,?,'v1','approved',NULL,NULL,?,?,?)",(item['versionId'],item['characterId'],json.dumps({'description':facts[key],'prohibitedPromptPhrases':[]},ensure_ascii=False),note,now))
        for a in item['assets']:
            c.execute("INSERT INTO character_assets (id,character_version_id,category,path,content_hash,imported_from,asset_role,created_at) VALUES (?,?,?,?,?,?,?,?)",(a['assetId'],item['versionId'],a['kind'],a['canonPath'],a['sha256'],'User-approved portrait/delegated body package: '+a['path'],'scene_reference' if a['kind']=='headshot' else 'base_pose',now))
    for t in tables:
        after={r['id']:dict(r) for r in c.execute('SELECT * FROM '+t)}
        assert all(after[r['id']]==r for r in before[t]),'Existing canon row changed'
        assert len(after)-len(before[t])=={'characters':4,'character_versions':4,'character_assets':10}[t]
    assert {tuple(r) for r in c.execute('PRAGMA foreign_key_check')}==oldFK
    assert c.execute("SELECT count(*) FROM projects WHERE lower(language)='hatam' AND lower(book)='mark' AND chapter=6").fetchone()[0]==0
    c.commit()
except BaseException:
    c.rollback();raise
finally:c.close()
with sqlite3.connect(DB.as_uri()+'?mode=ro',uri=True) as c:
    for item in created:
        row=c.execute('SELECT cv.status,cv.voice_provider,cv.voice_id,c.canon_status FROM character_versions cv JOIN characters c ON c.id=cv.character_id WHERE cv.id=?',(item['versionId'],)).fetchone()
        assert tuple(row)==('approved',None,None,'approved')
        for a in item['assets']:assert sha(DATA/'assets'/a['canonPath'])==a['sha256']
receipt={'status':'four_visual_canon_sets_added','createdAt':datetime.now(timezone.utc).isoformat(),'backup':str(backup/'heartword-before-canon.sqlite'),'canonSnapshot':str(backup/'canon-rows-before.json'),'characters':created,'countsAdded':{'characters':4,'versions':4,'assets':10},'existingCanonRowsUnchanged':True,'newForeignKeyIssues':0,'voiceApproved':False,'voiceCalls':0,'paidFallback':False,'fullProductionHold':True,'sourceOrProjectRowsChanged':False}
save(ROOT/'import-receipt.json',receipt)
print(json.dumps({'status':receipt['status'],'names':[x['name'] for x in created],'assetCount':10,'backup':str(backup),'existingCanonPreserved':True,'fullProductionHold':True},ensure_ascii=False))
