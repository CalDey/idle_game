"""Hair v4 add-on: RIGHT hair edge (3 locks) + CHEST BRAID (1 lock) over the AI-painted underlay
(handoff_underlay_right_chest/gen_out). Left hair v3 assets are reused unchanged.
Outputs: assets/hair4rc_underlay.png (RGBA, crop origin), assets/hair4rc_locks.png, js/hair4rc_locks.js (embedded RGBA + lock id),
         assets/hair4_breath_texture.png (source + underlay, crop of the breathing meshes, texture for the breathing warp),
         assets/layer_static_protect_v4.png (approved protect layer with the moving right/braid hair removed)."""
import numpy as np, cv2, json, base64
from PIL import Image
R='/workspace/lanyi-portrait-v2-bot/'; D=R+'handoff_underlay_right_chest/'
CX,CY,CW,CH=440,40,288,512
def ss(u): u=np.clip(u,0,1); return u*u*(3-2*u)
src=np.asarray(Image.open(R+'assets/source_original.jpg').convert('RGB')).astype(np.float64); H,W,_=src.shape
o=src[CY:CY+CH,CX:CX+CW]
gen=np.asarray(Image.open(D+'gen_out/registered_affine_288x512.png').convert('RGB')).astype(np.float64)
red=np.load(D+'zone_red_full.npy'); blue=np.load(D+'zone_blue_full.npy')
Zf=(red|blue)
xx=np.arange(W)[None,:].repeat(H,0); yy=np.arange(H)[:,None].repeat(W,1)
braidZ=red&(xx<520); rightZ=Zf&(xx>=560)
# ---- local colour match, separately for the right edge and the braid (ring just outside each zone)
Zc=Zf[CY:CY+CH,CX:CX+CW]
for part in (braidZ,rightZ):
    pc=part[CY:CY+CH,CX:CX+CW]
    ring=(cv2.dilate(pc.astype(np.uint8),np.ones((21,21),np.uint8))>0)&~(cv2.dilate(Zc.astype(np.uint8),np.ones((5,5),np.uint8))>0)
    sel=cv2.dilate(pc.astype(np.uint8),np.ones((9,9),np.uint8))>0
    for c in range(3):
        ms,ss_=o[...,c][ring].mean(),o[...,c][ring].std(); mg,sg=gen[...,c][ring].mean(),gen[...,c][ring].std()
        gen[...,c][sel]=(gen[...,c][sel]-mg)*(ss_/max(sg,1e-3))+ms
gen=gen.clip(0,255)
# ---- underlay alpha (inside zones, 2px inward feather)
Z=Zf.astype(np.uint8)
dz=cv2.distanceTransform(Z,cv2.DIST_L2,5); ua=ss(dz/2.0)*(Z>0)
uac=ua[CY:CY+CH,CX:CX+CW]
eff=gen*uac[...,None]+o*(1-uac[...,None])
und=np.dstack([np.round(gen),np.round(uac*255)]).astype(np.uint8)
Image.fromarray(und,'RGBA').save(R+'assets/hair4rc_underlay.png')
# ---- lock matte (exact at rest)
diff=np.abs(o-eff).max(2)
with np.errstate(divide='ignore',invalid='ignore'):
    up=np.where(o>eff,(o-eff)/np.maximum(255-eff,1),0); dn=np.where(o<eff,(eff-o)/np.maximum(eff,1),0)
