import numpy as np, cv2, json
from PIL import Image
D='/workspace/lanyi-portrait-v2-bot/handoff_underlay/'
ref=np.asarray(Image.open(D+'lanyi_underlay_reference_9x16_x4_y206_486x864.png').convert('RGB')).astype(np.float32)
gen=np.asarray(Image.open(D+'gen_out/underlay_gen_raw.jpg').convert('RGB').resize((486,864),Image.LANCZOS)).astype(np.float32)
A=np.asarray(Image.open(D+'mask_red_to_background_486x864.png'))>0
B=np.asarray(Image.open(D+'mask_blue_to_inner_hair_486x864.png'))>0
Z=A|B
outside=~(cv2.dilate(Z.astype(np.uint8),np.ones((41,41),np.uint8))>0)
g=lambda x: cv2.GaussianBlur(cv2.cvtColor(x,cv2.COLOR_RGB2GRAY),(0,0),1.0)
warp=np.eye(2,3,dtype=np.float32)
cc,warp=cv2.findTransformECC(g(ref),g(gen),warp,cv2.MOTION_AFFINE,(cv2.TERM_CRITERIA_EPS|cv2.TERM_CRITERIA_COUNT,500,1e-7),outside.astype(np.uint8),5)
al=cv2.warpAffine(gen,warp,(486,864),flags=cv2.INTER_LINEAR|cv2.WARP_INVERSE_MAP,borderMode=cv2.BORDER_REFLECT)
def mad(m,img): return float(np.abs(img-ref)[m].mean())
# local residual check per tile outside zones
res=np.abs(al-ref).mean(2)
tiles=[]
for y in range(0,864,96):
  for x in range(0,486,81):
    m=outside[y:y+96,x:x+81]
    if m.mean()>0.5: tiles.append(float(res[y:y+96,x:x+81][m].mean()))
# colour match using ring around zones
ring=(cv2.dilate(Z.astype(np.uint8),np.ones((31,31),np.uint8))>0)&~(cv2.dilate(Z.astype(np.uint8),np.ones((5,5),np.uint8))>0)
cm=al.copy()
for c in range(3):
  ms,ss=ref[...,c][ring].mean(),ref[...,c][ring].std(); mg,sg=al[...,c][ring].mean(),al[...,c][ring].std()
  cm[...,c]=(al[...,c]-mg)*(ss/max(sg,1e-3))+ms
cm=cm.clip(0,255)
Image.fromarray(cm.astype(np.uint8)).save(D+'gen_out/underlay_registered_colormatched_486x864.png')
rep={'ecc_cc':float(cc),'warp':warp.tolist(),'mad_outside_before':mad(outside,gen),'mad_outside_after':mad(outside,al),'mad_ring_after_cm':mad(ring,cm),
 'tile_residual_outside_max':max(tiles),'tile_residual_outside_median':float(np.median(tiles)),
 'mad_in_red_vs_ref':mad(A,cm),'mad_in_blue_vs_ref':mad(B,cm)}
json.dump(rep,open(D+'gen_out/registration_report.json','w'),indent=1); print(json.dumps(rep,indent=1))
# zoom compare: ref | gen registered | marked, x2 on hair zone
x0,y0,x1,y1=60,40,330,800
mk=np.asarray(Image.open(D+'lanyi_underlay_regions_marked_486x864.png').convert('RGB'))
row=np.concatenate([ref[y0:y1,x0:x1],cm[y0:y1,x0:x1],mk[y0:y1,x0:x1].astype(np.float32)],1).astype(np.uint8)
Image.fromarray(row).save(D+'gen_out/compare_ref_gen_marked.png')
