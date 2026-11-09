"""Bot-authored: protected-region label masks for verification (bit flags, uint8, 1008x1792 raw)."""
import numpy as np, cv2, json, sys
MODE=sys.argv[1] if len(sys.argv)>1 else 'v3'   # v2: hair zone = underlay(red+blue) + lock sweep; v1: old warp field
R='/workspace/lanyi-portrait-v2-bot/'
W,H=1008,1792
m=np.zeros((H,W),np.uint8)
def rect(bit,x0,y0,x1,y1): m[y0:y1,x0:x1]|=bit
def poly(bit,pts):
    t=np.zeros((H,W),np.uint8); cv2.fillPoly(t,[np.array(pts,np.int32)],1); m[t>0]|=bit
eyes=[(504,158,558,194),(568,183,600,205)]
face=np.zeros((H,W),bool); face[80:296,430:650]=True
for x0,y0,x1,y1 in eyes: face[y0:y1,x0:x1]=False
m[face]|=1
rect(2,480,250,575,300)                 # neck / collar
rect(4,760,220,840,350)   # pillar hand (sword hand is checked as part of the sword occluder below)
# sword = precise occluder mask (set below) + blade below the field
poly(8,[(238,1100),(378,1100),(480,1792),(370,1792)])
rect(16,740,250,1008,900)   # right sleeve
bodyL=np.array([(398,250),(440,250),(440,720),(304,720),(302,700),(300,650),(320,560),(372,450),(392,330)],np.int32)
t_=np.zeros((H,W),np.uint8); cv2.fillPoly(t_,[bodyL],1); t_[296:440,384:472]=0; m[t_>0]|=16   # (shoulder breathing mesh excluded: approved motion)   # left arm + gauze sleeve
rect(32,0,600,W,H)                      # dress / legs (everything below waist; hair zone removed below)
core=np.load(R+'work/protect_core_mask.npy'); X0,Y0=380,280
hc=np.zeros((H,W),bool); hc[Y0:Y0+core.shape[0],X0:X0+core.shape[1]]=core
m[hc]|=64
# hair motion zone (from tools/build_hair.py field): cells that can move, minus the sword occluder
wf=np.load(R+'work/hair/weight_full.npy'); occ=np.load(R+'work/hair/occ.npy')>0
if MODE=='v5':
    from PIL import Image
    # whole left sheet: underlay zone + sheet layer swept by its motion (dx -48..+8, dy -9..+2) ; precise full sword mask
    Z5=np.load(R+'work/hair5_zone.npy')
    la=np.asarray(Image.open(R+'work/hair5_sheet.png'))[...,3]>0
    L=np.zeros((H,W),bool); L[145:145+la.shape[0],0:la.shape[1]]=la
    sw=L.copy()
    for dx in range(-48,9,2):
        for dy in range(-9,3,3): sw|=np.roll(np.roll(L,dy,0),dx,1)
    sw=cv2.dilate(sw.astype(np.uint8),np.ones((3,3),np.uint8))>0
    occ5=np.load(R+'work/hair5_occ.npy')
    hz=(Z5|sw)&~occ5
    m[:,:]&=~np.uint8(8)
    sb=np.zeros((H,W),bool); sb[296:440,384:472]=True   # shoulder breathing mesh (approved motion) is not part of the sword/arm occluder check
    m[occ5&~sb]|=8
    occ5=occ5&~sb
    occ=occ5
elif MODE=='v1':
    hz=cv2.dilate((wf>0.0005).astype(np.uint8),np.ones((33,33),np.uint8))>0
else:
    from PIL import Image
    Z=(np.asarray(Image.open(R+'assets/hair'+('3' if MODE=='v4' else MODE[1])+'_underlay.png'))[...,3]>0); Z=np.pad(Z,((206,H-206-864),(4,W-4-486)))
    la=np.asarray(Image.open(R+'assets/hair'+('3' if MODE=='v4' else MODE[1])+'_locks.png'))[...,3]>0
    L=np.zeros((H,W),bool); L[206:206+864,4:4+486]=la
    # locks only move left (outward) by <=~21px: sweep = lock pixels shifted 0..26px left
    sw=L.copy()
    for k in range(1,27): sw[:,:-k]|=L[:,k:]
    hz=Z|sw
hz&=~occ
rc_removed={}
if MODE in ('v4','v5'):
    # right hair edge + chest braid: underlay zone + lock sweep (locks move <= ~8px sway + breathing ride; 12px margin)
    from PIL import Image
    rz=np.load(R+'handoff_underlay_right_chest/zone_red_full.npy')|np.load(R+'handoff_underlay_right_chest/zone_blue_full.npy')
    la=np.asarray(Image.open(R+'assets/hair4rc_locks.png'))[...,3]>0
    L=np.zeros((H,W),bool); L[40:40+512,440:440+288]=la
    lid=np.zeros((H,W),np.uint8); lid[40:40+512,440:440+288]=np.load(R+'work/hair/rc_lockid.npy')[40:40+512,440:440+288]
    Lr=L&(lid!=3); Lb=L&(lid==3)
    def sweep(Mk,dxs,dys):
        o_=np.zeros_like(Mk)
        for dx in dxs:
            for dy in dys: o_|=np.roll(np.roll(Mk,dy,0),dx,1)
        return o_
    rch=rz|sweep(Lr,range(-2,11),range(-3,4))|sweep(Lb,range(-5,6),range(-4,3))
    src_=np.asarray(Image.open(R+'assets/source_original.jpg').convert('RGB')).astype(int)
    skin=((src_[...,0]-src_[...,2])>8)&(src_.mean(2)>70)
    fr=np.zeros((H,W),bool); fr[80:296,430:650]=True
    print('face-rect skin px inside right/braid hair zone (should be ~0):',int((rch&skin&fr).sum()))
    for bit,name in ((1,'face_excl_eyes'),(64,'hair_braid_in_breath_zone'),(16,'sleeves'),(2,'neck_collar'),(4,'hands')):
        n=int((((m&bit)>0)&rch).sum())
        if n: rc_removed[name]=n
        m[rch & ((m&bit)>0)] &= ~np.uint8(bit)
    hz=hz|rch
    np.save(R+'work/rc_hair_zone.npy',rch)
t2=np.zeros((H,W),bool); t2[640:770,215:310]=True; m[occ&t2]|=4   # sword hand = occluder pixels in hand box
m[occ]|=8   # sword occluder pixels are part of 'sword' check (must stay 0)
m[hz & ((m&32)>0)] &= ~np.uint8(32)    # dress_legs check excludes the hair zone (hair hangs below y600)
allowed=np.zeros((H,W),bool)
allowed[300:560,500:740]=True; allowed[296:440,384:472]=True
allowed&=~hc
for x0,y0,x1,y1 in eyes: allowed[y0:y1,x0:x1]=True
allowed|=hz
m[~allowed]|=128
np.save(R+'work/hair_zone_'+MODE+'.npy',hz)
suf='_'+MODE
m.tofile(R+'work/protect_labels'+suf+'.u8')
names={1:'face_excl_eyes',2:'neck_collar',4:'hands',8:'sword',16:'sleeves',32:'dress_legs_below_y600',64:'hair_braid_in_breath_zone',128:'everything_outside_motion_zones'}
json.dump(names,open(R+'work/protect_labels.json','w'),ensure_ascii=False)
print(MODE,'hair zone px',int(hz.sum()),'px removed from checks by right/braid hair zone:',rc_removed)
print({v:int(((m&k)>0).sum()) for k,v in names.items()})
