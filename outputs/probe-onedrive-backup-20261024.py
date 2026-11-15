"""Read Windows Cloud Files metadata without recalling any file contents."""
import ctypes
from ctypes import wintypes
import json
import os
import sys
import time

# Python can default to the legacy view that hides cloud reparse/offline bits.
# Expose them for this metadata-reading thread only; no Windows policy changes.
ntdll = ctypes.WinDLL("ntdll")
ntdll.RtlSetThreadPlaceholderCompatibilityMode.argtypes = [ctypes.c_byte]
ntdll.RtlSetThreadPlaceholderCompatibilityMode.restype = ctypes.c_byte
if ntdll.RtlSetThreadPlaceholderCompatibilityMode(2) < 0:
    raise OSError("Could not expose placeholder metadata for this thread")

class FileTime(ctypes.Structure):
    _fields_ = [("low", wintypes.DWORD), ("high", wintypes.DWORD)]

class FindData(ctypes.Structure):
    _fields_ = [("attributes", wintypes.DWORD), ("created", FileTime),
                ("accessed", FileTime), ("written", FileTime),
                ("size_high", wintypes.DWORD), ("size_low", wintypes.DWORD),
                ("tag", wintypes.DWORD), ("reserved", wintypes.DWORD),
                ("name", wintypes.WCHAR * 260), ("alternate", wintypes.WCHAR * 14)]

kernel = ctypes.WinDLL("kernel32", use_last_error=True)
kernel.FindFirstFileW.argtypes = [wintypes.LPCWSTR, ctypes.POINTER(FindData)]
kernel.FindFirstFileW.restype = wintypes.HANDLE
kernel.FindClose.argtypes = [wintypes.HANDLE]
class AttributeTag(ctypes.Structure):
    _fields_ = [("attributes", wintypes.DWORD), ("tag", wintypes.DWORD)]
kernel.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
                              wintypes.LPVOID, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
kernel.CreateFileW.restype = wintypes.HANDLE
kernel.GetFileInformationByHandleEx.argtypes = [wintypes.HANDLE, ctypes.c_int, wintypes.LPVOID, wintypes.DWORD]
kernel.GetFileInformationByHandleEx.restype = wintypes.BOOL
kernel.CloseHandle.argtypes = [wintypes.HANDLE]
cloud = ctypes.WinDLL("CldApi.dll")
cloud.CfGetPlaceholderStateFromAttributeTag.argtypes = [wintypes.DWORD, wintypes.DWORD]
cloud.CfGetPlaceholderStateFromAttributeTag.restype = wintypes.DWORD

def probe(path):
    data = FindData()
    handle = kernel.FindFirstFileW("\\\\?\\" + os.path.abspath(path), ctypes.byref(data))
    if handle == ctypes.c_void_p(-1).value:
        return {"error": ctypes.get_last_error(), "present": False}
    kernel.FindClose(handle)
    # Query the reparse point itself with no content access. Legacy directory
    # enumeration can suppress placeholder flags and tags for compatibility.
    metadata = AttributeTag(data.attributes, data.tag)
    handle = kernel.CreateFileW("\\\\?\\" + os.path.abspath(path), 0, 7, None, 3, 0x00200000, None)
    if handle != ctypes.c_void_p(-1).value:
        try:
            if not kernel.GetFileInformationByHandleEx(handle, 9, ctypes.byref(metadata), ctypes.sizeof(metadata)):
                return {"error": ctypes.get_last_error(), "present": True}
        finally:
            kernel.CloseHandle(handle)
    else:
        return {"error": ctypes.get_last_error(), "present": True}
    state = cloud.CfGetPlaceholderStateFromAttributeTag(metadata.attributes, metadata.tag)
    return {"present": True, "bytes": (data.size_high << 32) | data.size_low,
            "attributes": metadata.attributes, "tag": metadata.tag, "cloudState": state,
            "inSync": state != 0xffffffff and bool(state & 8),
            "offline": bool(metadata.attributes & 4096)}

