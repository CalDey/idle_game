"""Hair v3: 4 truly separate outer locks (cut along darker partings) over the AI-painted clean underlay,
with a cleaner stair reconstruction under the tips. v2 assets are left untouched (fallback).
Inputs : assets/source_original.jpg, handoff_underlay/gen_out/underlay_registered_colormatched_486x864.png,
         handoff_underlay/zoneA_full.npy (red: ->background), zoneB_full.npy (blue: ->inner hair), work/hair/occ.npy
Outputs: assets/hair3_underlay.png  RGBA, original crop coords; alpha only inside red+blue (feathered inward 3px)
         assets/hair3_locks.png     RGBA, ORIGINAL hair pixels: alpha + foreground solved so that
                                    locks-over-underlay == original exactly at rest (crisp, no blur)
         js/hair2_field.js          two 4px fields: amplitude weight, lock phase (0..1)
"""
import numpy as np, cv2, json, base64
from PIL import Image
R='/workspace/lanyi-portrait-v2-bot/'
CX,CY,CW,CH=4,206,486,864
src=np.asarray(Image.open(R+'assets/source_original.jpg').convert('RGB')).astype(np.float64)
H,W,_=src.shape
gen=np.asarray(Image.open(R+'handoff_underlay/gen_out/underlay_registered_colormatched_486x864.png').convert('RGB')).astype(np.float64)
A=np.load(R+'handoff_underlay/zoneA_full.npy'); B=np.load(R+'handoff_underlay/zoneB_full.npy')
# keep the braid/root core that breathing protects strictly static (no underlay, no locks there)
core=np.load(R+'work/protect_core_mask.npy'); hc=np.zeros((H,W),bool); hc[280:280+core.shape[0],380:380+core.shape[1]]=core
hcd=cv2.dilate(hc.astype(np.uint8),np.ones((9,9),np.uint8))>0
A=A&~hcd; B=B&~hcd
Z=(A|B).astype(np.uint8)
occ=np.load(R+'work/hair/occ.npy')>0
def ss(u): u=np.clip(u,0,1); return u*u*(3-2*u)
# ---- stairs rows: the generated underlay still holds faint hair over the stairs (lower red zone).
# Stair treads/railings are horizontal, so rebuild that part of the red zone row-by-row by mirroring the
# ORIGINAL background just left of the hair (lines stay continuous and exactly match the original).
Ac=A[CY:CY+CH,CX:CX+CW]; Zc0=(A|B)[CY:CY+CH,CX:CX+CW]
gen=gen.copy(); STAIR_Y0=740; nfix=0
o0=src[CY:CY+CH,CX:CX+CW]
for yc in range(STAIR_Y0-CY,CH):
    xs_=np.where(Zc0[yc])[0]
    if len(xs_)==0: continue
    xl=xs_.min()-3                       # last clean column left of the zones
    for xc in np.where(Ac[yc])[0]:
        P=max(8,min(40,xl-40))            # clean band [xl-P, xl): stays right of the dark railing post
        k=(xc-xl)%(2*P); xm=xl-1-(k if k<P else 2*P-1-k)   # ping-pong reflection inside that band
        gen[yc,xc]=o0[yc,xm]; nfix+=1
print('stairs rows mirrored px',nfix)
# over the stairs, hair (B-R >= ~25) separates cleanly from treads/railings (B-R <= ~17): keep the ORIGINAL
# stair pixels wherever there is no hair, use the mirrored stairs only under hair -> no railing pieces travel with the locks
hb=(o0[...,2]-o0[...,0]); hh=np.clip((hb-18)/14.0,0,1); hh=hh*hh*(3-2*hh)
hh=cv2.GaussianBlur(cv2.dilate(hh.astype(np.float32),np.ones((3,3),np.uint8)),(0,0),0.8)
st=np.zeros_like(Ac); st[STAIR_Y0-CY:]=True; st&=Ac
# v3: per-row background estimate (median of hair-free stair pixels just left of the hair) also catches the faint
# dark strands that the colour test misses (they are darker than the row's tread/railing)
bgrow=np.zeros_like(o0)
for yc in range(STAIR_Y0-CY,CH):
    xs_=np.where(Zc0[yc])[0]
    if len(xs_)==0: continue
    xl=xs_.min()-3; P=max(8,min(40,xl-40))
    seg=o0[max(0,yc-1):yc+2, xl-P:xl].reshape(-1,3); hs=hh[max(0,yc-1):yc+2, xl-P:xl].reshape(-1)
    bgrow[yc]=np.median(seg,0)
