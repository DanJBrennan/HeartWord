"""Write one host-verified allowance permit; never obtain or infer account usage."""
import argparse, datetime, json, pathlib, sqlite3
p=argparse.ArgumentParser();p.add_argument('--observed-at',required=True);p.add_argument('--used-percent',type=int,required=True);p.add_argument('--ordinary-allowed',required=True);args=p.parse_args()
root=pathlib.Path(__file__).resolve().parent
now=datetime.datetime.now(datetime.timezone.utc)
observed=datetime.datetime.fromisoformat(args.observed_at.replace('Z','+00:00'))
assert 0 <= (now-observed).total_seconds() <= 30
assert args.ordinary_allowed=='yes' and 0 <= args.used_percent < 100
snapshot={'observedAt':args.observed_at,'usedPercent':args.used_percent,'ordinaryUsageAllowed':True}
snapshot_file=root/'allowance-snapshot.json';snapshot_temp=root/'allowance-snapshot.json.host-tmp'
snapshot_temp.write_text(json.dumps(snapshot),encoding='utf-8');snapshot_temp.replace(snapshot_file)
pending=root/'allowance-pending.json'
if not pending.exists():
 print('No pending request');raise SystemExit(0)
request=json.loads(pending.read_text(encoding='utf-8'))
db=sqlite3.connect('file:C:/Users/danbr/HeartWordData/db/heartword.sqlite?mode=ro',uri=True)
run=db.execute("SELECT id,status FROM production_runs WHERE project_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1",('c457a815-d07d-4902-91b5-7b936b549856',)).fetchone();db.close()
assert run and run[1]=='running' and request['eventId'].startswith(run[0]+':')
state=json.loads((root/'bounded-resume-20261104.json').read_text(encoding='utf-8'))
assert state['status'].startswith('authorized_') and args.used_percent<state['allowance']['stopAtUsedPercent']
assert not any(r['id']==request['eventId'] for r in state['reservations'])
assert not (root/'allowance-permit.json').exists()
for name,value in [('allowance-permit.json',{'eventId':request['eventId'],'at':now.isoformat()})]:
 target=root/name;temp=root/(name+'.host-tmp');temp.write_text(json.dumps(value),encoding='utf-8');temp.replace(target)
print(json.dumps({'permit':request['eventId'],'usedPercent':args.used_percent}))
