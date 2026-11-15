import os, json, hashlib, shutil, time
from pathlib import Path
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor

root = Path('\\\\?\\C:\\Users\\danbr\\HeartWordData')
manifest_path = Path(r'C:\Users\danbr\OneDrive\Documents\OneDrive - Personal\OneDrive\HeartWordBackups\20261030-before-gemma\backup.json')
out = Path(__file__).with_name('backup-delta-20261112.json')
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
old = {f['path'][5:]: f for f in manifest['files'] if f['path'].startswith('data/')}
old_content = {(f['bytes'], f['sha256']) for f in manifest['files']}
old_sizes = {s for s, h in old_content}
excluded = {'.disaster-backup.lock','logs/disaster-backup-status.json','logs/disaster-backup-events.jsonl'}
rows = []
def walk(folder):
    with os.scandir(folder) as entries:
        for e in entries:
            if e.is_symlink() or e.is_junction(): raise RuntimeError('Link encountered: ' + e.path)
            rel = Path(e.path).relative_to(root).as_posix()
            if rel in excluded or (e.name.startswith('.env') and e.name != '.env.example'): continue
            if e.is_dir(follow_symlinks=False): walk(e.path)
            elif e.is_file(follow_symlinks=False):
                s = e.stat(follow_symlinks=False)
                rows.append({'path': rel, 'bytes': s.st_size, 'mtime_ns': s.st_mtime_ns, 'ctime_ns': s.st_ctime_ns})
walk(root)
sizes = Counter(r['bytes'] for r in rows)
new = [r for r in rows if r['path'] not in old]
resized = [r for r in rows if r['path'] in old and r['bytes'] != old[r['path']]['bytes']]
print(json.dumps({'phase':'inventory','baselineCompletedAt':manifest['completedAt'],'baselineFiles':len(old),'baselineBytes':sum(f['bytes'] for f in old.values()),'currentFiles':len(rows),'currentBytes':sum(r['bytes'] for r in rows),'newPathFiles':len(new),'newPathBytes':sum(r['bytes'] for r in new),'resizedFiles':len(resized),'resizedBytes':sum(r['bytes'] for r in resized),'freeBytes':shutil.disk_usage(root).free}), flush=True)

def digest(r):
    if r['bytes'] not in old_sizes and sizes[r['bytes']] == 1:
        return r, None, False
    p = root / r['path']
    try:
        with p.open('rb') as f: h = hashlib.file_digest(f, 'sha256').hexdigest()
        s = p.stat()
        changed = (s.st_size, s.st_mtime_ns, s.st_ctime_ns) != (r['bytes'],r['mtime_ns'],r['ctime_ns'])
        return r, h, changed
    except OSError as e: return r, None, str(e)

counts = Counter(); amounts = Counter(); groups = defaultdict(Counter)
unique = set(); unique_bytes = 0; unstable = []; changed_files = []; last = time.monotonic()
with ThreadPoolExecutor(max_workers=4) as pool:
    for i, (r, h, unstable_flag) in enumerate(pool.map(digest, rows, buffersize=32), 1):
        p, n = r['path'], r['bytes']
        if unstable_flag: unstable.append({'path':p,'problem':unstable_flag})
        category = 'new' if p not in old else ('unchanged' if n == old[p]['bytes'] and h == old[p]['sha256'] else 'modified')
        counts[category] += 1; amounts[category] += n
        if category != 'unchanged':
            changed_files.append({'path':p,'bytes':n,'category':category})
            groups[p.split('/')[0]][category+'Bytes'] += n
            groups[p.split('/')[0]][category+'Files'] += 1
        key = (n, h) if h is not None else (n, 'unique-size:'+p)
        if key in old_content:
            counts['reusableFromBaseline'] += 1; amounts['reusableFromBaseline'] += n
        elif key not in unique:
            unique.add(key); unique_bytes += n
        if time.monotonic()-last > 25:
            print(json.dumps({'phase':'hashing','processed':i,'total':len(rows),'uniqueNewBytesSoFar':unique_bytes}), flush=True); last=time.monotonic()
current_paths = {r['path'] for r in rows}
deleted = [p for p in old if p not in current_paths]
for r in rows:
    try:
        s=(root/r['path']).stat()
        if (s.st_size,s.st_mtime_ns,s.st_ctime_ns)!=(r['bytes'],r['mtime_ns'],r['ctime_ns']): unstable.append({'path':r['path'],'problem':'changed since inventory'})
    except OSError as e: unstable.append({'path':r['path'],'problem':str(e)})
free = shutil.disk_usage(root).free
result = {'baseline':str(manifest_path),'baselineCompletedAt':manifest['completedAt'],'baselineDataFiles':len(old),'baselineDataBytes':sum(f['bytes'] for f in old.values()),'currentFiles':len(rows),'currentBytes':sum(r['bytes'] for r in rows),'counts':dict(counts),'bytes':dict(amounts),'deletedFiles':len(deleted),'deletedBaselineBytes':sum(old[p]['bytes'] for p in deleted),'uniqueNewContentBytes':unique_bytes,'freeBytes':free,'pathDeltaWith10PercentHeadroomBytes':int((amounts['new']+amounts['modified'])*1.1),'deduplicatedDeltaWith10PercentHeadroomBytes':int(unique_bytes*1.1),'unstable':unstable,'groups':dict(groups),'largestChangedFiles':sorted(changed_files,key=lambda r:r['bytes'],reverse=True)[:30],'scope':'HeartWordData compared with data entries; content reuse checked against all baseline entries. No baseline media recalled. Application changes, SQLite-consistent snapshots, backup metadata and any external referenced assets not measured. Whole-file deduplication, not chunk-level. Read-only measurement, not a backup.'}
out.write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k not in ('largestChangedFiles','groups')},indent=2),flush=True)
