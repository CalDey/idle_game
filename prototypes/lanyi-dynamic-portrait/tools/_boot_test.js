const path='/workspace/lanyi-portrait-v2-bot/'; let C; C=require(path+'tools/node_modules/canvas')
const vm=require('vm'),fs=require('fs');
const canvas=C.createCanvas(728,1296); const els={stage:canvas,status:{textContent:''}};
let rafs=[]; const win={matchMedia:()=>({matches:false}),requestAnimationFrame:f=>rafs.push(f)};
const document={getElementById:id=>els[id]||null,createElement:()=>C.createCanvas(1,1),addEventListener(){},readyState:'complete'};
class Img{constructor(){this.i=new C.Image();this.i.onload=()=>{this.width=this.i.width;this.height=this.i.height;this.onload&&this.onload()};this.i.onerror=e=>this.onerror&&this.onerror(e)} set src(s){this.i.src=s}}
const ctxObj={atob,Buffer,window:win,document,Image:C.Image,requestAnimationFrame:win.requestAnimationFrame,console,setTimeout,addEventListener(){} };
ctxObj.window=ctxObj; Object.assign(ctxObj,{matchMedia:win.matchMedia});
vm.createContext(ctxObj);
for(const m of fs.readFileSync(path+'index.html','utf8').matchAll(/src="(js\/[^"]+)"/g)) vm.runInContext(fs.readFileSync(path+m[1],'utf8'),ctxObj,{filename:m[1]});
setTimeout(()=>{let t=0;const seen=new Set();for(let i=0;i<400;i++){const r=rafs;rafs=[];r.forEach(f=>f(t));t+=50;const m=els.status.textContent.match(/眨眼阶段 (\d+)/);if(m)seen.add(+m[1]);} console.log('status:',els.status.textContent,'stages',[...seen].sort((a,b)=>a-b).join(','));},3000);
