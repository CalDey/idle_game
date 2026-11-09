"""Bot-authored: build 33 staged closed-eyelid patches for lanyi from the original RGB.
For each eye column: the upper lash band slides down to the lower lid line; the area it
uncovers above is filled with a smooth skin model fitted from surrounding clean skin
(normalized Gaussian convolution of original skin pixels). Supersampled 4x for AA.
Output: assets/blink/eye{L,R}_stage_XX.png (RGBA, alpha only where lid changes)."""
import json, numpy as np
from PIL import Image
import cv2
def gaussian_filter(a,sig):
    return cv2.GaussianBlur(np.ascontiguousarray(a,dtype=np.float64),(0,0),sig,borderType=cv2.BORDER_REFLECT)
ROOT='/workspace/lanyi-portrait-v2-bot/'
src=np.asarray(Image.open(ROOT+'assets/source_original.jpg').convert('RGB')).astype(np.float64)
H,W,_=src.shape
SS=4
EYES={
 'L':dict(box=[504,158,558,194],
   U=[(512,175.5),(516,173.2),(518,172.5),(522,173.0),(528,173.0),(532,173.2),(536,173.5),(540,174.5),(543,176.5),(545,179.0),(547,181.5),(549,183.0)],
   L=[(512,176.0),(516,177.5),(518,178.5),(522,180.5),(527,182.3),(532,183.0),(538,182.6),(542,182.3),(546,181.8),(549,183.0)],
   lash=4.3),
 'R':dict(box=[568,183,600,205],
   U=[(574,193.5),(576,192.6),(578,192.2),(582,192.2),(586,191.6),(589,192.3),(592,193.5)],
   L=[(574,194.0),(576,195.5),(578,197.0),(582,198.0),(586,199.0),(589,199.0),(592,198.6)],
   lash=3.7),
}
def interp(pts,xs):
    px=np.array([p[0] for p in pts],float); py=np.array([p[1] for p in pts],float)
    return np.interp(xs,px,py)

def skin_model(box,excl):
    x0,y0,x1,y1=box; pad=10
    X0,Y0,X1,Y1=x0-pad,y0-pad,x1+pad,y1+pad
    reg=src[Y0:Y1,X0:X1]
    lum=reg@[0.299,0.587,0.114]
    m=((lum>70)&(reg[...,0]>reg[...,2]+8)).astype(float)
    m[excl[Y0:Y1,X0:X1]]=0
    out=np.zeros_like(reg)
    den=gaussian_filter(m,3.0)
    for k in range(3): out[...,k]=gaussian_filter(reg[...,k]*m,3.0)/np.maximum(den,1e-6)
    # widen to fill sparse holes
    den2=gaussian_filter(m,7.0); out2=np.zeros_like(reg)
    for k in range(3): out2[...,k]=gaussian_filter(reg[...,k]*m,7.0)/np.maximum(den2,1e-6)
    a=np.clip(den/0.25,0,1)[...,None]
    model=a*out+(1-a)*out2
    return model[pad:-pad,pad:-pad]

