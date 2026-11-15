"""Local, optional credit-text revision recipe, never a provider request.
Existing editable chapter rebuilds use retained credits-scroll.mp4 directly.
For text revisions: python render-credits.py NEW_DIRECTORY --font INSTALLED_FONT.
Requires Python/Pillow and FFmpeg. Original media and credit text are retained.
"""
from pathlib import Path
import argparse, subprocess
from PIL import Image, ImageDraw, ImageFont

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output_directory',type=Path)
    parser.add_argument('--font',required=True,type=Path)
    args=parser.parse_args()
    original=Path(__file__).resolve().parent
    lines=(original/'credit-lines.txt').read_text(encoding='utf-8').splitlines()
    if len(lines)!=8 or any(not line.strip() for line in lines):
        raise ValueError('Review the eight-line layout before rendering changed text.')
    font=ImageFont.truetype(str(args.font.resolve()),38)
    args.output_directory.mkdir(parents=True,exist_ok=False)
    strip=Image.new('RGB',(1280,560),(14,23,28));draw=ImageDraw.Draw(strip)
    for i,line in enumerate(lines):
        if draw.textbbox((0,0),line,font=font)[2]>1160:
            raise ValueError('Credit line exceeds safe width; review layout.')
        draw.text((640,28+i*64),line,font=font,fill=(223,230,225),anchor='mt')
    strip.save(args.output_directory/'scroll.png')
    subprocess.run(['ffmpeg','-v','error','-n','-f','lavfi','-i','color=c=0x0e171c:s=1280x720:r=24:d=14','-loop','1','-framerate','24','-i',str(args.output_directory/'scroll.png'),'-filter_complex',"[0:v][1:v]overlay=x=0:y='H-100*max(0,t-0.5)':shortest=1,format=yuv420p",'-t','14','-an','-c:v','libx264','-crf','18','-movflags','+faststart',str(args.output_directory/'credits-scroll.mp4')],check=True)
    (args.output_directory/'credit-lines.txt').write_text('\n'.join(lines)+'\n',encoding='utf-8')

if __name__=='__main__': main()
