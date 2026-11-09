"""Bot-authored: integrate the registered generated closed-eye crop the youming way.
- patch mask hugs each eye fissure (original lash-band top -> just below lower lid), expanded, feathered
- original brows/crease untouched; original dark-blue hair pixels outside the opening stay on top
- local mean/std colour match to the ring of original skin around the mask
- 33 stages: row-by-row reveal along each eye's lid slant (descending lid), narrow feather at the front,
  faint lid-edge shadow at the moving front; stage 0 empty, stage 32 fully closed."""
import numpy as np, cv2, json
from PIL import Image
R='/workspace/lanyi-portrait-v2-bot/'
CX,CY=400,40
src=np.asarray(Image.open(R+'assets/source_original.jpg').convert('RGB')).astype(np.float64)
gen=np.asarray(Image.open(R+'handoff_gemini_eye/gen_out/closed_eye_gen_aligned_300.png').convert('RGB')).astype(np.float64)
H,W,_=src.shape
G=src.copy(); G[CY:CY+300,CX:CX+300]=gen
LUM=np.array([.299,.587,.114])
def interp(pts,xs): return np.interp(xs,[p[0] for p in pts],[p[1] for p in pts])
EYES={
 'L':dict(box=[504,158,558,194],x=(507,554),slope=0.18,lid=9.5,
   U=[(509,176.5),(511,175.6),(514,174.0),(518,172.5),(522,173.0),(528,173.0),(532,173.2),(536,173.5),(540,174.5),(543,176.5),(545,179.0),(547,181.5),(550,183.2)],
   L=[(509,177.0),(511,176.2),(514,177.2),(518,178.6),(522,180.6),(527,182.3),(532,183.0),(538,182.7),(542,182.4),(546,182.0),(550,183.4)],lash=4.3),
 'R':dict(box=[568,183,600,205],x=(571,597),slope=0.11,lid=7.5,
   U=[(572.5,194.0),(574,193.5),(576,192.6),(578,192.2),(582,192.2),(586,191.6),(589,192.3),(592,193.6),(594,194.8)],
   L=[(572.5,194.4),(574,194.0),(576,195.5),(578,197.0),(582,198.0),(586,198.8),(589,198.6),(592,197.4),(594,196.8)],lash=3.7),
}
meta={}; report={}
for name,e in EYES.items():
    x0,y0,x1,y1=e['box']; bw,bh=x1-x0,y1-y0
    yy,xx=np.mgrid[y0:y1,x0:x1].astype(float); xc=xx+.5; yc=yy+.5
    U=interp(e['U'],xc[0]); Lw=interp(e['L'],xc[0])
    top=(U-e['lid'])[None,:]   # v2: cover the whole upper lid up to the crease (removes the original eyeliner/upper lid outline = double lid line)
    bot=(Lw+3.0)[None,:]
    inx=(xc>=e['x'][0])&(xc<=e['x'][1])
    core=((yc>=top)&(yc<=bot)&inx).astype(np.uint8)
    core=cv2.dilate(core,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(3,3)))   # expand ~1px
    m=cv2.GaussianBlur(core.astype(np.float64),(0,0),0.9)
    m=np.clip(m*1.4,0,1)
    o=src[y0:y1,x0:x1]; g=G[y0:y1,x0:x1].copy()
    # hair: original dark-blue pixels outside the opening stay original on top
    opening=(yc>=(U-0.8)[None,:])&(yc<=(Lw+1.5)[None,:])&inx
    hair=((o[...,2]>o[...,0]+22)&((o@LUM)<75)&~opening).astype(np.float64)
    hair=np.clip(cv2.GaussianBlur(hair,(0,0),0.6)*1.6,0,1)
    m=m*(1-hair)
    # colour match: ring of skin around mask
    ring=(cv2.dilate(core,np.ones((7,7),np.uint8))>0)&(core==0)
    skin=ring&((o@LUM)>60)&(o[...,0]>o[...,2]+5)&(hair<0.1)
    mo,so=o[skin].mean(0),o[skin].std(0); mg,sg=g[skin].mean(0),g[skin].std(0)
    ratio=np.clip(so/np.maximum(sg,1),0.85,1.2)
    g=(g-mg)*ratio+mo
    report[name]={'ring_px':int(skin.sum()),'orig_mean':mo.round(1).tolist(),'gen_mean_before':mg.round(1).tolist(),'std_ratio':ratio.round(3).tolist()}
    # reveal progress along the lid slant
    act=m>0.002
    depth=yc-e['slope']*(xc-(e['x'][0]+e['x'][1])/2)
    lo,hi=np.percentile(depth[act],[0,100]); prog=np.clip((depth-lo)/(hi-lo),0,1)
    for s in range(33):
        q=s/32
        rev=np.clip((q*1.08-prog)/0.08,0,1)
        if s==0: rev[:]=0
        if s==32: rev[:]=1
        a=m*rev
        rgb=g.copy()
        if 0<s<32:   # faint shadow of the descending lid just below the front, on the still-open eye
            front=np.clip(1-np.abs(q*1.08-0.04-prog)/0.10,0,1)*(1-rev)
            shade=1-0.28*front*opening
            rgb_o=o*shade[...,None]
            a_sh=np.clip(front*opening*m,0,1)
            rgb=(rgb*a[...,None]+rgb_o*(a_sh*(1-a))[...,None])/np.maximum(a+a_sh*(1-a),1e-6)[...,None]
            a=a+a_sh*(1-a)
        out=np.dstack([np.clip(rgb,0,255),a*255]).round().astype(np.uint8)
        Image.fromarray(out,'RGBA').save(R+f'assets/blink/eye{name}_stage_{s:02d}.png')
    meta[name]={'x':x0,'y':y0,'w':bw,'h':bh}
json.dump(meta,open(R+'assets/blink/blink_meta.json','w'))
json.dump(report,open(R+'handoff_gemini_eye/gen_out/colour_match_report.json','w'),indent=1)
print(report)
