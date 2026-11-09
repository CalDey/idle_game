"""Hair v5: whole left long-hair sheet. Underlay from two registered 9:16 generations, solved matte, embedded sheet layer."""
import numpy as np, cv2, json, base64
from PIL import Image
R='/workspace/lanyi-portrait-v2-bot/'; D=R+'handoff_underlay_v5/'
def ss(u): u=np.clip(u,0,1); return u*u*(3-2*u)
src=np.asarray(Image.open(R+'assets/source_original.jpg').convert('RGB')).astype(np.float32); H,W,_=src.shape
yy,xx=np.mgrid[0:H,0:W]
Z0=np.load(D+'zone_red_full.npy')|np.load(D+'zone_blue_full.npy'); BL=np.load(D+'zone_blue_full.npy')
sword=np.load(D+'sword_full_mask.npy')
occ_old=np.load(R+'work/hair/occ.npy')>0
# arm/sleeve protection polygon (same as verification 'sleeves' bodyL) -> never part of the moving zone
bodyL=np.array([(398,250),(440,250),(440,720),(304,720),(302,700),(300,650),(320,560),(372,450),(392,330)],np.int32)
arm=np.zeros((H,W),np.uint8); cv2.fillPoly(arm,[bodyL],1); arm=arm>0
swd=cv2.dilate((sword|occ_old).astype(np.uint8),np.ones((5,5),np.uint8))>0
Z=Z0&~arm&~swd
# never touch verification-protected face rectangle / static braid core (approved, must stay pixel-identical)
fr=np.zeros((H,W),bool); fr[80:296,430:650]=True
core=np.load(R+'work/protect_core_mask.npy'); hc=np.zeros((H,W),bool); hc[280:280+core.shape[0],380:380+core.shape[1]]=core
Z&=~(cv2.dilate((fr|hc).astype(np.uint8),np.ones((5,5),np.uint8))>0)
# ---- underlay: upper (y200-1096) + lower (y896-1792), registered 504x896 each
up=np.asarray(Image.open(D+'gen_out/reg/upper_registered_504x896.png').convert('RGB')).astype(np.float32)
lo=np.asarray(Image.open(D+'gen_out/reg/lower_registered_504x896.png').convert('RGB')).astype(np.float32)
ring=(cv2.dilate(Z.astype(np.uint8),np.ones((31,31),np.uint8))>0)&~(cv2.dilate(Z.astype(np.uint8),np.ones((5,5),np.uint8))>0)&~arm&~swd
def place(img,y0):
    full=src.copy(); full[y0:y0+896,0:504]=img
    rr=ring.copy(); rr[:y0]=False; rr[y0+896:]=False; rr[:,504:]=False
    out=full.copy()
    for c in range(3):
        ms,sd=src[...,c][rr].mean(),src[...,c][rr].std(); mg,sg=full[...,c][rr].mean(),full[...,c][rr].std()
        out[y0:y0+896,0:504,c]=(img[...,c]-mg)*(sd/max(sg,1e-3))+ms
    return out.clip(0,255)
U1=place(up,200); U2=place(lo,896)
wl=ss((yy-900)/30.0)[...,None]
U=U1*(1-wl)+U2*wl
# warm lamp dots of the pagoda stay as original pixels
warm=((src[...,0]-src[...,2])>4)&(src.max(2)>60)&(yy<1000)
warm=cv2.dilate(warm.astype(np.uint8),np.ones((5,5),np.uint8))>0
wf=cv2.GaussianBlur(warm.astype(np.float32),(0,0),1.0)[...,None]; U=U*(1-wf)+src*wf
dz=cv2.distanceTransform(Z.astype(np.uint8),cv2.DIST_L2,5); ua=ss(dz/3.0)*Z
eff=U*ua[...,None]+src*(1-ua[...,None])
# ---- residual veil left in the generated underlay (bluish) -> sheet is opaque there (stays a solid part of the moving sheet)
Ub=U[...,2]-(U[...,0]+U[...,1])/2
resid=(cv2.GaussianBlur(Ub,(0,0),3)>30)&Z&(yy>820)
resid=cv2.morphologyEx(resid.astype(np.uint8),cv2.MORPH_OPEN,np.ones((7,7),np.uint8))
resid=cv2.morphologyEx(resid,cv2.MORPH_CLOSE,np.ones((15,15),np.uint8))>0
rf=cv2.GaussianBlur(cv2.dilate(resid.astype(np.uint8),np.ones((5,5),np.uint8)).astype(np.float32),(0,0),2.5)
# ---- matte
diff=np.abs(src-eff).max(2)
with np.errstate(divide='ignore',invalid='ignore'):
    upm=np.where(src>eff,(src-eff)/np.maximum(255-eff,1),0); dnm=np.where(src<eff,(eff-src)/np.maximum(eff,1),0)
