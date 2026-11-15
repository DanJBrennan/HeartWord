import os, ctypes, json, time
from collections import defaultdict
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

api = ctypes.WinDLL('kernel32', use_last_error=True)
allocated = api.GetCompressedFileSizeW
allocated.argtypes = [ctypes.c_wchar_p, ctypes.POINTER(ctypes.c_ulong)]
allocated.restype = ctypes.c_ulong
totals = defaultdict(lambda: [0,0,0])
errors = []; skipped = []; started = time.monotonic()
base = '\\\\?\\C:\\'

def scan(name):
    local = defaultdict(lambda: [0,0,0]); err=[]; skip=[]
    def walk(path, parts):
        try:
            with os.scandir(path) as entries:
                for e in entries:
                    p = parts + [e.name]
                    try:
                        if e.is_symlink() or e.is_junction(): skip.append('/'.join(p)); continue
                        if e.is_dir(follow_symlinks=False): walk(e.path,p)
                        elif e.is_file(follow_symlinks=False):
                            s=e.stat(follow_symlinks=False); hi=ctypes.c_ulong()
                            ctypes.set_last_error(0)
                            lo=allocated(e.path,ctypes.byref(hi))
                            if lo==0xffffffff and ctypes.get_last_error():
                                err.append({'path':'/'.join(p),'error':'allocation unavailable'}); a=0
                            else: a=(hi.value << 32) | lo
                            # Report top-level usage and relevant profile subtrees.
                            depths=[1]
                            if p[0]=='Users':
                                depths.extend([2,3])
                                if len(p)>2 and p[1]=='danbr':
                                    if p[2].startswith('HeartWord') or p[2] in ['OneDrive','OneDrive - dsc','AppData','.cache','.codex','Downloads']:
                                        depths.extend(range(4,min(len(p),7)+1))
                            for d in set(depths):
                                if d<=len(p):
                                    t=local['/'.join(p[:d])];t[0]+=s.st_size;t[1]+=a;t[2]+=1
                    except OSError as ex: err.append({'path':'/'.join(p),'error':str(ex)})
        except OSError as ex: err.append({'path':'/'.join(parts),'error':str(ex)})
    full=base+name
    if os.path.isdir(full) and not os.path.isjunction(full) and not os.path.islink(full): walk(full,[name])
    return name,local,err,skip

with ThreadPoolExecutor(max_workers=4) as pool:
    for name,local,err,skip in pool.map(scan,os.listdir(base)):
        for p,v in local.items():
            for i in range(3): totals[p][i]+=v[i]
        errors.extend(err); skipped.extend(skip)
        if local: print(json.dumps({'finished':name,'allocatedGiB':round(local[name][1]/2**30,2)}),flush=True)
result={'elapsedSeconds':round(time.monotonic()-started,1),'note':'Metadata-only allocation scan; no cloud file content read. Junctions/symlinks skipped. File allocation summed by path; hardlinks may be counted more than once. Inaccessible system files and root-level files not included.','folders':[{'path':p,'logicalBytes':v[0],'allocatedBytes':v[1],'files':v[2]} for p,v in sorted(totals.items(),key=lambda kv:kv[1][1],reverse=True)],'errors':errors,'skippedLinks':skipped}
Path(__file__).with_name('disk-space-20261113.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps({'elapsedSeconds':result['elapsedSeconds'],'errors':len(errors),'topFolders':result['folders'][:30]},indent=2),flush=True)
