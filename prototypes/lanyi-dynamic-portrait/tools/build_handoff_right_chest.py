"""Handoff for hair v3 step 2: clean underlay under the RIGHT hair edge and the CHEST BRAID (one 9:16 crop)."""
import numpy as np, cv2, json
from PIL import Image, ImageDraw
R='/workspace/lanyi-portrait-v2-bot/'; D=R+'handoff_underlay_right_chest/'
src=np.asarray(Image.open(R+'assets/source_original.jpg').convert('RGB')); H,W,_=src.shape
CX,CY,CW,CH=440,40,288,512          # 9:16 exactly
crop=src[CY:CY+CH,CX:CX+CW]
Image.fromarray(crop).save(D+'right_chest_reference_9x16_x440_y40_288x512.png')
Image.fromarray(crop).resize((576,1024),Image.LANCZOS).save(D+'right_chest_reference_9x16_576x1024.png')
s=src.astype(int)
# --- right hair: outer (right) contour over the forest; hair lies to the left of it
OR=[(606,120),(618,132),(626,150),(631,180),(632,220),(629,250),(626,280),(630,305),(640,325),(652,345),(664,362),(680,380),(694,398)]
line=np.zeros((H,W),np.uint8); cv2.polylines(line,[np.array(OR,np.int32)],False,1,1)
d=cv2.distanceTransform((1-line).astype(np.uint8),cv2.DIST_L2,5)
HPR=np.zeros((H,W),np.uint8); cv2.fillPoly(HPR,[np.array(OR+[(694,420),(560,420),(560,120)],np.int32)],1)
yy,xx=np.mgrid[0:H,0:W]
rng=(yy>=118)&(yy<=402)
redR=rng&(((HPR==0)&(d<=14))|((HPR>0)&(d<=12)))
blueR=rng&(HPR>0)&(d>12)&(d<=28)
# never touch face skin / neck skin / earring: skin is R > B; keep >=6px away from any skin pixel left of the band
skin=((s[...,0]-s[...,2])>8)&(s.mean(2)>70)&(xx<640)&(yy<300)
skind=cv2.dilate(skin.astype(np.uint8),np.ones((13,13),np.uint8))>0
redR&=~skind; blueR&=~skind
# --- chest braid: hair is B > R, skin is R > B
hull=np.zeros((H,W),np.uint8); cv2.fillPoly(hull,[np.array([(462,318),(502,318),(500,400),(498,470),(494,496),(470,496),(468,450),(466,400),(462,340)],np.int32)],1)
braid=((s[...,2]-s[...,0])>6)&(s.mean(2)<80)&(hull>0)   # braid: bluish and dark; skin is R>B and brighter
braid=cv2.morphologyEx(braid.astype(np.uint8),cv2.MORPH_CLOSE,np.ones((5,5),np.uint8))
redC=(cv2.dilate(braid,np.ones((9,9),np.uint8))>0)&(hull>0)
red=redR|redC; blue=blueR&~red
np.save(D+'zone_red_full.npy',red); np.save(D+'zone_blue_full.npy',blue)
a=red[CY:CY+CH,CX:CX+CW]; b=blue[CY:CY+CH,CX:CX+CW]
vis=crop.astype(float).copy()
vis[a]=vis[a]*0.45+np.array([255,40,40])*0.55; vis[b]=vis[b]*0.45+np.array([60,140,255])*0.55
v=Image.fromarray(vis.clip(0,255).astype(np.uint8)); dr=ImageDraw.Draw(v)
for z,col in ((a,(255,60,60)),(b,(90,170,255))):
    cs,_=cv2.findContours(z.astype(np.uint8),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
    for c in cs:
        p=[tuple(int(t) for t in q[0]) for q in c]
        if len(p)>2: dr.line(p+[p[0]],fill=col,width=1)
v.save(D+'right_chest_regions_marked_288x512.png'); v.resize((576,1024),Image.LANCZOS).save(D+'right_chest_regions_marked_576x1024.png')
Image.fromarray((a*255).astype(np.uint8)).save(D+'mask_red_288x512.png'); Image.fromarray((b*255).astype(np.uint8)).save(D+'mask_blue_288x512.png')
json.dump({'crop_full_image_xywh':[CX,CY,CW,CH],'x0y0x1y1':[CX,CY,CX+CW,CY+CH],'aspect':'9:16','upload_size':[576,1024],
  'red':'right hair outer edge (over forest / upper chest) and the chest braid: paint what is behind (forest, tree, skin, necklace chain)',
  'blue':'just inside the right hair edge: darker inner hair','red_px':int(a.sum()),'blue_px':int(b.sum())},open(D+'crop_coords.json','w'),indent=1)
print(int(a.sum()),int(b.sum()))
