from PIL import Image
import json,sys
R='/workspace/lanyi-portrait-v2-bot/'
src=Image.open(R+'assets/source_original.jpg').convert('RGBA')
m=json.load(open(R+'assets/blink/blink_meta.json'))
def comp(s):
  im=src.copy()
  for k,v in m.items():
    p=Image.open(R+f'assets/blink/eye{k}_stage_{s:02d}.png'); im.alpha_composite(p,(v['x'],v['y']))
  return im.convert('RGB')
st=[0,12,20,32]
sh=Image.new('RGB',(720*2,400*2))
for i,s in enumerate(st):
  sh.paste(comp(s).crop((495,150,615,215)).resize((720,390),Image.LANCZOS),((i%2)*720,(i//2)*400))
sh.save(R+'work/blink_grid_'+sys.argv[1]+'.png')
row=Image.new('RGB',(4*130*3,80*3))
for i,s in enumerate(st):
  row.paste(comp(s).resize((450,800),Image.LANCZOS).crop((170,40,300,120)).resize((390,240),Image.NEAREST),(i*390,0))
row.save(R+'work/blink_450_'+sys.argv[1]+'.png')