def directory_metadata(root):
    # Windows scandir caches FindData attributes, tags and logical sizes. With
    # placeholders exposed this is the same Cloud Files evidence as probe(),
    # without opening 100,000 file handles on each polling pass.
    # Python's ordinary Win32 paths stop enumerating some descendants at
    # MAX_PATH. Use the extended-length form for this metadata-only traversal,
    # matching the direct Win32 probe above. Relative manifest keys stay intact.
    root = "\\\\?\\" + os.path.abspath(root) if not root.startswith("\\\\?\\") else root
    found = {}
    pending_directories = [root]
    while pending_directories:
        folder = pending_directories.pop()
        try:
            with os.scandir(folder) as entries:
                for entry in entries:
                    if entry.is_dir(follow_symlinks=False):
                        pending_directories.append(entry.path)
                        continue
                    key = os.path.normcase(os.path.relpath(entry.path, root)).replace("\\", "/")
                    try:
                        stat = entry.stat(follow_symlinks=False)
                        attrs, tag = stat.st_file_attributes, stat.st_reparse_tag
                        state = cloud.CfGetPlaceholderStateFromAttributeTag(attrs, tag)
                        found[key] = {"present": True, "bytes": stat.st_size,
                            "attributes": attrs, "tag": tag, "cloudState": state,
                            "inSync": state != 0xffffffff and bool(state & 8),
                            "offline": bool(attrs & 4096)}
                    except OSError as exc:
                        found[key] = {"present": True, "error": str(exc)}
        except OSError:
            # Unenumerable descendants stay absent and cannot pass the gate.
            continue
    return found

if sys.argv[1] == "--file":
    print(json.dumps(probe(sys.argv[2]), indent=2))
else:
    manifest_path, directory = sys.argv[1:3]
    with open(manifest_path, encoding="utf-8-sig") as source:
        manifest = json.load(source)
    entries = manifest["files"] + [{"path": "backup.json", "bytes": os.path.getsize(manifest_path)}]
    scan_started = time.monotonic()
    metadata_by_path = directory_metadata(directory)
    counters = {"expectedFiles": len(entries), "inSyncFiles": 0, "inSyncBytes": 0,
                "onlineOnlyFiles": 0, "pendingFiles": 0}
    pending = []
    for entry in entries:
        rel = entry["path"]
        if os.path.isabs(rel) or "\\" in rel or any(p in ("", ".", "..") for p in rel.split("/")):
            raise ValueError("Unsafe manifest path")
        result = metadata_by_path.get(os.path.normcase(rel).replace("\\", "/"), {"present": False})
        valid = result.get("inSync", False) and result.get("bytes") == entry["bytes"]
        if valid:
            counters["inSyncFiles"] += 1
            counters["inSyncBytes"] += entry["bytes"]
            if result["offline"] or entry["bytes"] == 0:
                counters["onlineOnlyFiles"] += 1
        else:
            counters["pendingFiles"] += 1
            if len(pending) < 12:
                pending.append({"path": rel, **result})
    report = {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
              "backupId": manifest["id"], "directory": directory, **counters,
              "allInSync": counters["inSyncFiles"] == len(entries),
              "allCloudOnly": counters["onlineOnlyFiles"] == len(entries),
              "pendingExamples": pending,
              "metadataScanSeconds": time.monotonic() - scan_started,
              "remoteRecoveryVerified": False,
              "method": "Scandir FindData with exposed placeholders + CfGetPlaceholderStateFromAttributeTag; no content reads or file handles"}
    with open("outputs/disaster-backup-cloud-state-20261024.json", "w", encoding="utf-8") as out:
        json.dump(report, out, indent=2)
    with open("outputs/disaster-backup-upload-progress-20261024.jsonl", "a", encoding="utf-8") as out:
        out.write(json.dumps({k: report[k] for k in ("at", "backupId", "expectedFiles", "inSyncFiles", "inSyncBytes", "onlineOnlyFiles", "pendingFiles")}) + "\n")
    print(json.dumps(report, indent=2))
