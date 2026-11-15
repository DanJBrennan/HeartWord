from pathlib import Path
import json,subprocess
from PIL import Image,ImageDraw
root=Path('outputs/mark6-production/fresh-critical-review-20261112');film=Path('C:/Users/danbr/HeartWordData/assets/generated/chapter/c457a815-d07d-4902-91b5-7b936b549856/5df98f19-0a36-4ff6-9e23-1d9fc8c3726b.mp4'); groups={'water_contact':[703.5+i*.5 for i in range(16)],'banquet_end':[405+i*3 for i in range(16)],'bread_handling':[610.25+i*.5 for i in range(16)],'speech_delivery':[122.5+i for i in range(16)]};index={}
for name,times in groups.items():
 p=root/name;p.mkdir(exist_ok=True);board=Image.new('RGB',(1280,800),'#222222');draw=ImageDraw.Draw(board);index[name]=[]
 for i,t in enumerate(times):
  frame=round(t*24);sec=frame//24;local=frame-sec*24;target=p/f'{frame:05}.png';subprocess.run(['ffmpeg','-v','error','-nostdin','-n','-ss',str(sec),'-i',str(film),'-vf',f'select=eq(n\\,{local})','-fps_mode','vfr','-frames:v','1',str(target)],check=True);im=Image.open(target);im.thumbnail((320,180));x=(i%4)*320;y=(i//4)*200;board.paste(im,(x,y));draw.text((x+3,y+182),f'{int(t//60):02}:{t%60:05.2f} f{frame}',fill='white');index[name].append({'filmSec':frame/24,'frame':frame,'file':str(target)})
 board.save(root/(name+'-board.png'))
(root/'additional-direct-sample-index.json').write_text(json.dumps(index,indent=2),encoding='utf8');print('Extracted64 actual encoded-film frames in4 focused boards; no source/revision writes.')
