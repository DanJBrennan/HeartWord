"""Read-only metadata inventory. Never opens file contents or deletes files."""
import ctypes
import heapq
import json
import os
import shutil
import sys
import time
from collections import defaultdict
from pathlib import Path

OUT = Path(__file__).parent / ("storage-supplementary-20261031.json" if len(sys.argv) > 1 else "storage-inventory-20261031.json")
getsize = ctypes.WinDLL("kernel32", use_last_error=True).GetCompressedFileSizeW
getsize.argtypes = [ctypes.c_wchar_p, ctypes.POINTER(ctypes.c_ulong)]
getsize.restype = ctypes.c_ulong
totals = defaultdict(lambda: {"logicalBytes": 0, "allocatedBytes": 0, "files": 0, "offlineFiles": 0})
seen = set()
largest = []
errors = []
skipped = []
started = time.time()
count = 0
roots = sys.argv[1:] or ["C:/Users", "C:/ProgramData", "C:/Windows", "C:/Program Files", "C:/Program Files (x86)", "C:/$Recycle.Bin"]
for root in roots:
    stack = [root]
    while stack:
        folder = stack.pop()
        try:
            with os.scandir(folder) as entries:
                for entry in entries:
                    try:
                        stat = entry.stat(follow_symlinks=False)
                        tag = getattr(stat, "st_reparse_tag", 0)
                        if tag in (0xA0000003, 0xA000000C):
                            if len(skipped) < 100: skipped.append(entry.path)
                            continue
                        if entry.is_dir(follow_symlinks=False):
                            stack.append(entry.path)
                            continue
                        identity = (stat.st_dev, stat.st_ino)
                        if stat.st_ino and identity in seen: continue
                        seen.add(identity)
                        high = ctypes.c_ulong()
                        ctypes.set_last_error(0)
                        low = getsize(entry.path, ctypes.byref(high))
                        if low == 0xFFFFFFFF and ctypes.get_last_error():
                            if len(errors) < 100: errors.append({"path": entry.path, "error": "allocation unavailable"})
                            continue
                        allocated = (high.value << 32) | low
                        offline = bool(getattr(stat, "st_file_attributes", 0) & 0x1000)
                        path = Path(entry.path)
                        for parent in path.parents:
                            if len(parent.parts) > 6: continue
                            total = totals[str(parent)]
                            total["logicalBytes"] += stat.st_size
                            total["allocatedBytes"] += allocated
                            total["files"] += 1
                            total["offlineFiles"] += offline
                        item = (allocated, str(path), stat.st_size, offline)
                        if len(largest) < 100: heapq.heappush(largest, item)
                        elif item > largest[0]: heapq.heapreplace(largest, item)
                        count += 1
                        if count % 100000 == 0:
                            print(json.dumps({"files": count, "seconds": round(time.time()-started), "root": root}), flush=True)
                    except OSError as error:
                        if len(errors) < 100: errors.append({"path": entry.path, "error": str(error)})
        except OSError as error:
            if len(errors) < 100: errors.append({"path": folder, "error": str(error)})
    print(json.dumps({"completedRoot": root, "files": count, "seconds": round(time.time()-started)}), flush=True)
report = {"readOnly": True, "fileContentsRead": False, "roots": roots, "files": count,
    "seconds": round(time.time()-started), "freeBytes": shutil.disk_usage("C:/").free,
    "directories": [{"path": path, **values} for path, values in sorted(totals.items(), key=lambda row: -row[1]["allocatedBytes"])],
    "largestFiles": [{"path": path, "allocatedBytes": allocated, "logicalBytes": logical, "offline": offline}
        for allocated, path, logical, offline in sorted(largest, reverse=True)],
    "errorsSample": errors, "skippedJunctionsAndSymlinksSample": skipped,
    "limitations": ["Accessible files only; protected files may be omitted.",
        "NTFS hard-linked file identities counted once; directory attribution uses first encountered path.",
        "Allocated sizes are metadata from GetCompressedFileSizeW; contents are never opened.",
        "Root system files, shadow copies and filesystem metadata are not included."]}
with OUT.open("x", encoding="utf-8") as f: json.dump(report, f, indent=2)
print(json.dumps({"report": str(OUT), "freeBytes": report["freeBytes"]}), flush=True)
