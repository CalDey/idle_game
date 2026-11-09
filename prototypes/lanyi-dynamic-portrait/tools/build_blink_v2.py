"""Bot-authored v2 closed-eye painter for lanyi (procedural, from original RGB).
Per eye, per stage c in [0,1]:
  * crease/brow (above original lash top) untouched; hair-blue pixels inside region stay original
  * upper lid descends: lid edge E(x)=lerp(U(x), C(x), c); lid skin painted between lash-top and E
    with volume (ball highlight, crease shadow, inner-corner shadow) + matched skin grain
  * moving lid edge = lash stroke: original lash band (early) -> painted tapered arc lash with
    downward flicks at the outer third (late); soft lid shadow cast on the iris below the edge
  * closed: smile-shaped arc lowest near outer third, thick->thin from outer to inner corner,
    warm-dark shadow under the lash line, no open-eye ghost (region to lower lid fully repainted)
Supersampled 8x, BOX-downsampled; alpha feathered only where changed."""
import json, numpy as np, cv2
from PIL import Image
R='/workspace/lanyi-portrait-v2-bot/'
src=np.asarray(Image.open(R+'assets/source_original.jpg').convert('RGB')).astype(np.float64)
H,W,_=src.shape; SS=8
LUM=np.array([0.299,0.587,0.114])
def gblur(a,s): return cv2.GaussianBlur(np.ascontiguousarray(a,np.float64),(0,0),s,borderType=cv2.BORDER_REFLECT)
def interp(pts,xs):
    px=np.array([p[0] for p in pts],float); py=np.array([p[1] for p in pts],float); return np.interp(xs,px,py)
def ss01(u): u=np.clip(u,0,1); return u*u*(3-2*u)

EYES={
 'L':dict(box=[504,158,558,194], outer=(510.5,175.8), inner=(548.5,182.6), sag=2.6, peak=0.36,
   U=[(511,175.6),(514,174.0),(518,172.5),(522,173.0),(528,173.0),(532,173.2),(536,173.5),(540,174.5),(543,176.5),(545,179.0),(547,181.5),(549,182.8)],
   L=[(511,176.2),(514,177.2),(518,178.6),(522,180.6),(527,182.3),(532,183.0),(538,182.7),(542,182.4),(546,182.0),(549,182.9)],
   lash=4.3, w_outer=2.5, w_inner=0.7, flicks=[(0.04,2.6,-0.9),(0.13,2.4,-0.5),(0.23,2.0,-0.15),(0.33,1.5,0.1)],
   grain=(516,185,546,194)),
 'R':dict(box=[568,183,600,205], outer=(592.6,195.6), inner=(574.2,193.6), sag=1.7, peak=0.38,
   U=[(574,193.5),(576,192.6),(578,192.2),(582,192.2),(586,191.6),(589,192.3),(592,193.6),(593,194.6)],
   L=[(574,194.0),(576,195.5),(578,197.0),(582,198.0),(586,198.8),(589,198.6),(592,197.4),(593,196.6)],
   lash=3.7, w_outer=2.1, w_inner=0.6, flicks=[(0.03,2.0,0.9),(0.12,1.8,0.5),(0.22,1.4,0.15)],
   grain=(574,199,590,205)),
}
LASH_RGB=np.array([14.0,8.0,14.0])

def arc_y(e,xs):
    (xo,yo),(xi,yi)=e['outer'],e['inner']
    t=np.clip((xs-xo)/(xi-xo),0,1)
    k=np.log(0.5)/np.log(e['peak'])
    return yo+(yi-yo)*t+e['sag']*np.sin(np.pi*t**k), t

def skin_model(box,excl):
    x0,y0,x1,y1=box; p=12
    reg=src[y0-p:y1+p,x0-p:x1+p]; lum=reg@LUM
    m=((lum>70)&(reg[...,0]>reg[...,2]+8)).astype(float); m[excl[y0-p:y1+p,x0-p:x1+p]]=0
    def nc(s):
        d=gblur(m,s); return np.dstack([gblur(reg[...,k]*m,s) for k in range(3)])/np.maximum(d,1e-6)[...,None], d
    a1,d1=nc(2.5); a2,_=nc(7.0); w=np.clip(d1/0.3,0,1)[...,None]
    return (w*a1+(1-w)*a2)[p:-p,p:-p]

