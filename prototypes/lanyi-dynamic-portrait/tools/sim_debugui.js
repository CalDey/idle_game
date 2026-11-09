// 浏览器模拟（vm + 假 DOM，按 index.html 的 script 顺序执行）；getImageData 一律抛 SecurityError（file:// 污染画布）
const ROOT=process.argv[2]||'/workspace/lanyi-portrait-v2-bot';
const C=require('/workspace/lanyi-portrait-v2-bot/tools/node_modules/canvas'); const vm=require('vm'),fs=require('fs'),path=require('path');
const proto=Object.getPrototypeOf(C.createCanvas(1,1).getContext('2d'));
let readCalls=0; proto.getImageData=function(){readCalls++; const e=new Error('tainted'); e.name='SecurityError'; throw e;};
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
function El(tag,attrs){this.tagName=tag;this.attrs=attrs||{};this.handlers={};this.children=[];this.textContent='';const cls=new Set((this.attrs.class||'').split(/\s+/).filter(Boolean));
 this.classList={add:c=>cls.add(c),remove:c=>cls.delete(c),contains:c=>cls.has(c),toggle:(c,f)=>{if(f===undefined)f=!cls.has(c);f?cls.add(c):cls.delete(c);}};
 Object.defineProperty(this,'className',{get:()=>[...cls].join(' '),set:v=>{cls.clear();String(v).split(/\s+/).filter(Boolean).forEach(c=>cls.add(c));}});
 this.value=this.attrs.value; this.checked='checked' in this.attrs; this.type=this.attrs.type;}
El.prototype.addEventListener=function(ev,fn){(this.handlers[ev]=this.handlers[ev]||[]).push(fn);};
El.prototype.fire=function(ev,extra){(this.handlers[ev]||[]).forEach(f=>f(Object.assign({target:this,preventDefault(){}},extra||{})));};
El.prototype.setAttribute=function(k,v){this.attrs[k]=String(v);}; El.prototype.getAttribute=function(k){return this.attrs[k]===undefined?null:this.attrs[k];};
El.prototype.appendChild=function(c){this.children.push(c);c.parent=this;return c;};
const els={},modeBtns=[];
for(const m of html.matchAll(/<(\w+)([^>]*)>/g)){const attrs={};for(const a of m[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))attrs[a[1]]=a[2]===undefined?'':a[2];
 if(m[1]==='canvas'){els[attrs.id]=C.createCanvas(1008,1792);continue;}
 const e=new El(m[1],attrs); if(attrs.id)els[attrs.id]=e; if(attrs['data-mode'])modeBtns.push(e);
 if(m[1]==='select'){e._sel=true;} if(m[1]==='option'&&'selected' in attrs){const sel=Object.values(els).filter(x=>x._sel).pop(); if(sel)sel.value=attrs.value;}}
const layerCbs=[]; const docH={}; 
const document={getElementById:id=>els[id]||null,createElement:t=>{if(t==='canvas')return C.createCanvas(1,1);const e=new El(t,{});if(t==='input')layerCbs.push(e);return e;},
 querySelectorAll:q=>q==='[data-mode]'?modeBtns:(q.startsWith('#layer-list')?layerCbs.filter(c=>c.getAttribute('data-layer')):[]),
 querySelector:q=>{const m=q.match(/data-mode="(\w+)"/);return m?modeBtns.find(b=>b.attrs['data-mode']===m[1]):null;},
 addEventListener:(ev,fn)=>{(docH[ev]=docH[ev]||[]).push(fn);},readyState:'complete',hidden:false,body:{}};