dev=np.abs(o0-bgrow).max(2)
# only count a deviation as hair when the pixel is also bluer than the row's stairs (hair B-R >> tread B-R);
# plain stair texture (posts, grain) deviates too but is not bluer
dB=(o0[...,2]-o0[...,0])-(bgrow[...,2]-bgrow[...,0])
lo_=o0.mean(2); lb_=bgrow.mean(2)
h2=np.maximum(ss((dB-3)/9.0)*ss((dev-4)/8.0),            # bluer than this row's stairs
              ss((lb_-lo_-10)/12.0)*(lb_>55))             # dark strand crossing a bright railing line
h2=cv2.dilate(h2.astype(np.float32),np.ones((3,3),np.uint8))
hfill=np.clip(h2*2.0,0,1)                       # replace with clean stairs as soon as there is any hair
hfill=cv2.GaussianBlur(hfill,(0,0),0.7)
gen[st]=o0[st]*(1-hfill[st,None])+gen[st]*hfill[st,None]
# warm lamp dots of the pagoda (R > B, hair is always B > R): keep them in the underlay as original pixels,
# so they stay put instead of being lifted into the moving locks
warm=((o0[...,0]-o0[...,2])>4)&(o0.max(2)>60)
warm=cv2.dilate(warm.astype(np.uint8),np.ones((5,5),np.uint8))>0
wf_=cv2.GaussianBlur(warm.astype(np.float32),(0,0),1.0)[...,None]
gen=gen*(1-wf_)+o0*wf_
print('warm lamp px kept',int(warm[Zc0].sum()))
# ---- underlay alpha: 1 inside Z, ramps to 0 over 3px at Z border (stays inside Z)
dz=cv2.distanceTransform(Z,cv2.DIST_L2,5)
ua=ss(dz/3.0)*(Z>0)
o=src[CY:CY+CH,CX:CX+CW]; uac=ua[CY:CY+CH,CX:CX+CW]
eff=gen*uac[...,None]+o*(1-uac[...,None])          # what is visible once the underlay is drawn
und=np.dstack([np.round(gen).clip(0,255),np.round(uac*255)]).astype(np.uint8)
# ---- lock matte (only inside Z): minimal alpha that can reproduce the original over eff, plus solid hair body
Zc=Z[CY:CY+CH,CX:CX+CW]>0
diff=np.abs(o-eff).max(2)
with np.errstate(divide='ignore',invalid='ignore'):
    up=np.where(o>eff,(o-eff)/np.maximum(255-eff,1),0); dn=np.where(o<eff,(eff-o)/np.maximum(eff,1),0)
amin=np.maximum(up,dn).max(2)
asoft=ss((diff-6)/34.0)
Bc=B[CY:CY+CH,CX:CX+CW]
# blue band (behind it the underlay is darker inner hair): lock is the solid original hair, alpha 1 (feathered like the underlay)
body=np.where(Bc,uac,0)
# over the stairs the colour matte (hair is bluer than treads) is a better hair alpha than the difference alone
hcol=np.where(st,np.clip(h2,0,1),0)   # v3: full tip density travels with the lock
a=np.maximum(np.maximum(np.maximum(amin,asoft),body),hcol); a[~Zc]=0; a[(diff<1.5)&(body<0.5)]=0
# keep strictly in Z and away from the sword occluder (it is redrawn on top anyway)
F=np.where(a[...,None]>1e-3,(o-(1-a[...,None])*eff)/np.maximum(a[...,None],1e-3),o).clip(0,255)
a8=np.round(a*255).astype(np.uint8)
# re-solve F with quantised alpha for exact rest composite
aq=a8/255.0
F=np.where(aq[...,None]>0,(o-(1-aq[...,None])*eff)/np.maximum(aq[...,None],1e-6),0).clip(0,255)
locks=np.dstack([np.round(F),a8]).astype(np.uint8)
Image.fromarray(und,'RGBA').save(R+'assets/hair3_underlay.png')
Image.fromarray(locks,'RGBA').save(R+'assets/hair3_locks.png')
# ---- v3 lock cutting: band coordinates along the outer contour (s = arc index, ds = signed depth)
OUTER=[(400,280),(340,290),(300,350),(262,400),(236,450),(215,500),(195,550),(165,600),(140,650),(120,700),(114,750),(112,800),(118,850),(130,900),(150,950),(172,1000)]
pts=[]
for (x0_,y0_),(x1_,y1_) in zip(OUTER[:-1],OUTER[1:]):
    n_=int(max(abs(x1_-x0_),abs(y1_-y0_)))
    for t_ in range(n_): pts.append((x0_+(x1_-x0_)*t_/n_, y0_+(y1_-y0_)*t_/n_))
