"""Bot-authored: static-protect overlay for the breathing zone. Hair pixels (dark saturated blue)
that are connected to the outside of the torso (outer long hair, braid, background) are copied from
the original into an RGBA layer drawn on top of the warped chest, so hair stays pixel-static.
Hair-coloured pixels fully enclosed by the body (the sheer robe panel) are NOT protected."""
import numpy as np, cv2
from PIL import Image
R='/workspace/lanyi-portrait-v2-bot/'
src=np.asarray(Image.open(R+'assets/source_original.jpg').convert('RGB')).astype(np.int32)
X0,Y0,X1,Y1=380,280,745,565
reg=src[Y0:Y1,X0:X1]
r,g,b=reg[...,0],reg[...,1],reg[...,2]
lum=.299*r+.587*g+.114*b
hair=((b>r+25)&(lum<95)).astype(np.uint8)
hair=cv2.morphologyEx(hair,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
n,lab=cv2.connectedComponents(hair,connectivity=8)
h,w=hair.shape
outer=np.zeros_like(hair,bool)
seeds=set(lab[0,:])|set(lab[:,0])|set(lab[:,-1])   # top/left/right borders (not bottom: robe panel exits there)
seeds.discard(0)
for s in seeds: outer|=(lab==s)
# braid: explicit polygon guard as well (x 466..500, y 290..565)
braid=np.zeros_like(hair); cv2.fillPoly(braid,[np.array([[466-X0,0],[505-X0,0],[505-X0,h],[464-X0,h]])],1)
prot=outer|((braid>0)&(hair>0))
prot=cv2.dilate(prot.astype(np.uint8),np.ones((3,3),np.uint8))
a=cv2.GaussianBlur(prot.astype(np.float32),(0,0),0.8)
a=np.clip(a*1.5,0,1); a[prot>0]=np.maximum(a[prot>0],0)  # keep core
core=cv2.erode(prot,np.ones((3,3),np.uint8))>0
a[core]=1.0
rgba=np.dstack([reg.astype(np.uint8),(a*255).round().astype(np.uint8)])
Image.fromarray(rgba,'RGBA').save(R+'assets/layer_static_protect.png')
np.save(R+'work/protect_core_mask.npy',core)
vis=reg.copy(); vis[a>0.5]=(vis[a>0.5]*0.4+np.array([255,0,0])*0.6)
Image.fromarray(vis.astype(np.uint8)).resize((w*2,h*2)).save(R+'work/protect_vis.png')
print('protected px',int((a>0.5).sum()),'of',h*w)
