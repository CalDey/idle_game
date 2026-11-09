"""2x rest vs frame checks for the v4 right-hair / chest-braid locks."""
import numpy as np
from PIL import Image, ImageDraw
R='/workspace/lanyi-portrait-v2-bot/'
W,H=1008,1792; fs=W*H*4
f=np.memmap(R+'work/frames_full_stronger_v4.rgba',np.uint8,'r')
src=np.asarray(Image.open(R+'assets/source_original.jpg').convert('RGB')).astype(int)
items=[('right hair edge (max sway t=19.1s)',574,(580,100,730,420)),('right strands over chest junction (t=19.1s)',574,(590,300,730,430)),
       ('chest braid (max t=2.7s)',80,(436,296,530,506)),('chest braid at breath peak (t=11.5s)',345,(436,296,530,506))]
ims=[]
for name,i,(x0,y0,x1,y1) in items:
    fr=np.array(f[i*fs:(i+1)*fs].reshape(H,W,4)[...,:3]).astype(int)
    sz=((x1-x0)*2,(y1-y0)*2)
    a=Image.fromarray(src[y0:y1,x0:x1].astype(np.uint8)).resize(sz,Image.NEAREST)
    b=Image.fromarray(fr[y0:y1,x0:x1].astype(np.uint8)).resize(sz,Image.NEAREST)
    d=np.abs(fr[y0:y1,x0:x1]-src[y0:y1,x0:x1]).max(2)
    c=Image.fromarray(np.clip(d*4,0,255).astype(np.uint8)).convert('RGB').resize(sz,Image.NEAREST)
    w=Image.new('RGB',(sz[0]*3+20,sz[1]+26),(15,15,15)); w.paste(a,(0,26)); w.paste(b,(sz[0]+10,26)); w.paste(c,(2*sz[0]+20,26))
    ImageDraw.Draw(w).text((5,6),name+': rest | frame | |diff|x4 (2x nearest)',fill=(255,255,255)); ims.append(w)
    w.save(R+'work/rc_check_%d.png'%len(ims))
S=Image.new('RGB',(max(x.width for x in ims),sum(x.height for x in ims)+10*len(ims)),(0,0,0)); y=0
for x in ims: S.paste(x,(0,y)); y+=x.height+10
S.save(R+'review/lanyi_hair4_right_chest_vs_rest_2x.png')