amin=np.maximum(upm,dnm).max(2)
asoft=ss((diff-6)/34.0)
body=np.where(BL,ua,0)
a=np.maximum.reduce([amin,asoft,body,np.minimum(rf,1)*ua]); a[~Z]=0; a[(diff<1.5)&(body<0.5)&(rf<0.5)]=0
# fill enclosed low-alpha holes in the lower sheet (underlay there is residual veil ~= original): carry original pixels
M=(a>0.4).astype(np.uint8); inv=((M==0)&Z).astype(np.uint8)
n_,lab_,st_,_=cv2.connectedComponentsWithStats(inv,8)
edgeZ=cv2.dilate((~Z).astype(np.uint8),np.ones((3,3),np.uint8))>0
holes=np.zeros_like(Z)
for i in range(1,n_):
    c=lab_==i
    if st_[i,cv2.CC_STAT_AREA]<40000 and st_[i,cv2.CC_STAT_TOP]>1000 and not (c&edgeZ&(xx>40)&(yy<1770)).any(): holes|=c
hf=cv2.GaussianBlur(cv2.dilate(holes.astype(np.uint8),np.ones((5,5),np.uint8)).astype(np.float32),(0,0),2.0)
a=np.maximum(a,np.minimum(hf,1)*ua); a[~Z]=0
resid=resid|holes
print('hole px filled',int(holes.sum()))
# v5.2: hair continues BEHIND the grip / hand / guard AND behind the arm/sleeve. Those are redrawn on top by one binary
# "front occluder" (original pixels): sword+hand dilated 2px (the 2px rim holds the grip's anti-aliased edge -> stays static,
# v5.1 carried it inside the moving layer = the faint vertical line left of the pommel) + the arm/sleeve polygon.
occB=(occ_old|sword)
hcF=(cv2.dilate(hc.astype(np.uint8),np.ones((5,5),np.uint8))>0)&(xx<430)&~Z   # static braid core next to the shoulder (protected) - also on top
frontM=swd|arm|hcF
hairM=(a>0.15)&Z
lft=np.zeros_like(hairM); rgt=np.zeros_like(hairM)
for k in range(1,46): lft[:,k:]|=hairM[:,:-k]; rgt[:,:-k]|=hairM[:,k:]
bG=swd&(lft|((rgt)&(yy>=560)&(yy<745)))&(yy<840)&(yy>420)   # v5.2: any grip/hand/guard pixel with hair on its left (it is what a leftward sway reveals)
# arm: only the first 48px inside its left edge (enough for the largest leftward shift there)
armEdge=np.zeros_like(arm)
for y in range(250,722):
    xs_=np.where(arm[y])[0]
    if len(xs_): armEdge[y,xs_.min():min(xs_.min()+48,W)]=True
bA=armEdge&lft
# blade (below the guard): same - the sheet slides out from behind the blade instead of being pinned/stretched next to it
bladeEdge=np.zeros_like(arm)
for y in range(840,H):
    xs_=np.where(swd[y])[0]
    if len(xs_): bladeEdge[y,xs_.min():min(xs_.min()+48,W)]=True
# (blade fill not used: the veil seam next to the blade was more visible than the v5.1 pinned falloff)
under=((bG|bA)|(hcF&lft))&frontM
under=cv2.morphologyEx(under.astype(np.uint8),cv2.MORPH_OPEN,np.ones((3,3),np.uint8))>0
under&=~((xx>=425)&(yy<310))   # keep the fill >=10px away from the face rectangle (bilinear reach when the sheet sways right)
behind=under
print('behind fill px: grip/hand/guard',int((bG&under).sum()),'arm',int((bA&under).sum()))
# v5.2: the dense hair wedge between the grip and the arm is made opaque (original pixels): it now translates rigidly; a
# semi-transparent matte there (bright generated underlay vs dark hair -> near-black F) showed dark ghosting when shifted.
wedge=np.zeros_like(Z)
for y in range(430,760):
    gs=np.where(swd[y,150:330])[0]; ar=np.where(arm[y])[0]
    if len(gs) and len(ar):
        g1=150+gs.max()+1; a0=ar.min()
        if a0>g1: wedge[y,g1:a0]=True