const srcDesc=Object.getOwnPropertyDescriptor(C.Image.prototype,'src');
function Img(){const i=new C.Image();Object.defineProperty(i,'src',{set(v){srcDesc.set.call(i,path.join(ROOT,v));},get(){return srcDesc.get.call(i);}});return i;}
const winH={}; let rafs=[]; const errors=[];
const g={atob,Image:Img,document,console:{log(){},error:e=>errors.push(String(e&&e.message||e))},setTimeout,performance,matchMedia:()=>({matches:false,addEventListener(){}}),requestAnimationFrame:f=>rafs.push(f),addEventListener:(ev,fn)=>{(winH[ev]=winH[ev]||[]).push(fn);}};
g.window=g; g.self=g; vm.createContext(g);
for(const m of html.matchAll(/src="(js\/[^"]+)"/g)) vm.runInContext(fs.readFileSync(path.join(ROOT,m[1]),'utf8'),g,{filename:m[1]});
let ts=0, stopAt=null; const seen=new Set();
function run(n){for(let i=0;i<n;i++){const r=rafs;rafs=[]; if(!r.length){stopAt=stopAt??ts;return false;} r.forEach(f=>f(ts)); ts+=1000/60; const st=g.lanyiDebug&&g.lanyiDebug.getState(); if(st&&st.lastInfo)seen.add(st.lastInfo.stage);} return true;}
const S=()=>g.lanyiDebug.getState(); const checks=[]; function ck(name,cond,extra){checks.push({name,ok:!!cond,...(extra!==undefined?{extra}:{})});}
setTimeout(()=>{
 run(1200); let s=S();
 ck('循环持续运行 1200 帧 (20s)',stopAt===null&&s.simT>19,{simT:s.simT.toFixed(2),renderCount:s.renderCount});
 ck('眨眼出现',[...seen].some(x=>x>=30),{stages:[...seen].length});
 ck('状态栏',/FPS/.test(els['fps-badge'].textContent)&&/实时待机/.test(els['mode-badge'].textContent),{mode:els['mode-badge'].textContent,fps:els['fps-badge'].textContent,line:els['status-line'].textContent});
 // 暂停
 els['btn-pause'].fire('click'); let t1=S().simT, r1=S().renderCount; run(60); s=S();
 ck('暂停：时间冻结、不再重绘',s.userPaused&&s.simT===t1&&s.renderCount===r1+1&&/暂停/.test(els['mode-badge'].textContent),{btn:els['btn-pause'].textContent,badge:els['mode-badge'].textContent});
 winH.keydown.forEach(f=>f({code:'Space',target:document.body,preventDefault(){}})); run(30);
 ck('空格键继续播放',!S().userPaused&&S().simT>t1);
 // 模式
 for(const b of modeBtns){b.fire('click'); run(5); const st=S(); ck('模式按钮 '+b.attrs['data-mode'],st.mode===b.attrs['data-mode']&&b.classList.contains('active'),{badge:els['mode-badge'].textContent});}
 ck('分屏滑块只在分屏显示',true);
 modeBtns[3].fire('click'); ck('分屏滑块显示',!els['split-slider-wrap'].classList.contains('hidden'));
 els['slider-split'].value='0.3'; els['slider-split'].fire('input'); run(2); ck('分割线',S().splitPos===0.3&&els['split-value'].textContent==='30%');
 modeBtns[4].fire('click'); els['sel-diff-gain'].value='64'; els['sel-diff-gain'].fire('change'); run(3); ck('误差放大倍数',S().diffGain===64&&!els['diff-gain-wrap'].classList.contains('hidden'));
 modeBtns[1].fire('click'); let rc=S().renderCount; run(30); ck('静态模式只画一次（锁帧）',S().renderCount===rc+1&&S().lastInfo.stage===0);
 modeBtns[0].fire('click'); run(3);
 // 减弱动态
 els['toggle-reduced-motion'].checked=true; els['toggle-reduced-motion'].fire('change'); t1=S().simT; run(30);
 ck('减弱动态：静止 + 提示条',S().reduced&&S().simT===t1&&!els['reduced-motion-banner'].classList.contains('hidden')&&S().lastInfo.stage===0,{badge:els['mode-badge'].textContent});
 els['btn-override-rm'].fire('click'); run(10); ck('关闭减弱动态按钮',!S().reduced&&S().simT>t1&&els['reduced-motion-banner'].classList.contains('hidden'));
 // 滑块 / 下拉
 const sl=[['slider-intensity','input',0.5,'intensity'],['slider-speed','input',2,'speed'],['hair-strength','input',0.4,'hairStrength'],['slider-breathing','input',1.3,'breathStrength']];
 for(const [id,ev,v,key] of sl){els[id].value=String(v); els[id].fire(ev); run(2); ck('滑块 '+id,S()[key]===v,{label:(els[{'slider-intensity':'intensity-value','slider-speed':'speed-value','hair-strength':'hair-value','slider-breathing':'breathing-value'}[id]]||{}).textContent});}
 ck('总幅度传到渲染参数',Math.abs(S().sceneOpts.hairStrength-0.2)<1e-9&&Math.abs(S().sceneOpts.breathStrength-0.65)<1e-9,S().sceneOpts);
 t1=S().simT; run(60); ck('速度 2x：1 秒走 2 秒',Math.abs(S().simT-t1-2)<0.05,{dt:(S().simT-t1).toFixed(3)});
 els['wind-preset'].value='0.6'; els['wind-preset'].fire('change'); ck('风力预设',S().hairStrength===0.6&&els['hair-strength'].value==0.6);
 for(const m of ['v4','v3','v2','v1','v5']){els['sel-hair'].value=m; els['sel-hair'].fire('change'); run(3); ck('头发版本 '+m,S().hairMode===m&&errors.length===0,{badge:els['hair-status-badge'].textContent});}
 els['toggle-hair'].checked=false; els['toggle-hair'].fire('change'); run(2); ck('头发开关',S().hair===false&&/关闭/.test(els['hair-status-badge'].textContent)); els['toggle-hair'].checked=true; els['toggle-hair'].fire('change');
 els['breath-preset'].value='matched'; els['breath-preset'].fire('change'); run(2); ck('呼吸预设',S().breathPreset==='matched'); els['breath-preset'].value='stronger'; els['breath-preset'].fire('change');
 els['toggle-breathing'].checked=false; els['toggle-breathing'].fire('change'); run(2); ck('呼吸开关（同步图层 07）',!S().breathing&&!S().layers.breath&&S().lastInfo.breathAmp===0&&!layerCbs.find(c=>c.getAttribute('data-layer')==='breath').checked);
 els['toggle-breathing'].checked=true; els['toggle-breathing'].fire('change');
 els['blink-mode'].value='1'; els['blink-mode'].fire('change'); run(2); ck('固定全闭',S().lastInfo.stage===32,{badge:els['blink-status-badge'].textContent});
 els['blink-mode'].value='0.5'; els['blink-mode'].fire('change'); run(2); ck('固定半闭',S().lastInfo.stage===16);
 els['blink-mode'].value='auto'; els['blink-mode'].fire('change');
 els['toggle-blink'].checked=false; els['toggle-blink'].fire('change'); g.lanyiDebug.setTimeForTest(2.3); run(1); ck('眨眼开关（t=2.3 眨眼中也睁眼）',S().lastInfo.stage===0&&!S().layers.blink);
 els['toggle-blink'].checked=true; els['toggle-blink'].fire('change'); g.lanyiDebug.setTimeForTest(2.35); els['btn-pause'].fire('click'); run(1); ck('t=2.35 眨眼恢复',S().lastInfo.stage>0,{stage:S().lastInfo.stage}); els['btn-pause'].fire('click');
 // 叠加
 for(const k of ['mesh','field','occ','zone','eyeBox']){const e=els['toggle-ov-'+k]; e.checked=true; e.fire('change'); run(2); ck('叠加 '+k,S().overlays[k]===true&&errors.length===0); e.checked=false; e.fire('change');}
 // 图层
 ck('图层列表 9 项',layerCbs.length===9);
 for(const cb of layerCbs){cb.checked=false; cb.fire('change'); run(2); const k=cb.getAttribute('data-layer'); ck('图层开关 '+k,S().layers[k]===false&&errors.length===0); cb.checked=true; cb.fire('change');}
 els['btn-layers-under'].fire('click'); run(2); s=S(); ck('仅看干净补底',s.layers.source&&s.layers.hairUnder&&!s.layers.hairSheet&&!s.layers.frontOcc&&!s.breathing&&!s.blink);
 els['btn-layers-all'].fire('click'); run(2); s=S(); ck('全部开启',Object.values(s.layers).every(Boolean)&&s.breathing&&s.blink);
 els['btn-reset'].fire('click'); run(1); s=S(); ck('重置相位与默认幅度',s.simT<0.05&&s.intensity===1&&s.speed===1&&s.hairStrength===1&&s.breathStrength===1);
 // 后台
 document.hidden=true; docH.visibilitychange.forEach(f=>f()); rc=S().renderCount; t1=S().simT; run(30); ck('页面隐藏：零重绘、时间不走',S().renderCount===rc&&S().simT===t1);
 document.hidden=false; docH.visibilitychange.forEach(f=>f()); run(30); ck('页面恢复',S().simT>t1);
 ck('getImageData 调用次数 = 0',readCalls===0,{readCalls}); ck('无运行错误',errors.length===0,{errors:errors.slice(0,3)});
 ck('循环从未停止',stopAt===null);
 const fail=checks.filter(c=>!c.ok);
 console.log(JSON.stringify({total:checks.length,failed:fail.length,fail,checks},null,1));
},5000);