pts=np.array(pts); NS=len(pts)
tang=np.gradient(pts,axis=0)
tang=np.array([np.convolve(tang[:,c],np.ones(15)/15,'same') for c in range(2)]).T
tang/=np.linalg.norm(tang,axis=1,keepdims=True)+1e-9
nrm=np.stack([-tang[:,1],tang[:,0]],1)
HP=np.zeros((H,W),np.uint8); cv2.fillPoly(HP,[np.array(OUTER+[(250,1000),(330,700),(380,400),(400,280)],np.int32)],1)
mid=np.clip((pts+nrm*15).round().astype(int),0,[W-1,H-1])
if HP[mid[:,1],mid[:,0]].mean()<0.5: nrm=-nrm
# straightened band image of the original luminance, smoothed along the flow
DMIN,DMAX=-30,95
lum=cv2.cvtColor(src.astype(np.uint8),cv2.COLOR_RGB2GRAY).astype(np.float32)
band=np.zeros((NS,DMAX-DMIN+1),np.float32)
for di,dd in enumerate(range(DMIN,DMAX+1)):
    q=pts+nrm*dd
    band[:,di]=cv2.remap(lum,q[:,0].astype(np.float32).reshape(-1,1),q[:,1].astype(np.float32).reshape(-1,1),cv2.INTER_LINEAR).reshape(-1)
bandS=cv2.GaussianBlur(band,(0,0),sigmaX=1.2,sigmaY=10)   # along s strongly (flow), across depth lightly
def dp_path(lo,hi):
    cols=np.arange(lo-DMIN,hi-DMIN+1); C=bandS[:,cols]; n,m=C.shape
    acc=C.copy(); bk=np.zeros((n,m),int)
    for i_ in range(1,n):
        for j_ in range(m):
            js=[jj for jj in (j_-1,j_,j_+1) if 0<=jj<m]; jb=min(js,key=lambda jj:acc[i_-1,jj])
            acc[i_,j_]+=acc[i_-1,jb]+0.0; bk[i_,j_]=jb
    path=np.zeros(n,int); path[-1]=int(np.argmin(acc[-1]))
    for i_ in range(n-1,0,-1): path[i_-1]=bk[i_,path[i_]]
    return cols[path]+DMIN
B1=dp_path(44,54); B2=dp_path(57,66); B3=dp_path(69,77)   # partings; all inside the blue band (depth>40)
B1=np.convolve(B1,np.ones(9)/9,'same'); B2=np.convolve(B2,np.ones(9)/9,'same'); B3=np.convolve(B3,np.ones(9)/9,'same')
# per pixel: nearest contour sample and signed depth
line=np.ones((H,W),np.uint8); lab_img=np.zeros((H,W),np.int32)
pi=pts.round().astype(int)
line[pi[:,1],pi[:,0]]=0
dist,lbl=cv2.distanceTransformWithLabels(line,cv2.DIST_L2,5,labelType=cv2.DIST_LABEL_PIXEL)
# map label id -> sample index
lab2s=np.zeros(lbl.max()+1,int); idmap=lbl[pi[:,1],pi[:,0]]; lab2s[idmap]=np.arange(NS)
sidx=lab2s[lbl]
ds=np.where(HP>0,dist,-dist)
lockid=np.zeros((H,W),np.uint8)
lockid[ds>B1[sidx]]=1; lockid[ds>B2[sidx]]=2; lockid[ds>B3[sidx]]=3
Zc_=Z>0
lockid[~Zc_]=0
# amplitude multiplier shared by all locks: pinned near sword/hand, fades to 0 at the inner edge of the blue band
dsw=cv2.distanceTransform((1-occ).astype(np.uint8),cv2.DIST_L2,5)
amp=(1-ss((ds-74)/14.0))*ss((dsw-4)/18.0)
Zd=cv2.dilate(Z,np.ones((25,25),np.uint8))>0
amp[~Zd]=0
amp=cv2.GaussianBlur(amp.astype(np.float32),(0,0),2)
X0,Y0,STEP=40,250,4; gw,gh=(440-40)//STEP+1,(1100-250)//STEP+1
def enc(f):
    s_=f[Y0:Y0+gh*STEP:STEP, X0:X0+gw*STEP:STEP]
    return base64.b64encode(np.round(np.clip(s_,0,1)*255).astype(np.uint8).tobytes()).decode()