wedge&=Z
a[wedge]=1.0
print('opaque grip-arm wedge px',int(wedge.sum()))
a8=np.round(a*255).astype(np.uint8); aq=a8/255.0
F=np.where(aq[...,None]>0,(src-(1-aq[...,None])*eff)/np.maximum(aq[...,None],1e-6),0).clip(0,255)
# fill = translated copy of the hair just LEFT of each covered run (period L, keeps the strand direction - no mirrored chevrons),
# cross-faded with a short mirror over the first 6px so the visible edge of the run is continuous.
# v5.2: the fill is OPAQUE and copies the VISIBLE look (original pixels = rest composite). A semi-transparent copy has no
# underlay beneath it (the underlay ends at the occluder) so it composited over the grip/sleeve source pixels -> darker
# patch with the grip's beaded edge showing through.
Fv=src.copy(); L_=40; done=np.zeros((H,W),bool)
for y in np.where(under.any(1))[0]:
    row=under[y]; x=0
    while x<W:
        if row[x]:
            x0=x
            while x<W and row[x]: x+=1
            # period = width of the visible (non-filled, non-transparent) span just left of the run (<=40px), so a narrow
            # wedge is tiled from itself instead of reaching across it into another fill
            # source span: the visible hair just left of the run, skipping the 3px next to the occluder edge (anti-aliased
            # grip/sleeve edge pixels must not be copied - repeating them made dark streaks); period Lr = that span (16..40px)
            SK=3; e0=x0-SK; Lr=40     # constant period: a pure 40px translation of the visible look (no row-to-row phase jumps -> no stair steps)
            for xi in range(x0,x):
                k_=xi-x0
                xt=xi-Lr
                while xt>=e0: xt-=Lr
                xm=e0-1-k_
                if xt<0: continue
                w_=ss(k_/6.0) if xm>=0 else 1.0
                Fv[y,xi]=(Fv[y,xm]*(1-w_) if xm>=0 else 0)+Fv[y,xt]*w_
                done[y,xi]=True
            # the SK px right before the run stay as they are (visible at rest)
        else: x+=1
F[under]=Fv[under]; a8[under]=255
aq=a8/255.0
# rest composite check
rest=np.round(F)*aq[...,None]+(1-aq[...,None])*(np.round(U)*(np.round(ua*255)/255)[...,None]+src*(1-np.round(ua*255)/255)[...,None])
print('rest composite max err in Z',float(np.abs(rest-src)[Z].max()),'mean',float(np.abs(rest-src)[Z].mean()))
LZ=Z|behind
ys,xs=np.where(LZ); X0,Y0,X1,Y1=0,int(ys.min()),int(xs.max())+1,int(ys.max())+1
print('bbox',X0,Y0,X1,Y1,'Z px',int(Z.sum()),'resid px',int(resid.sum()))
und=np.dstack([np.round(U).clip(0,255),np.round(ua*255)]).astype(np.uint8)[Y0:Y1,X0:X1]
Image.fromarray(und,'RGBA').save(R+'assets/hair5_underlay.png')
lay=np.dstack([np.round(F),a8]).astype(np.uint8)[Y0:Y1,X0:X1]
Image.fromarray(lay,'RGBA').save(R+'work/hair5_sheet.png')
np.save(R+'work/hair5_zone.npy',Z); np.save(R+'work/hair5_resid.npy',resid)
# ---- sheet layer embedded (row spans, straight RGBA) so the browser never reads canvas pixels
h,w=lay.shape[:2]; spans=np.zeros((h,2),np.int32); chunks=[]
for y in range(h):
    nz=np.where(lay[y,:,3]>0)[0]
    if len(nz): spans[y]=(nz.min(),nz.max()); chunks.append(lay[y,nz.min():nz.max()+1].tobytes())
    else: spans[y]=(1,0)
