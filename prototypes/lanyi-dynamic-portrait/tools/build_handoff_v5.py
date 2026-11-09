"""Handoff for hair v5: clean underlay under the WHOLE left long-hair sheet (two 9:16 crops, upper + lower)."""
import numpy as np, cv2, json
from PIL import Image, ImageDraw
R='/workspace/lanyi-portrait-v2-bot/'; D=R+'handoff_underlay_v5/'
src=np.asarray(Image.open(R+'assets/source_original.jpg').convert('RGB')); H,W,_=src.shape
s=src.astype(np.float32); bl=s[...,2]-(s[...,0]+s[...,1])/2
yy,xx=np.mgrid[0:H,0:W]
# sheet polygon traced on the 1:1 grid: outer (left) contour top→bottom, bottom edge, then right boundary bottom→top
OUT=[(395,150),(380,200),(345,250),(305,300),(290,350),(265,400),(225,450),(205,500),(190,550),(172,600),(155,650),(138,700),
     (120,750),(112,800),(112,850),(122,900),(150,950),(165,1000),(148,1050),(118,1100),(92,1150),(66,1200),(58,1250),(64,1300),
     (74,1350),(78,1400),(62,1450),(38,1500),(8,1550),(0,1590),(0,1770),(100,1775),(200,1760),(290,1740),(360,1722),(425,1700)]
RBR=[(445,1660),(452,1550),(470,1450),(488,1300),(492,1100),(470,1000),(398,955),(385,860),(335,835),(232,742),(240,700),(300,690),
     (320,640),(350,550),(384,450),(398,330),(425,250),(432,200),(425,150)]
RB=RBR[::-1]
reg=np.zeros((H,W),np.uint8); cv2.fillPoly(reg,[np.array(OUT+RBR,np.int32)],1)
# right of the blade (below the guard) stays static: the blade hides the seam
cxl=np.interp(yy,[830,900,1100,1785,1792],[300,302,334,440,441])
reg[(yy>830)&(xx>cxl)]=0
keep=reg.copy()
# sword: existing occluder (grip/guard/upper blade, y430-1103) + lower blade (grey, low blue) near the blade line
occ=np.asarray(Image.open(R+'assets/layer_sword_occluder.png'))[...,3]>40
sword=np.zeros((H,W),bool); sword[430:430+occ.shape[0],153:153+occ.shape[1]]=occ
for y in range(1090,H):
    u=(y-1100)/(1785-1100); cx=334+(440-334)*u; hw=max(4,29*(1-u)+6*u)
    x0=int(cx-hw-10); x1=int(cx+hw+10)
    seg=(bl[y,x0:x1]<22)
    xs=np.where(seg)[0]
    if len(xs): sword[y,x0+xs.min():x0+xs.max()+1]=True
sword=cv2.morphologyEx(sword.astype(np.uint8),cv2.MORPH_CLOSE,np.ones((5,5),np.uint8))>0
np.save(D+'sword_full_mask.npy',sword)
halo=(cv2.dilate(keep,np.ones((11,11),np.uint8))>0)&(xx<=505)&~((yy<340)&(xx>432))&~((yy>830)&(xx>cxl))          # flyaway wisps around the outer edge
sheetz=halo&~(cv2.dilate(sword.astype(np.uint8),np.ones((3,3),np.uint8))>0)
# blue: thin band along the arm/sleeve/hand edge in the upper part (stays hair, darker inner hair)
line=np.zeros((H,W),np.uint8); cv2.polylines(line,[np.array(RBR[-8:],np.int32)],False,1,1)
dl=cv2.distanceTransform((1-line).astype(np.uint8),cv2.DIST_L2,5)
blue=sheetz&(dl<=20)&(yy<700)&(yy>230)
red=sheetz&~blue
np.save(D+'zone_red_full.npy',red); np.save(D+'zone_blue_full.npy',blue); np.save(D+'sheet_full.npy',sheetz)
crops={'upper':(0,200,504,896),'lower':(0,896,504,896)}
meta={}
for name,(CX,CY,CW,CH) in crops.items():
    crop=src[CY:CY+CH,CX:CX+CW]
    Image.fromarray(crop).save(D+f'{name}_reference_9x16_x{CX}_y{CY}_{CW}x{CH}.png')
    Image.fromarray(crop).resize((576,1024),Image.LANCZOS).save(D+f'{name}_reference_9x16_576x1024.png')
    a=red[CY:CY+CH,CX:CX+CW]; b=blue[CY:CY+CH,CX:CX+CW]
    vis=crop.astype(float).copy(); vis[a]=vis[a]*0.45+np.array([255,40,40])*0.55; vis[b]=vis[b]*0.45+np.array([60,140,255])*0.55
    v=Image.fromarray(vis.clip(0,255).astype(np.uint8))
    v.resize((576,1024),Image.LANCZOS).save(D+f'{name}_regions_marked_576x1024.png')
    Image.fromarray((a*255).astype(np.uint8)).save(D+f'{name}_mask_red_{CW}x{CH}.png'); Image.fromarray((b*255).astype(np.uint8)).save(D+f'{name}_mask_blue_{CW}x{CH}.png')
    meta[name]={'crop_full_image_xywh':[CX,CY,CW,CH],'x0y0x1y1':[CX,CY,CX+CW,CY+CH],'aspect':'9:16','upload_size':[576,1024],'red_px':int(a.sum()),'blue_px':int(b.sum())}
json.dump(meta,open(D+'crop_coords.json','w'),indent=1)
print(meta, 'sheet px', int(sheetz.sum()))