amin=np.maximum(up,dn).max(2)
asoft=ss((diff-6)/30.0)
Bc=blue[CY:CY+CH,CX:CX+CW]
body=np.where(Bc,uac,0)
a=np.maximum(np.maximum(amin,asoft),body); a[~Zc]=0; a[(diff<1.5)&(body<0.5)]=0
a8=np.round(a*255).astype(np.uint8); aq=a8/255.0
F=np.where(aq[...,None]>0,(o-(1-aq[...,None])*eff)/np.maximum(aq[...,None],1e-6),0).clip(0,255)
locks=np.dstack([np.round(F),a8]).astype(np.uint8)
Image.fromarray(locks,'RGBA').save(R+'assets/hair4rc_locks.png')
err=np.abs(np.round(eff*(1-aq[...,None])+F*aq[...,None])-o).max()
# ---- right hair: cut 3 locks along darker partings (depth from the outer contour)
OR=[(606,120),(618,132),(626,150),(631,180),(632,220),(629,250),(626,280),(630,305),(640,325),(652,345),(664,362),(680,380),(694,398)]
pts=[]
for (x0_,y0_),(x1_,y1_) in zip(OR[:-1],OR[1:]):
    n_=int(max(abs(x1_-x0_),abs(y1_-y0_)))
    for t_ in range(n_): pts.append((x0_+(x1_-x0_)*t_/n_, y0_+(y1_-y0_)*t_/n_))
pts=np.array(pts); NS=len(pts)
tang=np.gradient(pts,axis=0); tang=np.array([np.convolve(tang[:,c],np.ones(9)/9,'same') for c in range(2)]).T
tang/=np.linalg.norm(tang,axis=1,keepdims=True)+1e-9
nrm=np.stack([-tang[:,1],tang[:,0]],1)
HPR=np.zeros((H,W),np.uint8); cv2.fillPoly(HPR,[np.array(OR+[(694,420),(560,420),(560,120)],np.int32)],1)
mid=np.clip((pts+nrm*10).round().astype(int),0,[W-1,H-1])
if HPR[mid[:,1],mid[:,0]].mean()<0.5: nrm=-nrm
lum=cv2.cvtColor(src.astype(np.uint8),cv2.COLOR_RGB2GRAY).astype(np.float32)
DMIN,DMAX=-16,34
band=np.zeros((NS,DMAX-DMIN+1),np.float32)
for di,dd in enumerate(range(DMIN,DMAX+1)):
    q=pts+nrm*dd
    band[:,di]=cv2.remap(lum,q[:,0].astype(np.float32).reshape(-1,1),q[:,1].astype(np.float32).reshape(-1,1),cv2.INTER_LINEAR).reshape(-1)
bandS=cv2.GaussianBlur(band,(0,0),sigmaX=1.0,sigmaY=8)
def dp_path(lo,hi):
    cols=np.arange(lo-DMIN,hi-DMIN+1); C=bandS[:,cols]; n,m=C.shape
    acc=C.copy(); bk=np.zeros((n,m),int)
    for i_ in range(1,n):
        for j_ in range(m):
            js=[jj for jj in (j_-1,j_,j_+1) if 0<=jj<m]; jb=min(js,key=lambda jj:acc[i_-1,jj])
            acc[i_,j_]+=acc[i_-1,jb]; bk[i_,j_]=jb
    path=np.zeros(n,int); path[-1]=int(np.argmin(acc[-1]))
    for i_ in range(n-1,0,-1): path[i_-1]=bk[i_,path[i_]]
    return np.convolve(cols[path]+DMIN,np.ones(7)/7,'same')
