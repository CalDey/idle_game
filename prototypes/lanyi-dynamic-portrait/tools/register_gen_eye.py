"""Bot-authored: register the generated closed-eye face crop to the original (ECC affine, masked
to face features excluding the eye fissures), output aligned crop at native scale + overlays."""
import numpy as np, cv2, json
from PIL import Image
R='/workspace/lanyi-portrait-v2-bot/'
CX,CY,CS=400,40,300; S=2   # crop origin/size; work at 2x
src=np.asarray(Image.open(R+'assets/source_original.jpg').convert('RGB'))
orig=src[CY:CY+CS,CX:CX+CS]
gen=np.asarray(Image.open(R+'handoff_gemini_eye/gen_out/closed_eye_gen_1024.jpg').convert('RGB'))
o2=cv2.resize(orig,(CS*S,CS*S),interpolation=cv2.INTER_CUBIC)
g2=cv2.resize(gen,(CS*S,CS*S),interpolation=cv2.INTER_AREA)
def prep(a):
    g=cv2.cvtColor(a,cv2.COLOR_RGB2GRAY).astype(np.float32)
    g=cv2.GaussianBlur(g,(0,0),1.2)
    # normalise local contrast so the brightness/tone difference doesn't dominate
    m=cv2.GaussianBlur(g,(0,0),15); sd=np.sqrt(cv2.GaussianBlur((g-m)**2,(0,0),15))+4
    return ((g-m)/sd).astype(np.float32)
O,G=prep(o2),prep(g2)
mask=np.zeros((CS*S,CS*S),np.uint8)
# face features region: brows, nose, mouth, face contour, ear (full coords -> crop*2)
def fr(x0,y0,x1,y1,v=255): mask[(y0-CY)*S:(y1-CY)*S,(x0-CX)*S:(x1-CX)*S]=v
fr(440,120,660,300)
fr(504,166,556,190,0); fr(566,182,604,206,0)   # exclude eye fissures (content differs)
best=None
for mode,name in [(cv2.MOTION_AFFINE,'affine'),(cv2.MOTION_HOMOGRAPHY,'homography')]:
    Wm=np.eye(3,dtype=np.float32) if mode==cv2.MOTION_HOMOGRAPHY else np.eye(2,3,dtype=np.float32)
    try:
        cc,Wm=cv2.findTransformECC(O,G,Wm,mode,(cv2.TERM_CRITERIA_EPS|cv2.TERM_CRITERIA_COUNT,400,1e-6),mask,5)
    except cv2.error as e:
        print(name,'fail',e); continue
    print(name,'cc',cc,Wm.tolist())
    if best is None or cc>best[0]+0.01: best=(cc,Wm,mode,name)
cc,Wm,mode,name=best
warp=(cv2.warpPerspective if mode==cv2.MOTION_HOMOGRAPHY else cv2.warpAffine)
flags=cv2.INTER_CUBIC+cv2.WARP_INVERSE_MAP
gw2=warp(g2,Wm,(CS*S,CS*S),flags=flags,borderMode=cv2.BORDER_REFLECT)
Gw=prep(gw2)
# residual: local shift estimate by phase correlation in patches near the eyes (feature areas)
res={}
for nm,(x0,y0,x1,y1) in {'brow_left':(500,150,545,170),'brow_right':(560,165,610,186),'nose':(565,205,605,245),
                        'crease_left':(512,160,552,172),'crease_right':(570,182,602,192),'mouth':(560,255,610,285)}.items():
    a=O[(y0-CY)*S:(y1-CY)*S,(x0-CX)*S:(x1-CX)*S]; b=Gw[(y0-CY)*S:(y1-CY)*S,(x0-CX)*S:(x1-CX)*S]
    win=cv2.createHanningWindow(a.shape[::-1],cv2.CV_32F)
    (dx,dy),resp=cv2.phaseCorrelate(a,b,win)
    res[nm]={'dx_px':round(dx/S,2),'dy_px':round(dy/S,2),'resp':round(resp,3)}
print(json.dumps(res))
gw=cv2.resize(gw2,(CS,CS),interpolation=cv2.INTER_AREA)
Image.fromarray(gw).save(R+'handoff_gemini_eye/gen_out/closed_eye_gen_aligned_300.png')
json.dump({'model':name,'ecc_cc':float(cc),'warp_2x':Wm.tolist(),'residual_phasecorr_native_px':res},
          open(R+'handoff_gemini_eye/gen_out/alignment_report.json','w'),indent=1)
# overlay: checkerboard + edge overlay around eyes at 4x
x0,y0,x1,y1=490,140,620,220
oc=orig[y0-CY:y1-CY,x0-CX:x1-CX]; gc=gw[y0-CY:y1-CY,x0-CX:x1-CX]
e1=cv2.Canny(cv2.cvtColor(oc,cv2.COLOR_RGB2GRAY),40,100); e2=cv2.Canny(cv2.cvtColor(gc,cv2.COLOR_RGB2GRAY),40,100)
ov=np.zeros(oc.shape,np.uint8); ov[...,0]=e1; ov[...,1]=e2
blend=(oc*0.5+gc*0.5).astype(np.uint8)
sh=np.concatenate([oc,gc,blend,np.maximum(ov,(oc*0.35).astype(np.uint8))],1)
Image.fromarray(sh).resize((sh.shape[1]*4,sh.shape[0]*4),Image.NEAREST).save(R+'work/align_overlay.png')
