import json, hashlib
from pathlib import Path
from datetime import datetime, timezone

root=Path('C:/Users/danbr/HeartWordData/assets/preparation/mark6-palace-light-evidence-20261105')
root.mkdir(parents=True,exist_ok=True)
base=Path('C:/Users/danbr/HeartWordData/assets/generated/lip-sync'); media=[]
for name in ['herod','daughter']:
    folder=base/('ltx-mark6-representative-'+name+'-v2-20261104-v1')
    manifest=folder/'line.json'; line=json.loads(manifest.read_text(encoding='utf-8'))
    source=folder/'carry-0.png'; raw=source.read_bytes(); sha=hashlib.sha256(raw).hexdigest()
    dest=root/(name+'-existing-native-carry-0.png')
    if dest.exists(): assert dest.read_bytes()==raw
    else:
        with dest.open('xb') as f: f.write(raw)
    observation=('Herod front view: broad warm modeling, image-left/Herod-right somewhat stronger than image-right. '
                 if name=='herod' else 'Daughter near-front view: soft broad modeling, image-right/her-left highlight compatible with a reverse view. ')
    caption=('Existing actual LTX retained-frame carry, not a generated new still. Lighting evidence ONLY; not canon promotion, shot acceptance or a generation start. '
             'Edge padding outside retained scene crop must not be copied. '+observation+
             'These pixels alone do not establish hall geography or fixture positions. Preserve compatible existing performance light; confirm exact target orientation/crop before reuse.')
    media.append({'key':name+'-existing-native-light','path':str(dest),'sha256':sha,'mimeType':'image/png',
                  'characterIds':[line['character']['characterId']],'caption':caption,'sourcePath':str(source),
                  'lineManifest':str(manifest),'lineManifestSha256':hashlib.sha256(manifest.read_bytes()).hexdigest(),
                  'originalSceneCrop':line['crop']})
proof={
    'at':datetime.now(timezone.utc).isoformat(),
    'status':'prepared_existing_native_light_evidence_not_delivered_to_live_crew',
    'actor':'Codex under Dan delegated routine production authority; not a native crew verdict or personal Dan approval',
    'observed':'Herod near-front retained frame has somewhat stronger broad warm modeling from image-left/his-right; daughter has a soft image-right/her-left highlight. Both have fill. No fixture geometry, source coordinates or luminance measurement inferred. Edge padding is outside lighting assessment.',
    'productionProposal':'Use entrance-to-royal-end as the single hall coordinate convention. A candidate compatible reconstruction is dominant soft warm key from hall-left in that view (Herod anatomical-right while facing entrance), projecting to image-right in the reverse view of the daughter facing the royal end. This is a proposed production convention, not recovered historical/location fact. Lighting and Camera must explicitly accept/reject/reconcile against their shot views; no issue closed here. Keep weaker bounce, matched exposure/white balance and compatible prior performance light. No independent reversal relighting or invented fixture coordinates.',
    'limitations':'Qualitative still inspection only. Test native performances remain unselected chapter media. No new actual-video, source-synchronization, audio, native-language or whole-scene QA claimed. Original pose/wardrobe/canon authorities unchanged. Live crew snapshot and all DB inputs untouched.',
    'media':media,
    'futureSupplementalManifest':'These two factual test-frame references may replace three earlier supplementary preparation candidates in a future fresh context, retaining normal current approved canon references. Never mutate a live pinned manifest.',
    'databaseWrites':0,'newImageGenerationCalls':0,'newProviderCalls':0,'issuesClosed':0
}
for path in [root/'evidence.json',Path('outputs/mark6-production/palace-light-evidence-prepared-20261105.json')]:
    path.write_text(json.dumps(proof,indent=2),encoding='utf-8')
print(json.dumps({'evidenceFrames':len(media),'databaseWrites':0,'newProviderCalls':0,'notDeliveredToLiveCrew':True}))
