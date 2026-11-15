param([switch]$MirrorOnly,[switch]$CheckOnly)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSCommandPath
$config=Get-Content -Raw -LiteralPath (Join-Path $taskRoot 'config.json') | ConvertFrom-Json
$statePath=Join-Path $taskRoot 'state.json'
$runnerMutex=New-Object System.Threading.Mutex($false,('Local\HeartWordVerifiedBackup-'+[Security.Principal.WindowsIdentity]::GetCurrent().User.Value))
function Save-State($value) { $value | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath "$statePath.tmp"; Move-Item -LiteralPath "$statePath.tmp" -Destination $statePath -Force }
function Invoke-Node($helper,$extra) {
 & $config.node (Join-Path $taskRoot $helper) @extra
 if ($LASTEXITCODE -ne 0) { throw "$helper failed ($LASTEXITCODE)." }
}
try { $ownsMutex=$runnerMutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $ownsMutex=$true }
if(-not $ownsMutex){$runnerMutex.Dispose();Write-Output 'Another scheduled backup is active.';exit 0}
try {
 $state=if(Test-Path -LiteralPath $statePath){Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json}else{$null}
 $previousSuccess=if($state){$state.lastSuccessWindow}else{$null}
 $currentId=if($state -and $state.currentSnapshot){$state.currentSnapshot}else{$config.initialCurrentSnapshot}
 $externalId=if($state -and $state.externalSnapshot){$state.externalSnapshot}else{$config.initialExternalSnapshot}
 $window=(Get-Date).AddMinutes(30).Date.ToString('yyyy-MM-dd')
 if(-not $MirrorOnly -and -not $CheckOnly -and $previousSuccess -eq $window){Write-Output 'This nightly backup is complete.'; exit 0}
 $disk=Get-Partition -DriveLetter D | Get-Disk
 if($disk.UniqueId -ne $config.diskUniqueId){throw 'Expected external backup drive is unavailable; leaving source untouched.'}
 $account=Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\OneDrive\Accounts\Personal'
 if($account.UserFolder -ne $config.oneDriveRoot -or $account.UserEmail -ne $config.oneDriveEmail){throw 'Personal OneDrive account/root changed; review destination.'}
 if(-not(Test-Path -LiteralPath (Join-Path $config.repository 'config')) -or -not(Test-Path -LiteralPath $config.password)){throw 'Existing repository or recovery key unavailable.'}
 if((Get-PSDrive C).Free -lt 20GB -or (Get-PSDrive D).Free -lt 20GB){throw 'Backup requires at least 20 GiB free on C: and D:.'}
 if(-not [String]::IsNullOrWhiteSpace($env:HEARTWORD_DATA_DIR) -and [IO.Path]::GetFullPath($env:HEARTWORD_DATA_DIR.Trim()) -ne $config.data){throw 'Environment data directory changed; review backup configuration.'}
 $configuredData=Get-Content -LiteralPath (Join-Path $config.application '.env') | Where-Object {$_ -match '^\s*HEARTWORD_DATA_DIR\s*='} | Select-Object -Last 1
 if($configuredData){$configuredData=($configuredData -split '=',2)[1].Trim().Trim('"',"'");if($configuredData -and [IO.Path]::GetFullPath($configuredData) -ne $config.data){throw 'Application data directory changed; review backup configuration.'}}
 if(-not $MirrorOnly){
  Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class HeartWordIdle { [StructLayout(LayoutKind.Sequential)] struct Info { public uint size; public uint time; } [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref Info i); public static double Seconds() { var i=new Info(); i.size=(uint)Marshal.SizeOf(i); if(!GetLastInputInfo(ref i)) throw new Exception("Idle check failed"); return unchecked((uint)Environment.TickCount-i.time)/1000.0; } }'
  if([HeartWordIdle]::Seconds() -lt 900){Write-Output 'Deferred: computer was used within 15 minutes.'; exit 0}
  $database=Join-Path $config.data 'db\heartword.sqlite'
  foreach($p in @($database,"$database-wal")){if((Test-Path -LiteralPath $p) -and (Get-Item -LiteralPath $p).LastWriteTimeUtc -gt [DateTime]::UtcNow.AddMinutes(-15)){Write-Output 'Deferred: HeartWord database recently active.';exit 0}}
 }
 if($CheckOnly){Write-Output 'Configuration and idle guards passed; no backup started.';exit 0}
 $run=Join-Path $config.runs ((Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,8))
 New-Item -ItemType Directory -Path $run | Out-Null
 if(-not $MirrorOnly){
  $capture=Join-Path $run 'capture'
  $common=@('--capture',$capture,'--repo',$config.repository,'--password',$config.password,'--restic',$config.restic)
  Invoke-Node 'backup-restic-current.mjs' ($common+@('--data',$config.data,'--app',$config.application,'--parent',$currentId))
  Invoke-Node 'backup-restic-external.mjs' ($common+@('--parent',$externalId))
  Invoke-Node 'backup-restic-verify.mjs' $common
  $proof=Get-Content -Raw -LiteralPath (Join-Path $run 'verified.json') | ConvertFrom-Json
  if(-not $proof.passed){throw 'Restore verification did not pass.'}
  $currentId=$proof.currentSnapshot;$externalId=$proof.externalSnapshot
  @{format='heartword-restic-sqlite-overlay-v1';currentSnapshot=$currentId;externalSnapshot=$externalId;dataRoot=$config.data;applicationRoot=$config.application;captureRoot=$capture;sqliteOverlayRelativeRoot='sqlite';externalInventoryRoot=$run;note='Restore ordinary data plus capture/sqlite over the same new data target. Restore external references separately using external-inventory.json. Use only verified snapshot IDs; source paths need projection on a different computer.'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $run 'recovery.json')
  Invoke-Node 'backup-restic-clean-run.mjs' @($run)
 }
 # Capture processes have exited and released repository locks. Never mirror
 # locks, prune, /MIR or /PURGE. Existing cloud snapshots remain recoverable.
 if(Get-ChildItem -LiteralPath (Join-Path $config.repository 'locks') -Force -ErrorAction SilentlyContinue){throw 'Repository is in use; postpone OneDrive copy.'}
 $sourceFiles=Get-ChildItem -LiteralPath $config.repository -File -Recurse | Where-Object {$_.FullName -notlike '*\locks\*'}
 $changed=@();[long]$needed=0
 foreach($f in $sourceFiles){$relative=$f.FullName.Substring($config.repository.Length).TrimStart('\');$destination=Join-Path $config.mirror $relative;$d=Get-Item -Force -LiteralPath $destination -ErrorAction SilentlyContinue;if(-not $d -or $d.Length -ne $f.Length -or [Math]::Abs(($d.LastWriteTimeUtc-$f.LastWriteTimeUtc).TotalSeconds) -gt 2){$changed+=@{source=$f.FullName;destination=$destination;name=$f.Name};$needed+=$f.Length}}
 if((Get-PSDrive C).Free -lt ($needed+20GB)){throw 'Insufficient local space for the OneDrive encrypted delta; D: backup remains available.'}
 & "$env:SystemRoot\System32\robocopy.exe" $config.repository $config.mirror /E /FFT /COPY:DAT /DCOPY:T /R:2 /W:2 /XJ /NP /XD (Join-Path $config.repository 'locks') "/LOG:$(Join-Path $run 'onedrive-robocopy.log')"
 $copyCode=$LASTEXITCODE;if($copyCode -ge 8){throw "Robocopy failed: $copyCode"}
 foreach($f in $changed){$actual=(Get-FileHash -Algorithm SHA256 -LiteralPath $f.destination).Hash.ToLowerInvariant();$expected=if($f.name -match '^[a-f0-9]{64}$'){$f.name}else{(Get-FileHash -Algorithm SHA256 -LiteralPath $f.source).Hash.ToLowerInvariant()};if($actual -ne $expected){throw "OneDrive local copy hash mismatch: $($f.destination)"}}
 $completed=@{at=[DateTime]::UtcNow.ToString('o');lastSuccessWindow=if($MirrorOnly){$previousSuccess}else{$window};currentSnapshot=$currentId;externalSnapshot=$externalId;state='external-verified-onedrive-local-copy-verified-upload-unconfirmed';run=$run;deltaFiles=$changed.Count;deltaBytes=$needed;robocopyExit=$copyCode;cloudDelivery='Upload and remote readback are not established by a local mirror.'}
 $completed | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $run 'completed.json')
 $catalog=Join-Path (Join-Path (Split-Path -Parent $config.mirror) 'verification') (Split-Path -Leaf $run)
 New-Item -ItemType Directory -Path $catalog -Force | Out-Null
 foreach($name in @('verified.json','recovery.json','completed.json')){
  $from=Join-Path $run $name
  if(Test-Path -LiteralPath $from){$to=Join-Path $catalog $name;Copy-Item -LiteralPath $from -Destination $to;if((Get-FileHash -Algorithm SHA256 -LiteralPath $from).Hash -ne (Get-FileHash -Algorithm SHA256 -LiteralPath $to).Hash){throw "Recovery catalog hash mismatch: $name"}}
 }
 Save-State $completed
 Write-Output ($completed | ConvertTo-Json)
} catch {
 Save-State @{at=[DateTime]::UtcNow.ToString('o');state='failed';error=$_.Exception.Message;lastSuccessWindow=$previousSuccess;currentSnapshot=$currentId;externalSnapshot=$externalId}
 throw
} finally { $runnerMutex.ReleaseMutex();$runnerMutex.Dispose() }