open(R+'js/hair3_field.js','w').write(
 "/* generated by tools/build_hair3.py: hair v3 shared amplitude field, origin (%d,%d), step %dpx */\n"
 "(function(root){var G={x0:%d,y0:%d,step:%d,w:%d,h:%d,amp:'%s'};"
 "if(typeof module!=='undefined'&&module.exports)module.exports=G;else root.LANYI_HAIR3_FIELD=G;})(this);\n"%(X0,Y0,STEP,X0,Y0,STEP,gw,gh,enc(amp)))
np.save(R+'work/hair/lockid.npy',lockid)
# rest check
comp=eff*(1-aq[...,None])+F*aq[...,None]
err=np.abs(np.round(comp)-o).max()
json.dump({'underlay_origin':[CX,CY],'locks_origin':[CX,CY],'rest_composite_max_err':float(err),
  'lock_px_alpha_gt_0.5':int((a>0.5).sum()),'underlay_px':int((uac>0).sum())},open(R+'work/hair/hair3_meta.json','w'),indent=1)
print('rest err',err,'lock px',int((a>0.5).sum()))
vis=np.concatenate([o, eff, (F*aq[...,None]+np.array([255,0,255])*(1-aq[...,None]))],1)
Image.fromarray(vis.clip(0,255).astype(np.uint8)).save(R+'review/hair3_layers_orig_underlay_locks.png')
# ---- embed locks (alpha bbox) + lock ids as JS so file:// works without canvas tainting
L=locks; ys,xs=np.where(L[...,3]>0); x0,y0,x1,y1=xs.min(),ys.min(),xs.max()+1,ys.max()+1
c=np.ascontiguousarray(L[y0:y1,x0:x1])
lid=np.ascontiguousarray(lockid[CY:CY+CH,CX:CX+CW][y0:y1,x0:x1])
open(R+'js/hair3_locks.js','w').write("/* generated by tools/build_hair3.py from assets/hair3_locks.png (straight RGBA, original pixels + solved matte) + per-pixel lock id 0..3 (0 = outermost); embedded so file:// works */\n(function(root){var G={x0:%d,y0:%d,w:%d,h:%d,nLocks:4,data:'%s',lock:'%s'};if(typeof module!=='undefined'&&module.exports)module.exports=G;else root.LANYI_HAIR3_LOCKS=G;})(this);\n"%(int(x0+CX),int(y0+CY),c.shape[1],c.shape[0],base64.b64encode(c.tobytes()).decode(),base64.b64encode(lid.tobytes()).decode()))
# lock map preview
cols_=np.array([[255,80,80],[255,200,60],[80,220,120],[80,150,255]])
o8=o.copy(); lc=lockid[CY:CY+CH,CX:CX+CW]; m_=aq>0.15
o8[m_]=o8[m_]*0.45+cols_[lc[m_]]*0.55
Image.fromarray(o8.clip(0,255).astype(np.uint8)).save(R+'review/hair3_lock_map.png')
if __name__=='__main__' and __import__('os').environ.get('DBG'):
    for (fx,fy) in [(100,800),(95,790),(110,745),(105,830)]:
        cx_,cy_=fx-CX,fy-CY
        print((fx,fy),'o',o0[cy_,cx_].round(),'bgrow',bgrow[cy_,cx_].round(),'hh',round(float(hh[cy_,cx_]),2),'h2',round(float(h2[cy_,cx_]),2),'hfill',round(float(hfill[cy_,cx_]),2),'amin',round(float(amin[cy_,cx_]),2),'asoft',round(float(asoft[cy_,cx_]),2),'A',bool(Ac[cy_,cx_]),'st',bool(st[cy_,cx_]))