blob=b''.join(chunks)
# ---- pin weight field (8px grid): 0 at the arm / sword (guard+blade, everything right of the blade) / top, 1 far away
S=8; gw=(W+S-1)//S+1; gh=(H+S-1)//S+1
gx=np.minimum(np.arange(gw)*S,W-1); gy=np.minimum(np.arange(gh)*S,H-1)
def dist_to(mask): return cv2.distanceTransform((1-mask.astype(np.uint8)),cv2.DIST_L2,5)[np.ix_(gy,gx)]
dArm=dist_to(arm)
cxl=np.interp(yy,[830,900,1100,1785,1792],[300,302,334,440,441])
bladeP=(sword&(yy>=830))|((yy>830)&(xx>=cxl))
dBl=dist_to(bladeP); dTop=dist_to(yy<170)
Yg=gy[:,None].astype(np.float32)
# v5.1: no pin at grip / hand / guard; the blade pins only the lower veil (it continues behind the blade, right side is static)
bladeW=ss((Yg-820)/60.0)
win=ss(dTop/120.0)   # v5.2: no arm pin (hair slides out from behind the arm occluder instead of being stretched)
isl=hc&~arm&(yy<450)&(xx<440)   # the protected static strands just left of the upper arm (an island inside the moving hair)
win=win*ss(dist_to(isl)/70.0) if isl.any() else win   # upper shoulder only; the grip-arm segment (y560-745) is >70px away
win=win*(1-(1-ss(dBl/120.0))*bladeW)   # blade pin below the guard: unchanged from v5.1
winb=np.round(win*255).astype(np.uint8)
rw=cv2.GaussianBlur(resid.astype(np.float32),(0,0),25)[np.ix_(gy,gx)]; rwb=np.round(np.clip(rw*1.6,0,1)*255).astype(np.uint8)
js="/* generated by tools/build_hair5.py: hair v5 whole left sheet (row-span packed straight RGBA, original pixels + solved matte over the v5 underlay) + pin weight field (8px grid) */\n"
js+="(function(root){var G={x0:%d,y0:%d,w:%d,h:%d,spans:'%s',data:'%s',pin:{x0:0,y0:0,step:%d,w:%d,h:%d,data:'%s',res:'%s'}};if(typeof module!=='undefined'&&module.exports)module.exports=G;else root.LANYI_HAIR5=G;})(this);\n"%(
    X0,Y0,w,h,base64.b64encode(spans.astype(np.int16).tobytes()).decode(),base64.b64encode(blob).decode(),S,gw,gh,base64.b64encode(winb.tobytes()).decode(),base64.b64encode(rwb.tobytes()).decode())
open(R+'js/hair5_sheet.js','w').write(js)
# ---- front occluder (binary, original pixels): sword incl. blade to the tip + hand (dilated 2px) + arm/sleeve polygon
bl_=cv2.dilate(sword.astype(np.uint8),np.ones((3,3),np.uint8))>0
oc=(frontM|bl_).astype(np.float32)
ys2,xs2=np.where(oc>0); ox0,oy0,ox1,oy1=int(xs2.min()),int(ys2.min()),int(xs2.max())+1,int(ys2.max())+1
occ5=np.dstack([src,np.round(oc*255)]).astype(np.uint8)[oy0:oy1,ox0:ox1]
Image.fromarray(occ5,'RGBA').save(R+'assets/layer_front_occluder_v52.png')
np.save(R+'work/hair5_occ.npy',oc>0)
json.dump({'sheet_bbox':[X0,Y0,X1,Y1],'occ_origin':[ox0,oy0],'occ_size':[ox1-ox0,oy1-oy0],'blob_bytes':len(blob),'Z_px':int(Z.sum()),'resid_px':int(resid.sum())},open(R+'work/hair5_meta.json','w'),indent=1)
print(open(R+'work/hair5_meta.json').read())
# visual: resid overlay
v=src.copy(); v[resid]=v[resid]*0.5+np.array([255,200,0])*0.5; v[Z&~resid]=v[Z&~resid]*0.8+np.array([255,0,0])*0.2
Image.fromarray(v.astype(np.uint8)[150:1792,0:560]).resize((280,821)).save('/tmp/h5zones.png')
Image.fromarray(np.round(eff*0+U*ua[...,None]+src*(1-ua[...,None])).clip(0,255).astype(np.uint8)[150:1792,0:560]).resize((280,821)).save('/tmp/h5under.png')
Image.fromarray(a8[150:1792,0:560]).resize((280,821)).save('/tmp/h5alpha.png')
