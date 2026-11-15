"""One-off recovery prefetch for completed backup files at Win32 MAX_PATH.

CfSetPinState asks OneDrive to download its cloud bytes; no file content is
supplied, replaced, renamed or deleted. Hash verification remains separate.
"""
import ctypes
from ctypes import wintypes
import json
import os
import shutil
import sys
import time

root = r"C:\Users\danbr\OneDrive\Documents\OneDrive - Personal\OneDrive\HeartWordBackups\20261024-first-personal"
manifest = json.load(open("outputs/disaster-backup-manifest-20261024.json", encoding="utf-8-sig"))
before = json.load(open("outputs/disaster-backup-cloud-only-before-restore-20261024.json"))
assert before["backupId"] == manifest["id"] and before["allInSync"] and before["allCloudOnly"]
entries = []
for entry in manifest["files"]:
    relative = entry["path"]
    assert not os.path.isabs(relative) and not any(p in ("", ".", "..") for p in relative.split("/")) and "\\" not in relative and ":" not in relative
    path = os.path.normpath(os.path.join(root, relative))
    if len(path) >= 260:
        entries.append((path, entry["bytes"]))
needed = sum(size for _, size in entries)
assert shutil.disk_usage(root).free > needed + 20 * 1024**3, "Insufficient recovery-cache headroom"

kernel = ctypes.WinDLL("kernel32", use_last_error=True)
cloud = ctypes.WinDLL("CldApi")
ctypes.WinDLL("ntdll").RtlSetThreadPlaceholderCompatibilityMode(2)
kernel.CreateFileW.argtypes = [wintypes.LPCWSTR,wintypes.DWORD,wintypes.DWORD,wintypes.LPVOID,wintypes.DWORD,wintypes.DWORD,wintypes.HANDLE]
kernel.CreateFileW.restype = wintypes.HANDLE
kernel.CloseHandle.argtypes = [wintypes.HANDLE]
cloud.CfSetPinState.argtypes = [wintypes.HANDLE,ctypes.c_int,wintypes.DWORD,wintypes.LPVOID]
cloud.CfSetPinState.restype = ctypes.c_long
kernel.GetFileAttributesW.argtypes = [wintypes.LPCWSTR]
kernel.GetFileAttributesW.restype = wintypes.DWORD

report = {"backupId":manifest["id"],"directory":root,"pid":os.getpid(),"files":len(entries),"bytes":needed,"pinRequestsAccepted":0,"phase":"requesting-download","contentSupplied":False,"hashVerification":"pending"}
def save():
    report["at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())
    with open("outputs/disaster-backup-long-path-recall-20261025.json","w") as out:
        json.dump(report,out,indent=2)

try:
    save()
    for path, _ in entries:
        attrs = kernel.GetFileAttributesW("\\\\?\\"+path)
        if attrs != 0xffffffff and attrs & 0x80000 and not attrs & 4096:
            report["pinRequestsAccepted"] += 1
            continue
        handle = kernel.CreateFileW("\\\\?\\"+path,0x80000000,7,None,3,0,None)
        if handle == ctypes.c_void_p(-1).value:
            raise OSError(ctypes.get_last_error(), "Cannot open pin metadata handle", path)
        try:
            result = cloud.CfSetPinState(handle,1,0,None)
            if result:
                raise OSError(result, "OneDrive explicit download request rejected", path)
        finally:
            kernel.CloseHandle(handle)
        report["pinRequestsAccepted"] += 1
        if report["pinRequestsAccepted"] % 500 == 0:
            save()
    # Bulk explicit downloads can exceed the original 30-minute diagnostic
    # window. Allow two hours; an existing running attempt keeps its own bound.
    deadline = time.monotonic()+7200
    while True:
        pending = []
        for path, _ in entries:
            attrs = kernel.GetFileAttributesW("\\\\?\\"+path)
            if attrs == 0xffffffff or attrs & 4096:
                pending.append(path)
        report.update({"phase":"waiting-for-download" if pending else "downloaded-awaiting-hashes","pendingFiles":len(pending),"pendingExamples":pending[:5]})
        save()
        if not pending:
            print(json.dumps(report),flush=True)
            break
        if time.monotonic() > deadline:
            raise TimeoutError("Long-path explicit download did not finish in two hours; preserve backup and inspect OneDrive")
        time.sleep(20)
except Exception as exc:
    report.update({"phase":"failed","error":repr(exc)})
    save()
    raise