B1=dp_path(14,19); B2=dp_path(21,25)       # both inside the blue (darker inner hair) band: gaps show inner hair
line=np.ones((H,W),np.uint8); pi=pts.round().astype(int); line[pi[:,1],pi[:,0]]=0
dist,lbl=cv2.distanceTransformWithLabels(line,cv2.DIST_L2,5,labelType=cv2.DIST_LABEL_PIXEL)
lab2s=np.zeros(lbl.max()+1,int); lab2s[lbl[pi[:,1],pi[:,0]]]=np.arange(NS); sidx=lab2s[lbl]
ds=np.where(HPR>0,dist,-dist)
lockid=np.zeros((H,W),np.uint8)
lockid[rightZ&(ds>B1[sidx])]=1; lockid[rightZ&(ds>B2[sidx])]=2
lockid[braidZ]=3
# amplitude field for the right hair (shared by its locks): inner ramp to 0 at the blue band's inner edge
ampR=(1-ss((ds-22)/8.0))*(cv2.dilate(rightZ.astype(np.uint8),np.ones((15,15),np.uint8))>0)
ampR=cv2.GaussianBlur(ampR.astype(np.float32),(0,0),1.5)
# ---- embed
lc=lockid[CY:CY+CH,CX:CX+CW]
ys,xs=np.where(locks[...,3]>0); x0,y0,x1,y1=xs.min(),ys.min(),xs.max()+1,ys.max()+1
c=np.ascontiguousarray(locks[y0:y1,x0:x1]); lid=np.ascontiguousarray(lc[y0:y1,x0:x1])
FX0,FY0,FS=560,100,4; fw,fh=(720-560)//FS+1,(420-100)//FS+1
fa=ampR[FY0:FY0+fh*FS:FS,FX0:FX0+fw*FS:FS]
open(R+'js/hair4rc_locks.js','w').write("/* generated by tools/build_hair4_rc.py: right hair edge locks 0..2 (0 = outermost) + chest braid lock 3; straight RGBA original pixels + solved matte, lock id, right-hair amplitude field */\n(function(root){var G={x0:%d,y0:%d,w:%d,h:%d,nLocks:4,data:'%s',lock:'%s',ampR:{x0:%d,y0:%d,step:%d,w:%d,h:%d,data:'%s'}};if(typeof module!=='undefined'&&module.exports)module.exports=G;else root.LANYI_HAIR4RC_LOCKS=G;})(this);\n"%(
 int(x0+CX),int(y0+CY),c.shape[1],c.shape[0],base64.b64encode(c.tobytes()).decode(),base64.b64encode(lid.tobytes()).decode(),
 FX0,FY0,FS,fw,fh,base64.b64encode(np.round(np.clip(fa,0,1)*255).astype(np.uint8).tobytes()).decode()))
# (breathing texture is composed at runtime in js/main.js from the source JPEG + hair4rc_underlay.png)
# ---- protect layer v4: drop the moving right/braid hair (and a sweep margin) from the approved static-protect layer
P=np.array(Image.open(R+'assets/layer_static_protect.png')); PX,PY=380,280
mov=cv2.dilate(((locks[...,3]>0)|(uac>0)).astype(np.uint8),np.ones((3,3),np.uint8))>0
movf=np.zeros((H,W),bool); movf[CY:CY+CH,CX:CX+CW]=mov
P[...,3][movf[PY:PY+P.shape[0],PX:PX+P.shape[1]]]=0
Image.fromarray(P,'RGBA').save(R+'assets/layer_static_protect_v4.png')
np.save(R+'work/hair/rc_lockid.npy',lockid); np.save(R+'work/hair/rc_zone.npy',Zf)
# previews
cols_=np.array([[255,80,80],[255,200,60],[80,220,120],[200,90,255]])
v=o.copy(); m_=aq>0.15; v[m_]=v[m_]*0.45+cols_[lc[m_]]*0.55
Image.fromarray(v.clip(0,255).astype(np.uint8)).save(R+'review/hair4rc_lock_map.png')
Image.fromarray(np.concatenate([o,eff,F*aq[...,None]+np.array([255,0,255])*(1-aq[...,None])],1).clip(0,255).astype(np.uint8)).save(R+'review/hair4rc_layers_orig_underlay_locks.png')
json.dump({'rest_err':float(err),'locks_origin':[int(x0+CX),int(y0+CY)],'lock_px':{k:int(((lc==k)&(aq>0.15)).sum()) for k in range(4)}},open(R+'work/hair/hair4rc_meta.json','w'),indent=1)
print('rest err',err,{k:int(((lc==k)&(aq>0.15)).sum()) for k in range(4)})
