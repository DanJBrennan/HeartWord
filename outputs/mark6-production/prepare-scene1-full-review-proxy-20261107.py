from pathlib import Path
import json,hashlib,subprocess,datetime
root=Path(__file__).resolve().parent
folder=root/'scene1-complete-source-window-20261107'
m=json.loads((folder/'manifest.json').read_text())
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def run(args):return subprocess.check_output(args,stderr=subprocess.STDOUT,text=True,encoding='utf8')
def probe(p):return json.loads(run(['ffprobe','-v','error','-show_streams','-of','json',str(p)]))
def packets(p):
    a=json.loads(run(['ffprobe','-v','error','-select_streams','a','-show_packets','-show_data_hash','sha256','-of','json',str(p)]))
    return [(x['pts'],x['duration'],x['size'],x['data_hash']) for x in a['packets']]
original=Path(m['output']);assert sha(original)==m['outputSha256'] and m['pictureFrames']==2369
proxy=folder/'mark6-scene1-review-proxy.mp4'
assert not proxy.exists(),'Existing proxy: inspect retained proof instead of overwriting.'
run(['ffmpeg','-hide_banner','-loglevel','error','-i',str(original),'-map','0:v:0','-map','0:a:0','-c:v','libx264','-preset','fast','-crf','25','-threads','4','-pix_fmt','yuv420p','-fps_mode','passthrough','-enc_time_base:v','1:24','-c:a','copy','-movie_timescale','24000','-movflags','+faststart',str(proxy)])
p=probe(proxy);v=next(s for s in p['streams'] if s['codec_type']=='video');a=next(s for s in p['streams'] if s['codec_type']=='audio')
assert (v['width'],v['height'],v['nb_frames'],v['r_frame_rate'],v['start_time'])==(1280,720,'2369','24/1','0.000000')
assert a['duration_ts']==2368296 and a['time_base']=='1/24000' and a['start_time']=='0.000000'
assert packets(original)==packets(proxy) and sha(original)==m['outputSha256']
assert proxy.stat().st_size<17*1024*1024
proof=dict(at=datetime.datetime.now(datetime.timezone.utc).isoformat(),originalPath=str(original),originalSha256=sha(original),proxyPath=str(proxy),proxySha256=sha(proxy),proxyBytes=proxy.stat().st_size,pictureFrames=2369,width=1280,height=720,fps=24,audioPacketsIdentical=True,audioDurationSamples=2368296,lossyPictureEncoding='H264 CRF25, same geometry/frame count/timing; fine texture cannot certify exact identity.',originalUnchanged=True,sourceManifestSha256=sha(folder/'manifest.json'),providerCalls=0)
(folder/'review-proxy-proof.json').write_text(json.dumps(proof,indent=2),encoding='utf8')
print(json.dumps(proof))