def stroke_mask(shape,pts_x,pts_y,widths):
    """filled variable-width polyline on SS canvas (coords already in SS px)."""
    P=np.stack([pts_x,pts_y],1); n=len(P)
    T=np.gradient(P,axis=0); T/=np.linalg.norm(T,axis=1,keepdims=True)+1e-9
    N=np.stack([-T[:,1],T[:,0]],1)
    left=P+N*(widths[:,None]/2); right=P-N*(widths[:,None]/2)
    poly=np.concatenate([left,right[::-1]]).astype(np.int32)
    m=np.zeros(shape,np.uint8); cv2.fillPoly(m,[poly],255,lineType=cv2.LINE_AA)
    return m.astype(float)/255

meta={}; rng=np.random.default_rng(1109)
for name,e in EYES.items():
    x0,y0,x1,y1=e['box']; bw,bh=x1-x0,y1-y0; BW,BH=bw*SS,bh*SS
    excl=np.zeros((H,W),bool)
    for x in range(x0,x1):
        u=interp(e['U'],[x+.5])[0]; l=interp(e['L'],[x+.5])[0]; excl[int(u-e['lash']-1):int(l+2),x]=True
    skin=skin_model(e['box'],excl)
    # skin grain: residual of a clean skin patch, std per channel
    gx0,gy0,gx1,gy1=e['grain']; patch=src[gy0:gy1,gx0:gx1]
    resid=patch-gblur(patch,1.2); gstd=resid.reshape(-1,3).std(0)
    noise=gblur(rng.normal(0,1,(bh,bw)),0.55); noise/=noise.std()+1e-9
    grain=noise[...,None]*gstd[None,None,:]*1.1
    up=lambda a: cv2.resize(np.ascontiguousarray(a,np.float64),(BW,BH),interpolation=cv2.INTER_CUBIC)
    big=up(src[y0:y1,x0:x1]); bskin=up(skin); bgrain=up(grain)
    xs=x0+(np.arange(BW)+.5)/SS; ys=y0+(np.arange(BH)+.5)/SS; YY=ys[:,None]
    xmin=min(e['outer'][0],e['inner'][0]); xmax=max(e['outer'][0],e['inner'][0])
    inside=(xs>=xmin)&(xs<=xmax)
    taper=ss01(np.minimum(xs-xmin,xmax-xs)/2.0)
    U=interp(e['U'],xs); Lw=interp(e['L'],xs); C,tpar=arc_y(e,xs)
    lt=U-e['lash']
    # seed: skin row just above lash top (continuity with untouched crease)
    iy0=np.clip(((lt-1.3-y0)*SS).astype(int),0,BH-1)
    seed=np.stack([big[max(iy0[i]-SS,0):iy0[i]+1,i].mean(0) for i in range(BW)])
    seed=cv2.GaussianBlur(seed[None].astype(np.float64),(0,0),sigmaX=SS*1.0,sigmaY=0.1)[0]
    ws=np.clip(((seed@LUM)-55)/25,0,1)
    # hair-blue pixels inside the region are kept original (on top)
    bl=big; hairm=((bl[...,2]>bl[...,0]+22)&((bl@LUM)<70)).astype(float)
    hairm[(YY>=(U-0.8)[None,:])&(YY<=(Lw+1.5)[None,:])]=0   # iris is blue too: never protect inside the opening
    hairm=gblur(hairm,SS*0.4)
    lashw=e['w_outer']+(e['w_inner']-e['w_outer'])*tpar**0.8   # thick(outer)->thin(inner)
    for s in range(33):
        c=s/32.0
        out=big.copy()
        if s==0:
            rgba=np.dstack([src[y0:y1,x0:x1],np.zeros((bh,bw))]).astype(np.uint8)
            Image.fromarray(rgba,'RGBA').save(R+f'assets/blink/eye{name}_stage_{s:02d}.png'); continue
        k=ss01((c-0.25)/0.55)                         # painted-lash blend factor
        E=U+(C-U)*c*taper+0.0                        # lid edge (centre of lash stroke at closed)
        th_orig=e['lash']*(1-0.3*c)
        # stroke thickness: original band -> painted taper
        th=th_orig*(1-k)+lashw*k
        top=E-th*(1-k*0.5)                           # top of lash stroke
        # ---- lid skin with volume
        span=np.maximum(top-lt,1e-3)
        v=np.clip((YY-lt[None,:])/span[None,:],0,1)  # 0 crease -> 1 lash
        u=tpar[None,:]                               # 0 outer -> 1 inner
        dist_top=np.clip(YY-lt[None,:],0,None)
        wdec=(np.exp(-dist_top/3.0)*ws[None,:])[...,None]
        base=wdec*seed[None]+(1-wdec)*bskin*0.93
        vol=(1+0.11*c*np.exp(-((u-0.45)/0.30)**2-((v-0.55)/0.32)**2)
               -0.13*c*(1-v)**1.5*(1-np.exp(-dist_top/1.2))
               -0.06*c*ss01((u-0.72)/0.28)
               -0.07*np.exp(-np.clip(top[None,:]-YY,0,None)/1.1))   # soft shade into lash
        lid=base*vol[...,None]+bgrain*np.clip(dist_top/1.5,0,1)[...,None]
        lidm=(YY>=lt[None,:])&(YY<top[None,:])
        out=np.where(lidm[...,None],lid,out)
        # ---- under-closure: once the lid passes, region from E to lower lid becomes lower-lid skin
        lowtop=E
        lowm=(YY>=lowtop[None,:])&(YY<(Lw+1.6)[None,:])
        cover=np.clip((c-0.82)/0.18,0,1)             # only near full closure (no ghost of open eye)
        lower=bskin*(1-0.16*np.exp(-np.clip(YY-E[None,:],0,None)/1.4))[...,None]+bgrain
        fade=np.clip(((Lw+1.6)[None,:]-YY)/1.2,0,1)[...,None]
        out=np.where(lowm[...,None],out*(1-cover*fade)+lower*cover*fade,out)
        # ---- lid shadow cast on the visible eye just below the edge (mid stages)
        if c<1:
            sh=np.exp(-np.clip(YY-E[None,:],0,None)/1.3)*((YY>=E[None,:]))*(1-cover)
            out=out*(1-0.35*sh*(1-c*0.3))[...,None]
        # ---- lash: original band shifted (early) + painted taper arc (late)
        band=(YY>=top[None,:])&(YY<E[None,:]+th*k*0.5)
        frac=np.clip((YY-top[None,:])/np.maximum(E-top,1e-3)[None,:],0,1)
        sy=lt[None,:]+frac*e['lash']
        iy=np.clip(((sy-y0)*SS).astype(int),0,BH-1); ix=np.broadcast_to(np.arange(BW)[None,:],iy.shape)
        origlash=big[iy,ix]
        if k<1:
            out=np.where(band[...,None],origlash*(1-k)+out*k,out)
        # painted stroke (centre line at E - th/2*(1-k)... at closed sits on the arc)
        cy=E-(th*0.5)*(1-k)
        sel=np.where(inside)[0]
        m=stroke_mask((BH,BW),(xs[sel]-x0)*SS,(cy[sel]-y0)*SS,lashw[sel]*SS*np.maximum(taper[sel],0.25))
        # flicks at the outer third, pointing down/outward
        for (tp,ln,dx) in e['flicks']:
            xf=e['outer'][0]+(e['inner'][0]-e['outer'][0])*tp
            yf=float(np.interp(xf,xs,cy)); n=12
            tt=np.linspace(0,1,n)
            fx=xf+dx*tt+ (np.sign(e['outer'][0]-e['inner'][0])*0.6*tt)
            fy=yf+0.3+ln*tt*k
            m=np.maximum(m,stroke_mask((BH,BW),(fx-x0)*SS,(fy-y0)*SS,(0.75*(1-tt)+0.08)*SS))
        m*=k
        out=out*(1-m[...,None])+LASH_RGB[None,None,:]*m[...,None]
        # warm-dark shadow just under the lash line (closed)
        under=np.exp(-np.clip(YY-(cy+lashw*0.5)[None,:],0,None)/1.0)*(YY>cy[None,:])*k
        out=out*(1-0.14*under)[...,None]+np.array([40,18,14.0])*0.14*under[...,None]*0.5
        # restrict to eye columns with taper; keep hair pixels on top
        wcol=(inside*np.clip(taper*1.5,0,1))[None,:,None]
        out=big*(1-wcol)+out*wcol
        out=out*(1-hairm[...,None])+big*hairm[...,None]
        small=cv2.resize(out,(bw,bh),interpolation=cv2.INTER_AREA)
        diff=np.abs(small-src[y0:y1,x0:x1]).max(2)
        a=(diff>0.5).astype(float); a=np.clip(gblur(a,0.6)*2.0,0,1); a[diff>2]=1
        rgba=np.dstack([np.clip(small,0,255),a*255]).round().astype(np.uint8)
        Image.fromarray(rgba,'RGBA').save(R+f'assets/blink/eye{name}_stage_{s:02d}.png')
    meta[name]={'x':x0,'y':y0,'w':bw,'h':bh}
json.dump(meta,open(R+'assets/blink/blink_meta.json','w')); print(meta)
