import numpy as np, cv2, json, sys
from PIL import Image
D='/workspace/lanyi-portrait-v2-bot/handoff_underlay_v5/'
out={}
for name,(CX,CY) in {'upper':(0,200),'lower':(0,896)}.items():
    ref=np.asarray(Image.open(D+f'{name}_reference_9x16_x{CX}_y{CY}_504x896.png').convert('RGB'))
    gen=np.asarray(Image.open(D+f'gen_out/{name}_gen.jpg').convert('RGB'))
    Z=(np.asarray(Image.open(D+f'{name}_mask_red_504x896.png'))>0)|(np.asarray(Image.open(D+f'{name}_mask_blue_504x896.png'))>0)
    outside=(~(cv2.dilate(Z.astype(np.uint8),np.ones((25,25),np.uint8))>0)).astype(np.uint8)
    sift=cv2.SIFT_create(8000)
    gr=cv2.cvtColor(ref,cv2.COLOR_RGB2GRAY); gg=cv2.cvtColor(gen,cv2.COLOR_RGB2GRAY)
    k1,d1=sift.detectAndCompute(gr,outside*255); k2,d2=sift.detectAndCompute(gg,None)
    m=cv2.BFMatcher().knnMatch(d1,d2,k=2); good=[a for a,b in m if a.distance<0.75*b.distance]
    p1=np.float32([k1[a.queryIdx].pt for a in good]); p2=np.float32([k2[a.trainIdx].pt for a in good])
    A,inl=cv2.estimateAffine2D(p2,p1,ransacReprojThreshold=2.0,maxIters=20000)
    ninl=int(inl.sum())
    al=cv2.warpAffine(gen,A,(504,896),flags=cv2.INTER_LANCZOS4,borderMode=cv2.BORDER_REPLICATE)
    # refine with ECC (affine) on outside
    g=lambda x: cv2.GaussianBlur(cv2.cvtColor(x,cv2.COLOR_RGB2GRAY).astype(np.float32),(0,0),1.0)
    try:
        cc,w=cv2.findTransformECC(g(ref),g(al),np.eye(2,3,dtype=np.float32),cv2.MOTION_AFFINE,(cv2.TERM_CRITERIA_EPS|cv2.TERM_CRITERIA_COUNT,300,1e-6),outside,5)
        al=cv2.warpAffine(al,w,(504,896),flags=cv2.INTER_LANCZOS4|cv2.WARP_INVERSE_MAP,borderMode=cv2.BORDER_REPLICATE)
    except cv2.error as e: cc=None; w=None
    res=np.abs(al.astype(float)-ref).mean(2)
    Image.fromarray(al).save(D+f'gen_out/reg/{name}_registered_504x896.png')
    vis=np.concatenate([ref,al,(np.abs(al.astype(int)-ref).clip(0,85)*3).astype(np.uint8)],1)
    Image.fromarray(vis).save(D+f'gen_out/reg/{name}_ref_reg_diff.png')
    out[name]={'matches':len(good),'inliers':ninl,'affine':A.tolist(),'scale':float(np.sqrt(abs(np.linalg.det(A[:,:2])))),'ecc_cc':cc,
               'mad_outside':float(res[outside>0].mean())}
print(json.dumps(out,indent=1)); json.dump(out,open(D+'gen_out/reg/registration_report.json','w'),indent=1)
