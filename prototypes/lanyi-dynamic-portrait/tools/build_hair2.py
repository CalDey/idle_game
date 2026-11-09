"""Hair v2: separate outer locks over an AI-painted clean underlay.
Inputs : assets/source_original.jpg, handoff_underlay/gen_out/underlay_registered_colormatched_486x864.png,
         handoff_underlay/zoneA_full.npy (red: ->background), zoneB_full.npy (blue: ->inner hair), work/hair/occ.npy
Outputs: assets/hair2_underlay.png  RGBA, original crop coords; alpha only inside red+blue (feathered inward 3px)
         assets/hair2_locks.png     RGBA, ORIGINAL hair pixels: alpha + foreground solved so that
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
gen[st]=o0[st]*(1-hh[st,None])+gen[st]*hh[st,None]
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
hcol=np.where(st,hh*0.95,0)
a=np.maximum(np.maximum(np.maximum(amin,asoft),body),hcol); a[~Zc]=0; a[(diff<1.5)&(body<0.5)]=0
# keep strictly in Z and away from the sword occluder (it is redrawn on top anyway)
F=np.where(a[...,None]>1e-3,(o-(1-a[...,None])*eff)/np.maximum(a[...,None],1e-3),o).clip(0,255)
a8=np.round(a*255).astype(np.uint8)
# re-solve F with quantised alpha for exact rest composite
aq=a8/255.0
F=np.where(aq[...,None]>0,(o-(1-aq[...,None])*eff)/np.maximum(aq[...,None],1e-6),0).clip(0,255)
locks=np.dstack([np.round(F),a8]).astype(np.uint8)
Image.fromarray(und,'RGBA').save(R+'assets/hair2_underlay.png')
Image.fromarray(locks,'RGBA').save(R+'assets/hair2_locks.png')
# ---- displacement fields (full-image coords, 4px grid over HAIR bbox)
OUTER=[(400,280),(340,290),(300,350),(262,400),(236,450),(215,500),(195,550),(165,600),(140,650),(120,700),(114,750),(112,800),(118,850),(130,900),(150,950),(172,1000)]
line=np.zeros((H,W),np.uint8); cv2.polylines(line,[np.array(OUTER,np.int32)],False,1,1)
d=cv2.distanceTransform((1-line).astype(np.uint8),cv2.DIST_L2,5)
HP=np.zeros((H,W),np.uint8); cv2.fillPoly(HP,[np.array(OUTER+[(250,1000),(330,700),(380,400),(400,280)],np.int32)],1)
ds=np.where(HP>0,d,-d)          # signed depth into the hair: <0 outside wisps, >0 inside
# amplitude: full for outer 35px, fades to 0 at the inner edge of the blue band (85px) -> no seam with static inner hair
amp=1-ss((ds-35)/50.0)
Zd=cv2.dilate(Z,np.ones((25,25),np.uint8))>0
amp[~Zd]=0
dsw=cv2.distanceTransform((1-occ).astype(np.uint8),cv2.DIST_L2,5)
amp*=ss((dsw-4)/18.0)                                # pinned against sword/hand
amp=cv2.GaussianBlur(amp.astype(np.float32),(0,0),3)
# lock phase: 3 interleaved locks across the band depth + slow variation along length
ph=(np.clip(ds+28,0,113)/113.0)
X0,Y0,STEP=40,250,4; gw,gh=(440-40)//STEP+1,(1100-250)//STEP+1
def enc(f):
    s=f[Y0:Y0+gh*STEP:STEP, X0:X0+gw*STEP:STEP]
    return base64.b64encode(np.round(np.clip(s,0,1)*255).astype(np.uint8).tobytes()).decode()
open(R+'js/hair2_field.js','w').write(
 "/* generated by tools/build_hair2.py: hair v2 lock fields (amp, phase), origin (%d,%d), step %dpx */\n"
 "(function(root){var G={x0:%d,y0:%d,step:%d,w:%d,h:%d,amp:'%s',phase:'%s'};"
 "if(typeof module!=='undefined'&&module.exports)module.exports=G;else root.LANYI_HAIR2_FIELD=G;})(this);\n"%(X0,Y0,STEP,X0,Y0,STEP,gw,gh,enc(amp),enc(ph)))
# rest check
comp=eff*(1-aq[...,None])+F*aq[...,None]
err=np.abs(np.round(comp)-o).max()
json.dump({'underlay_origin':[CX,CY],'locks_origin':[CX,CY],'rest_composite_max_err':float(err),
  'lock_px_alpha_gt_0.5':int((a>0.5).sum()),'underlay_px':int((uac>0).sum())},open(R+'work/hair/hair2_meta.json','w'),indent=1)
print('rest err',err,'lock px',int((a>0.5).sum()))
vis=np.concatenate([o, eff, (F*aq[...,None]+np.array([255,0,255])*(1-aq[...,None]))],1)
Image.fromarray(vis.clip(0,255).astype(np.uint8)).save(R+'review/hair2_layers_orig_underlay_locks_v2.png')
# ---- embed locks (alpha bbox) as JS so file:// works without canvas tainting
L=locks; ys,xs=np.where(L[...,3]>0); x0,y0,x1,y1=xs.min(),ys.min(),xs.max()+1,ys.max()+1
c=np.ascontiguousarray(L[y0:y1,x0:x1])
open(R+'js/hair2_locks.js','w').write("/* generated by tools/build_hair2.py from assets/hair2_locks.png (straight RGBA, original pixels + solved matte); embedded so file:// works */\n(function(root){var G={x0:%d,y0:%d,w:%d,h:%d,data:'%s'};if(typeof module!=='undefined'&&module.exports)module.exports=G;else root.LANYI_HAIR2_LOCKS=G;})(this);\n"%(int(x0+CX),int(y0+CY),c.shape[1],c.shape[0],base64.b64encode(c.tobytes()).decode()))
