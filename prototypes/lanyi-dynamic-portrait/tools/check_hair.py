"""2x rest vs max-sway check crops from the rendered v2 frames (work/frames_full_stronger_v2.rgba)."""
import numpy as np, sys, os
from PIL import Image, ImageDraw
R='/workspace/lanyi-portrait-v2-bot/'; SUF=sys.argv[1] if len(sys.argv)>1 else ''; MODE=sys.argv[2] if len(sys.argv)>2 else 'v3'; FT=float(sys.argv[3]) if len(sys.argv)>3 else None
W,H=1008,1792; fs=W*H*4
f=np.memmap(R+'work/frames_full_stronger_'+MODE+'.rgba',np.uint8,'r'); n=f.size//fs
src=np.asarray(Image.open(R+'assets/source_original.jpg').convert('RGB')).astype(int)
best=(0,0)
for i in range(0,n,3):
    fr=f[i*fs:(i+1)*fs].reshape(H,W,4)[260:1060,60:420,:3].astype(int)
    m=np.abs(fr-src[260:1060,60:420]).mean()
    if m>best[0]: best=(m,i)
i=best[1] if FT is None else int(round(FT*30)); fr=np.array(f[i*fs:(i+1)*fs].reshape(H,W,4)[...,:3]); print('max frame',i,i/30)
boxes={'lock_gaps_mid':(80,560,280,780),'lock_gaps_lower':(80,780,280,960),'sky_upper_locks':(150,270,400,470),'pagoda_mid_locks':(60,470,270,700),'stairs_tips':(60,740,280,1040),'hilt':(150,420,330,560),'sleeve_edge':(290,450,440,720)}
ims=[]
for k,(x0,y0,x1,y1) in boxes.items():
    sz=((x1-x0)*2,(y1-y0)*2)
    a=Image.fromarray(src[y0:y1,x0:x1].astype(np.uint8)).resize(sz,Image.NEAREST)
    b=Image.fromarray(fr[y0:y1,x0:x1]).resize(sz,Image.NEAREST)
    d=np.abs(fr[y0:y1,x0:x1].astype(int)-src[y0:y1,x0:x1]).max(2)
    c=Image.fromarray(np.clip(d*4,0,255).astype(np.uint8)).convert('RGB').resize(sz,Image.NEAREST)
    w=Image.new('RGB',(sz[0]*3+20,sz[1]+28),(20,20,20)); w.paste(a,(0,28)); w.paste(b,(sz[0]+10,28)); w.paste(c,(2*sz[0]+20,28))
    ImageDraw.Draw(w).text((6,6),f'{k}: rest | max sway t={i/30:.1f}s | |diff|x4  (2x nearest)',fill=(255,255,255))
    w.save(R+f'work/hair{MODE[1]}_check{SUF}_{k}.png'); ims.append(w)
Wm=max(x.width for x in ims); Hs=sum(x.height for x in ims)+10*len(ims)
S=Image.new('RGB',(Wm,Hs),(10,10,10)); y=0
for x in ims: S.paste(x,(0,y)); y+=x.height+10
S.save(R+'review/lanyi_hair'+MODE[1]+'_max_vs_rest_2x'+('' if FT is None else '_t%.1f'%FT)+'.png')