meta={}
for name,e in EYES.items():
    x0,y0,x1,y1=e['box']; bw,bh=x1-x0,y1-y0
    # exclusion: eye opening + lash band (not skin)
    excl=np.zeros((H,W),bool)
    for x in range(x0,x1):
        u=interp(e['U'],[x+0.5])[0]; l=interp(e['L'],[x+0.5])[0]
        excl[int(u-e['lash']-1):int(l+2),x]=True
    skin=skin_model(e['box'],excl)
    # supersampled original + skin
    big=np.asarray(Image.fromarray(src[y0:y1,x0:x1].astype(np.uint8)).resize((bw*SS,bh*SS),Image.BICUBIC)).astype(float)
    bigskin=np.asarray(Image.fromarray(np.clip(skin,0,255).astype(np.uint8)).resize((bw*SS,bh*SS),Image.BICUBIC)).astype(float)
    xs=x0+(np.arange(bw*SS)+0.5)/SS
    ys=y0+(np.arange(bh*SS)+0.5)/SS
    xmin=min(p[0] for p in e['U']); xmax=max(p[0] for p in e['U'])
    U=interp(e['U'],xs); Lw=interp(e['L'],xs)
    inside=(xs>=xmin)&(xs<=xmax)
    C=Lw-0.4  # closed lid line sits on the lower lid
    taper=np.clip((xs-xmin)/2.5,0,1)*np.clip((xmax-xs)/2.5,0,1)
    taper=taper*taper*(3-2*taper)
    gap=np.where(inside,np.maximum(C-U,0),0)*taper
    YY=ys[:,None]
    for s in range(33):
        c=s/32.0
        d=gap*c                       # lash band shift per column
        lt=U-e['lash']                # original lash band top
        thick=e['lash']*(1-0.25*c)    # slightly thinner lash line when closed
        E=U+d                         # current lid edge (bottom of lash band)
        out=big.copy()
        # 1) skin of the eyelid between original lash top and new lash top
        newtop=E-thick
        lidmask=(YY>=lt[None,:])&(YY<newtop[None,:])
        # soft shadow toward lash line
        dist=(newtop[None,:]-YY)
        shade=1-0.10*np.exp(-np.clip(dist,0,None)/1.6)
        # eyelid = continuation of the skin row just above the lash band (per column, lightly
        # smoothed horizontally), decaying into the darkened skin model; hair-dark seeds fall back
        # to the model. Nothing above the original lash top is touched.
        seed_y=lt-1.2
        iy0=np.clip(((seed_y-y0)*SS-0.5).round().astype(int),0,bh*SS-1)
        seed=np.stack([big[iy0[i]-SS:iy0[i]+1,i].mean(0) for i in range(bw*SS)])
        seed=cv2.GaussianBlur(seed[None].astype(np.float64),(0,0),sigmaX=SS*1.0,sigmaY=0.1)[0]
        slum=seed@np.array([0.299,0.587,0.114])
        ws=np.clip((slum-55)/25,0,1)
        model=bigskin*0.88
        dist_top=np.clip(YY-lt[None,:],0,None)
        wdec=(np.exp(-dist_top/3.5)*ws[None,:])[...,None]
        lid=wdec*seed[None,:,:]+(1-wdec)*model
        lid=lid*shade[...,None]
        out=np.where(lidmask[...,None],lid,out)
        # 2) lash band moved down: sample original lash band (rows lt..U) mapped to (newtop..E)
        band=(YY>=newtop[None,:])&(YY<E[None,:])
        frac=(YY-newtop[None,:])/np.maximum(thick,1e-3)
        srcy=lt[None,:]+frac*e['lash']
        iy=np.clip(((srcy-y0)*SS-0.5).round().astype(int),0,bh*SS-1)
        ix=np.broadcast_to(np.arange(bw*SS)[None,:],iy.shape)
        lashpix=big[iy,ix]
        # darken lashes slightly as eye closes so the closed line reads at 450px
        lashpix=lashpix*(1-0.12*c)
        out=np.where(band[...,None],lashpix,out)
        # restrict to eye columns
        out=np.where(inside[None,:,None],out,big)
        changed=(lidmask|band)&inside[None,:]
        small=np.asarray(Image.fromarray(np.clip(out,0,255).astype(np.uint8)).resize((bw,bh),Image.BOX)).astype(float)
        a=np.asarray(Image.fromarray((changed*255).astype(np.uint8)).resize((bw,bh),Image.BOX)).astype(float)/255
        a=np.clip(gaussian_filter(a,0.5)*1.6,0,1) if s>0 else a*0
        # where alpha>0 but pixel essentially unchanged, it's harmless (same RGB)
        rgba=np.dstack([small,a*255]).round().clip(0,255).astype(np.uint8)
        Image.fromarray(rgba,'RGBA').save(ROOT+f'assets/blink/eye{name}_stage_{s:02d}.png')
    meta[name]={'x':x0,'y':y0,'w':bw,'h':bh}
json.dump(meta,open(ROOT+'assets/blink/blink_meta.json','w'))
print(meta)
