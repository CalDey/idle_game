/*
 * 清冷剑仙 · 动态立绘 v2（Bot 实现，独立原型）
 * - Canvas 2D，普通 script，相对路径，可 file:// 打开
 * - 已实现：800ms 分阶段眨眼（闭合→停留→睁开，间隔带轻微随机）、局部胸肩呼吸（4.6s 周期，幅度与幽冥批准版同比例）
 * - 头发：本版完全静止（用户要求最后再做）
 * - t=0 / 静止帧：只绘制原图，与源图逐像素一致
 * 同一份文件在浏览器中运行，也被 tools/render_video.js（node-canvas，非浏览器）直接 require 用于录制核验视频。
 */
(function (root) {
  'use strict';

  var W = 1008, H = 1792;
  var BREATH_PERIOD = 4.6;           // 秒
  var BLINK_DURATION = 0.8;          // 秒：闭合 0.26 / 停留 0.11 / 睁开 0.43
  var BLINK_STAGES = 32;

  var ASSETS = {
    source: 'assets/source_original.jpg',
    protect: 'assets/layer_static_protect.png',
    swordOcc: 'assets/layer_sword_occluder.png',
    hair2Under: 'assets/hair2_underlay.png',
    hair3Under: 'assets/hair3_underlay.png',
    hair4rcUnder: 'assets/hair4rc_underlay.png',
    protect4: 'assets/layer_static_protect_v4.png',
    hair5Under: 'assets/hair5_underlay.png',
    swordOcc5: 'assets/layer_front_occluder_v52.png'
  };
  var BLINK_PATCH = {                // 由 tools/build_blink_gen.py 生成（生成的闭眼图配准原图后仅取眼裂区域，沿眼睑斜线逐行显现）
    L: { x: 504, y: 158 },
    R: { x: 568, y: 183 }
  };
  var PROTECT_ORIGIN = { x: 380, y: 280 };   // layer_static_protect.png 左上角（tools/build_protect.py）
  (function () {
    for (var s = 0; s <= BLINK_STAGES; s++) {
      var k = (s < 10 ? '0' : '') + s;
      ASSETS['eyeL_' + s] = 'assets/blink/eyeL_stage_' + k + '.png';
      ASSETS['eyeR_' + s] = 'assets/blink/eyeR_stage_' + k + '.png';
    }
  })();

  // ---------------------------------------------------------------- 工具
  function clamp01(u) { return u < 0 ? 0 : (u > 1 ? 1 : u); }
  function smoothstep01(u) { var c = clamp01(u); return c * c * (3 - 2 * c); }

  // 确定性伪随机（mulberry32），使浏览器与离线录制的眨眼时刻一致
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var BLINK_TIMES = (function () {
    var rnd = mulberry32(20261109), out = [], t = 2.2;
    while (t < 7200) {
      out.push(t);
      t += 3.4 + rnd() * 2.4;                    // 3.4~5.8 秒一次
    }
    return out;
  })();

  // ---------------------------------------------------------------- 眨眼
  // closure: 0=睁开, 1=完全闭合。闭合 18/56、停留 8/56、睁开 30/56（与幽冥批准版同比例）
  function blinkCurve(phase, duration) {
    if (phase < 0 || phase >= duration) return 0;
    var closeEnd = duration * 18 / 56, holdEnd = duration * 26 / 56;
    if (phase < closeEnd) return smoothstep01(phase / closeEnd);
    if (phase < holdEnd) return 1;
    return 1 - smoothstep01((phase - holdEnd) / (duration - holdEnd));
  }
  function blinkClosureAt(t) {
    var lo = 0, hi = BLINK_TIMES.length - 1;
    if (t < BLINK_TIMES[0]) return 0;
    while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (BLINK_TIMES[mid] <= t) lo = mid; else hi = mid - 1; }
    return blinkCurve(t - BLINK_TIMES[lo], BLINK_DURATION);
  }

  // ---------------------------------------------------------------- 呼吸
  function breathWave(t) {           // t=0 → 0；平滑吸气-呼气
    var p = (((t / BREATH_PERIOD) % 1) + 1) % 1;
    return Math.pow(Math.max(0, Math.sin(p * Math.PI)), 1.5);
  }

  // 胸口网格：边框及颈部、辫子侧严格锁定 0；内部径向平台 + smoothstep 衰减
  var CHEST = { bbox: [500, 300, 740, 560], cols: 24, rows: 26 };

  // 头发距离保护场（js/breath_guard.js）：离静止头发越近位移越小，36px 内平滑衰减到 0
  var GUARD = null;
  (function () {
    var g = (typeof module !== 'undefined' && module.exports && typeof require === 'function')
      ? (function () { try { return require('./breath_guard.js'); } catch (e) { return null; } })()
      : root.LANYI_BREATH_GUARD;
    if (!g) return;
    var bin = (typeof atob === 'function') ? atob(g.data) : Buffer.from(g.data, 'base64').toString('binary');
    var arr = new Float32Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i) / 255;
    GUARD = { x0: g.x0, y0: g.y0, step: g.step, w: g.w, h: g.h, v: arr };
  })();
  function guardAt(x, y) {
    if (!GUARD) return 1;
    var fx = (x - GUARD.x0) / GUARD.step, fy = (y - GUARD.y0) / GUARD.step;
    var ix = Math.floor(fx), iy = Math.floor(fy);
    if (ix < 0 || iy < 0 || ix >= GUARD.w - 1 || iy >= GUARD.h - 1) return 0;
    var tx = fx - ix, ty = fy - iy, w = GUARD.w, v = GUARD.v;
    var a = v[iy * w + ix], b = v[iy * w + ix + 1], c = v[(iy + 1) * w + ix], d = v[(iy + 1) * w + ix + 1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }
  function chestWeight(x, y) {
    var nx = (x - 612) / 120, ny = (y - 430) / 128;
    var d = Math.sqrt(nx * nx + ny * ny);
    if (d >= 1) return 0;
    var w = 1 - smoothstep01((d - 0.25) / 0.75);
    w *= smoothstep01((x - 504) / 36);           // 左侧辫子保护
    w *= smoothstep01((y - 306) / 46);           // 颈部/项圈保护
    w *= smoothstep01((736 - x) / 30);           // 右侧衣袖保护
    w *= smoothstep01((556 - y) / 40);           // 腰腹过渡
    return w * guardAt(x, y);
  }
  // 呼吸幅度预设（原图 1008×1792 像素）。幽冥批准版 moderate-lower 胸口峰值 9.85px（同尺寸原图），
  // matched = 与幽冥同比例（默认）；stronger = 稍强备选
  var BREATH_PRESETS = {
    matched:  { chest: 9.8,  chestDx: 1.2, shoulder: 4.0 },
    stronger: { chest: 12.5, chestDx: 1.5, shoulder: 5.0 }
  };
  var breathPreset = BREATH_PRESETS.stronger;   // t329u 批准：stronger 为默认
  function chestDisp(x, y, a) {
    var w = chestWeight(x, y);
    return [((x - 612) / 120) * breathPreset.chestDx * w * a, -breathPreset.chest * w * a];
  }
  // 左肩（画面左）：小幅上提
  var SHOULDER = { bbox: [384, 296, 472, 440], cols: 11, rows: 18 };
  function shoulderWeight(x, y) {
    var nx = (x - 426) / 44, ny = (y - 352) / 74;
    var d = Math.sqrt(nx * nx + ny * ny);
    if (d >= 1) return 0;
    var w = 1 - smoothstep01((d - 0.2) / 0.8);
    w *= smoothstep01((468 - x) / 18);           // 辫子保护
    return w * guardAt(x, y);
  }
  function shoulderDisp(x, y, a) {
    var w = shoulderWeight(x, y);
    return [0.3 * w * a, -breathPreset.shoulder * w * a];
  }

  // ---------------------------------------------------------------- 头发（左侧外侧长发）
  // 不做补底：在闭合区域内对原图做连续网格形变（区域边界位移为 0），所以不会留下残影，
  // 发丝边缘就是原图像素；剑（含握剑的手）用原图静态遮挡层压在最上面；身体/衣袖/裙纱一侧锁定为 0。
  var HAIR = { bbox: [40, 250, 440, 1100], cols: 34, rows: 71 };   // 约 12px 网格
  var HAIR_AMP = 16;          // 发梢最大位移（原图像素）
  var HAIR_PERIOD = 5.2;      // 秒
  var HAIR_LAG = 0.8;         // 根部到发梢的相位滞后（秒）
  var SWORD_OCC_ORIGIN = { x: 153, y: 430 };
  function loadField(nodePath, globalName) {
    var g = (typeof module !== 'undefined' && module.exports && typeof require === 'function')
      ? (function () { try { return require(nodePath); } catch (e) { return null; } })()
      : root[globalName];
    if (!g) return null;
    var bin = (typeof atob === 'function') ? atob(g.data) : Buffer.from(g.data, 'base64').toString('binary');
    var arr = new Float32Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i) / 255;
    return { x0: g.x0, y0: g.y0, step: g.step, w: g.w, h: g.h, v: arr };
  }
  function sampleField(F, x, y) {
    if (!F) return 0;
    var fx = (x - F.x0) / F.step, fy = (y - F.y0) / F.step;
    var ix = Math.floor(fx), iy = Math.floor(fy);
    if (ix < 0 || iy < 0 || ix >= F.w - 1 || iy >= F.h - 1) return 0;
    var tx = fx - ix, ty = fy - iy, w = F.w, v = F.v;
    return (v[iy * w + ix] * (1 - tx) + v[iy * w + ix + 1] * tx) * (1 - ty) + (v[(iy + 1) * w + ix] * (1 - tx) + v[(iy + 1) * w + ix + 1] * tx) * ty;
  }
  var HAIR_FIELD = loadField('./hair_field.js', 'LANYI_HAIR_FIELD');
  var hairT = 0;
  function hairWind(t, u) {               // t=0 时全部为 0；沿发长相位滞后
    var tt = t - HAIR_LAG * u;
    if (tt <= 0) return 0;
    return 0.5 - 0.5 * Math.cos(2 * Math.PI * tt / HAIR_PERIOD);
  }
  function hairDisp(x, y, a) {
    var w = sampleField(HAIR_FIELD, x, y);
    if (w <= 1e-4) return [0, 0];
    var u = clamp01((y - 330) / 670);
    var g = Math.pow(smoothstep01(u), 1.2);            // 根部固定，越往发梢越大
    var d = HAIR_AMP * a * w * g * hairWind(hairT, u);
    // 发梢再叠一点更慢的次级摆动，形成连续弯曲而不是整块平移
    var sec = 0.18 * smoothstep01((u - 0.45) / 0.55) * Math.sin(2 * Math.PI * Math.max(0, hairT - 1.3 * u) / 3.1);
    d *= (1 + sec);
    return [-d, 0];   // 只做水平摆动：背景里的水平线（台阶栏杆）保持水平，不会被带歪
  }

  // ---------------------------------------------------------------- 头发 v2（默认）：独立发束 + AI 补底
  // 底层：AI 绘制的干净补底（只在红+蓝区内，3px 内羽化），静态。
  // 发束层：原图像素 + 反解 matte（静止时 发束∘补底 == 原图），逐像素水平反向映射；行内线性采样，不做模糊。
  // 根部固定、越往发梢越大；发束按深度分相位（外层与内层有相位差）→ 看起来是几束头发各自摆动。
  // 只向外摆（相对静止姿态向外 0..AMP），因此露出的只会是发束内侧的“深色内层头发”补底。
  var HAIR2_AMP = 17, HAIR2_PERIOD = 5.2, HAIR2_LAG = 0.8, HAIR2_LOCK_LAG = 1.1;
  var UNDER_ORIGIN = { x: 4, y: 206 };
  var HAIR2 = null, LOCKS = null;
  (function () {
    var isNode = (typeof module !== 'undefined' && module.exports && typeof require === 'function');
    var f = isNode ? (function () { try { return require('./hair2_field.js'); } catch (e) { return null; } })() : root.LANYI_HAIR2_FIELD;
    var l = isNode ? (function () { try { return require('./hair2_locks.js'); } catch (e) { return null; } })() : root.LANYI_HAIR2_LOCKS;
    function dec(b64) { var bin = (typeof atob === 'function') ? atob(b64) : Buffer.from(b64, 'base64').toString('binary'); var a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
    if (f) {
      var A = dec(f.amp), P = dec(f.phase), av = new Float32Array(A.length), pv = new Float32Array(P.length);
      for (var i = 0; i < A.length; i++) { av[i] = A[i] / 255; pv[i] = P[i] / 255; }
      HAIR2 = { amp: { x0: f.x0, y0: f.y0, step: f.step, w: f.w, h: f.h, v: av }, phase: { x0: f.x0, y0: f.y0, step: f.step, w: f.w, h: f.h, v: pv } };
    }
    if (l) {
      var d = dec(l.data), n = l.w * l.h, pm = new Float32Array(n * 4);
      for (var k = 0; k < n; k++) { var a = d[k * 4 + 3] / 255; pm[k * 4] = d[k * 4] * a; pm[k * 4 + 1] = d[k * 4 + 1] * a; pm[k * 4 + 2] = d[k * 4 + 2] * a; pm[k * 4 + 3] = a; }
      LOCKS = { x0: l.x0, y0: l.y0, w: l.w, h: l.h, pm: pm };
    }
  })();
  function hair2Disp(x, y, t) {          // 返回水平位移（负 = 向外/向左）
    var w = sampleField(HAIR2.amp, x, y);
    if (w <= 1e-4) return 0;
    var ph = sampleField(HAIR2.phase, x, y);
    var u = clamp01((y - 300) / 700);
    var g = Math.pow(smoothstep01(u), 1.15);
    var tt = t - HAIR2_LAG * u - HAIR2_LOCK_LAG * ph;
    var wave = tt <= 0 ? 0 : 0.5 - 0.5 * Math.cos(2 * Math.PI * tt / HAIR2_PERIOD);
    var lockGain = 0.82 + 0.18 * Math.sin(2 * Math.PI * (ph * 1.6 + 0.15));      // 各束幅度略不同
    var sec = 0.16 * smoothstep01((u - 0.45) / 0.55) * Math.sin(2 * Math.PI * Math.max(0, tt - 0.6 * u) / 3.1);
    return -HAIR2_AMP * w * g * lockGain * wave * (1 + sec);
  }
  var hair2Grid = null;
  function drawHair2(ctx, images, t, a) {
    if (images.hair2Under) ctx.drawImage(images.hair2Under, UNDER_ORIGIN.x, UNDER_ORIGIN.y);
    if (!LOCKS || !HAIR2) return;
    var M = 26;                                   // 最大外摆余量
    var X0 = Math.max(0, LOCKS.x0 - M), Y0 = LOCKS.y0, X1 = Math.min(W, LOCKS.x0 + LOCKS.w + 2), Y1 = LOCKS.y0 + LOCKS.h;
    var RW = X1 - X0, RH = Y1 - Y0;
    // 位移在 4px 网格上计算再双线性插值
    var S = 4, gw = Math.ceil(RW / S) + 2, gh = Math.ceil(RH / S) + 2;
    if (!hair2Grid || hair2Grid.length !== gw * gh) hair2Grid = new Float32Array(gw * gh);
    var G = hair2Grid, gx, gy;
    for (gy = 0; gy < gh; gy++) for (gx = 0; gx < gw; gx++) G[gy * gw + gx] = a * hair2Disp(X0 + gx * S, Y0 + gy * S, t);
    function D(x, y) {
      var fx = (x - X0) / S, fy = (y - Y0) / S, ix = Math.floor(fx), iy = Math.floor(fy);
      if (ix < 0) { ix = 0; fx = 0; } if (ix > gw - 2) { ix = gw - 2; fx = gw - 1; }
      var tx = fx - ix, ty = fy - iy, o = iy * gw + ix;
      return (G[o] * (1 - tx) + G[o + 1] * tx) * (1 - ty) + (G[o + gw] * (1 - tx) + G[o + gw + 1] * tx) * ty;
    }
    var LY = getLayer('h2', ctx, RW, RH); layerBegin(LY);
    var px = LY.acc, pm = LOCKS.pm, lw = LOCKS.w;
    for (var y = 0; y < RH; y++) {
      var Yabs = Y0 + y, ly = Yabs - LOCKS.y0, rowBase = ly * lw;
      for (var x = 0; x < RW; x++) {
        var Xabs = X0 + x + 0.0, xs = Xabs;
        for (var it = 0; it < 3; it++) xs = Xabs - D(xs, Yabs);    // 反向映射：xs + D(xs) = X
        var lx = xs - LOCKS.x0, i0 = Math.floor(lx), fr = lx - i0;
        if (i0 < -1 || i0 >= lw) continue;
        var w0 = (i0 >= 0) ? 1 - fr : 0, w1 = (i0 + 1 < lw) ? fr : 0;
        var k0 = (rowBase + i0) * 4, k1 = k0 + 4;
        var al = (w0 ? pm[k0 + 3] * w0 : 0) + (w1 ? pm[k1 + 3] * w1 : 0);
        if (al <= 0) continue;
        var r = (w0 ? pm[k0] * w0 : 0) + (w1 ? pm[k1] * w1 : 0);
        var gg = (w0 ? pm[k0 + 1] * w0 : 0) + (w1 ? pm[k1 + 1] * w1 : 0);
        var b = (w0 ? pm[k0 + 2] * w0 : 0) + (w1 ? pm[k1 + 2] * w1 : 0);
        var q = (y * RW + x) * 4, ia = 1 - al;
        px[q] = r + px[q] * ia; px[q + 1] = gg + px[q + 1] * ia; px[q + 2] = b + px[q + 2] * ia; px[q + 3] = al + px[q + 3] * ia;
      }
    }
    LY.dx0 = 0; LY.dy0 = 0; LY.dx1 = RW - 1; LY.dy1 = RH - 1;
    layerEnd(ctx, LY, X0, Y0);
  }


  // ---------------------------------------------------------------- 发束合成层（fix2）
  // 不再对主画布 getImageData/putImageData：双击 file:// 打开时，本地图片会让画布被视为“跨源污染”，
  // 读取像素会抛 SecurityError，整页停在第一帧。现在发束在自有缓冲区里按原来的顺序叠加（预乘 over），
  // 每帧一次 putImageData 到离屏小画布，再 drawImage 到主画布（source-over，数学上与逐束叠加等价）。
  var LAYERS = {};
  function getLayer(key, ctx, RW, RH) {
    var L = LAYERS[key];
    if (L && L.w === RW && L.h === RH) return L;
    var c;
    if (typeof document !== 'undefined' && document.createElement) { c = document.createElement('canvas'); c.width = RW; c.height = RH; }
    else c = new ctx.canvas.constructor(RW, RH);
    var g = c.getContext('2d');
    L = { w: RW, h: RH, c: c, g: g, img: g.createImageData(RW, RH), acc: new Float32Array(RW * RH * 4), dx0: 0, dy0: 0, dx1: -1, dy1: -1 };
    LAYERS[key] = L;
    return L;
  }
  function layerBegin(L) {                       // 清掉上一帧写过的矩形
    var acc = L.acc, d = L.img.data, w = L.w;
    for (var y = L.dy0; y <= L.dy1; y++) { var a = (y * w + L.dx0) * 4, b = (y * w + L.dx1 + 1) * 4; acc.fill(0, a, b); d.fill(0, a, b); }
    L.dx0 = 1e9; L.dy0 = 1e9; L.dx1 = -1; L.dy1 = -1;
  }
  function layerEnd(ctx, L, X0, Y0) {           // 预乘 → 直通 alpha，画到主画布
    if (L.dx1 < L.dx0) return;
    var acc = L.acc, d = L.img.data, w = L.w;
    for (var y = L.dy0; y <= L.dy1; y++) {
      for (var x = L.dx0, q = (y * w + x) * 4; x <= L.dx1; x++, q += 4) {
        var al = acc[q + 3]; if (al <= 0) continue;
        var ia = 1 / al; d[q] = acc[q] * ia; d[q + 1] = acc[q + 1] * ia; d[q + 2] = acc[q + 2] * ia; d[q + 3] = al * 255;
      }
    }
    L.g.putImageData(L.img, 0, 0, L.dx0, L.dy0, L.dx1 - L.dx0 + 1, L.dy1 - L.dy0 + 1);
    ctx.drawImage(L.c, L.dx0, L.dy0, L.dx1 - L.dx0 + 1, L.dy1 - L.dy0 + 1, X0 + L.dx0, Y0 + L.dy0, L.dx1 - L.dx0 + 1, L.dy1 - L.dy0 + 1);
  }
  function rowSpans(pm, ids, w, h, k) {         // 每行该发束 alpha>0 像素的 [min,max]（局部 x），无则 min>max
    var sp = new Int32Array(h * 2);
    for (var y = 0; y < h; y++) {
      var mn = 1e9, mx = -1;
      for (var x = 0; x < w; x++) { var p = y * w + x; if (ids[p] === k && pm[p * 4 + 3] > 0) { if (x < mn) mn = x; mx = x; } }
      sp[y * 2] = mn; sp[y * 2 + 1] = mx;
    }
    return sp;
  }

  // ---------------------------------------------------------------- 头发 v3（默认）：4 束真正切开的外侧发束
  // 沿发丝走向、在较暗的分缝处把外侧带切成 4 束（0 = 最外侧，含飘出的细发丝；3 = 最内侧，内缘位移降到 0）。
  // 每束是独立图层（原图像素 + 反解 alpha，像素归属唯一），各自弯曲：根部固定、发梢最大，
  // 有自己的相位与周期（70% 共用风 + 30% 自身摆动），所以束与束之间会打开小缝，缝里是深色内层头发补底。
  // 绘制顺序：内 → 外（外侧发束压在上面）。
  var HAIR3_AMP = 17, HAIR3_LAG = 0.8;
  var HAIR3_LOCKS = [            // base 幅度, 相位(秒), 自身周期(秒)
    { base: 1.00, ph: 0.00, T: 5.2 },
    { base: 0.84, ph: 0.45, T: 4.6 },
    { base: 0.72, ph: 0.90, T: 5.9 },
    { base: 0.62, ph: 0.60, T: 5.0 }
  ];
  var HAIR3 = null, LOCKS3 = null;
  (function () {
    var isNode = (typeof module !== 'undefined' && module.exports && typeof require === 'function');
    var f = isNode ? (function () { try { return require('./hair3_field.js'); } catch (e) { return null; } })() : root.LANYI_HAIR3_FIELD;
    var l = isNode ? (function () { try { return require('./hair3_locks.js'); } catch (e) { return null; } })() : root.LANYI_HAIR3_LOCKS;
    function dec(b64) { var bin = (typeof atob === 'function') ? atob(b64) : Buffer.from(b64, 'base64').toString('binary'); var a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
    if (f) { var A = dec(f.amp), av = new Float32Array(A.length); for (var i = 0; i < A.length; i++) av[i] = A[i] / 255; HAIR3 = { x0: f.x0, y0: f.y0, step: f.step, w: f.w, h: f.h, v: av }; }
    if (l) {
      var d = dec(l.data), id = dec(l.lock), n = l.w * l.h, pm = new Float32Array(n * 4), bb = [];
      for (var k = 0; k < l.nLocks; k++) bb.push([1e9, 1e9, -1, -1]);
      for (var p = 0; p < n; p++) {
        var a = d[p * 4 + 3] / 255; pm[p * 4] = d[p * 4] * a; pm[p * 4 + 1] = d[p * 4 + 1] * a; pm[p * 4 + 2] = d[p * 4 + 2] * a; pm[p * 4 + 3] = a;
        if (a > 0) { var b = bb[id[p]], x = p % l.w, y = (p / l.w) | 0; if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; }
      }
      LOCKS3 = { x0: l.x0, y0: l.y0, w: l.w, h: l.h, pm: pm, id: id, bbox: bb, n: l.nLocks, spans: [] };
      for (var kk = 0; kk < l.nLocks; kk++) LOCKS3.spans.push(rowSpans(pm, id, l.w, l.h, kk));
    }
  })();
  function hair3Wave(t, u, L) {
    function w(tt, T) { return tt <= 0 ? 0 : 0.5 - 0.5 * Math.cos(2 * Math.PI * tt / T); }
    var tt = t - HAIR3_LAG * u - L.ph;
    var main = w(tt, 5.2), own = w(tt, L.T);
    var sec = 0.16 * smoothstep01((u - 0.45) / 0.55) * Math.sin(2 * Math.PI * Math.max(0, tt - 0.6 * u) / 3.1);
    return (0.7 * main + 0.3 * own) * (1 + sec);
  }
  function hair3Disp(x, y, t, k) {
    var w = sampleField(HAIR3, x, y);
    if (w <= 1e-4) return 0;
    var u = clamp01((y - 300) / 700);
    var g = Math.pow(smoothstep01(u), 1.15);
    var L = HAIR3_LOCKS[k];
    return -HAIR3_AMP * L.base * w * g * hair3Wave(t, u, L);
  }
  var hair3Grid = null, hair3RowMin = null, hair3RowMax = null;
  function drawHair3(ctx, images, t, a) {
    if (images.hair3Under) ctx.drawImage(images.hair3Under, UNDER_ORIGIN.x, UNDER_ORIGIN.y);
    if (!LOCKS3 || !HAIR3) return;
    var M = 26, Lk = LOCKS3, S = 4;
    var X0 = Math.max(0, Lk.x0 - M), Y0 = Lk.y0, X1 = Math.min(W, Lk.x0 + Lk.w + 2), Y1 = Lk.y0 + Lk.h;
    var RW = X1 - X0, RH = Y1 - Y0;
    var LY = getLayer('h3', ctx, RW, RH); layerBegin(LY);
    var px = LY.acc, pm = Lk.pm, ids = Lk.id, lw = Lk.w;
    var gw = Math.ceil(RW / S) + 2, gh = Math.ceil(RH / S) + 2;
    if (!hair3Grid || hair3Grid.length !== gw * gh) { hair3Grid = new Float32Array(gw * gh); hair3RowMin = new Float32Array(gh); hair3RowMax = new Float32Array(gh); }
    var G = hair3Grid, RMIN = hair3RowMin, RMAX = hair3RowMax;
    var dx0 = 1e9, dx1 = -1, dy0 = 1e9, dy1 = -1;
    for (var k = Lk.n - 1; k >= 0; k--) {          // 内 → 外
      var bb = Lk.bbox[k]; if (bb[2] < 0) continue;
      var sp = Lk.spans[k];
      var gyA = Math.max(0, Math.floor(bb[1] / S)), gyB = Math.min(gh - 1, Math.floor(bb[3] / S) + 1);   // 本束各行实际会读到的网格行
      for (var gy = gyA; gy <= gyB; gy++) {
        var mn = Infinity, mx = -Infinity;
        for (var gx = 0; gx < gw; gx++) { var gv = a * hair3Disp(X0 + gx * S, Y0 + gy * S, t, k); G[gy * gw + gx] = gv; if (gv < mn) mn = gv; if (gv > mx) mx = gv; }
        RMIN[gy] = mn; RMAX[gy] = mx;
      }
      var yA = bb[1], yB = bb[3], xA = Math.max(0, Lk.x0 + bb[0] - M - X0), xB = Math.min(RW - 1, Lk.x0 + bb[2] + 2 - X0);
      for (var ly = yA; ly <= yB; ly++) {
        var smin = sp[ly * 2], smax = sp[ly * 2 + 1]; if (smax < smin) continue;
        var Yabs = Lk.y0 + ly, y = Yabs - Y0, rowBase = ly * lw;
        // 本行位移范围（双线性插值不超出相邻两行网格值的范围）→ 只扫描可能落到该束像素的列
        var iyr = Math.floor((Yabs - Y0) / S), dmn = Math.min(RMIN[iyr], RMIN[iyr + 1]), dmx = Math.max(RMAX[iyr], RMAX[iyr + 1]);
        var xa = Math.max(xA, Math.floor(Lk.x0 + smin - 1 + dmn) - 2 - X0), xb = Math.min(xB, Math.ceil(Lk.x0 + smax + 1 + dmx) + 2 - X0);
        for (var x = xa; x <= xb; x++) {
          var Xabs = X0 + x, xs = Xabs;
          for (var it = 0; it < 3; it++) {
            var fx = (xs - X0) / S, fy = (Yabs - Y0) / S, ix = Math.floor(fx), iy = Math.floor(fy);
            if (ix < 0) { ix = 0; fx = 0; } if (ix > gw - 2) { ix = gw - 2; fx = gw - 1; }
            var tx = fx - ix, ty = fy - iy, o = iy * gw + ix;
            xs = Xabs - ((G[o] * (1 - tx) + G[o + 1] * tx) * (1 - ty) + (G[o + gw] * (1 - tx) + G[o + gw + 1] * tx) * ty);
          }
          var lx = xs - Lk.x0, i0 = Math.floor(lx), fr = lx - i0;
          if (i0 < -1 || i0 >= lw) continue;
          var p0 = rowBase + i0, p1 = p0 + 1;
          var w0 = (i0 >= 0 && ids[p0] === k) ? 1 - fr : 0, w1 = (i0 + 1 < lw && ids[p1] === k) ? fr : 0;
          if (!w0 && !w1) continue;
          var k0 = p0 * 4, k1 = p1 * 4;
          var al = (w0 ? pm[k0 + 3] * w0 : 0) + (w1 ? pm[k1 + 3] * w1 : 0);
          if (al <= 0) continue;
          var r = (w0 ? pm[k0] * w0 : 0) + (w1 ? pm[k1] * w1 : 0);
          var gg = (w0 ? pm[k0 + 1] * w0 : 0) + (w1 ? pm[k1 + 1] * w1 : 0);
          var b = (w0 ? pm[k0 + 2] * w0 : 0) + (w1 ? pm[k1 + 2] * w1 : 0);
          var q = (y * RW + x) * 4, ia = 1 - al;
          px[q] = r + px[q] * ia; px[q + 1] = gg + px[q + 1] * ia; px[q + 2] = b + px[q + 2] * ia; px[q + 3] = al + px[q + 3] * ia;
          if (x < dx0) dx0 = x; if (x > dx1) dx1 = x; if (y < dy0) dy0 = y; if (y > dy1) dy1 = y;
        }
      }
    }
    LY.dx0 = dx0; LY.dx1 = dx1; LY.dy0 = dy0; LY.dy1 = dy1;
    layerEnd(ctx, LY, X0, Y0);
  }


  // ---------------------------------------------------------------- 头发 v4（默认）：v3 左侧 + 右侧发缘 3 束 + 胸前辫子
  // 右侧：外缘 3 束（0 最外 / 2 最内且内缘位移为 0），向外（画面右）摆，与左侧共用 5.2s 风、滞后 0.5s，幅度较小（≤8px）；
  //       搭在胸口上的发尾摆动减弱，并叠加该处已批准呼吸的位移（chestDisp/shoulderDisp，原样调用不改）。
  // 辫子：根部（y≈318）固定的轻摆（±2.4px）+ 随呼吸轻微前送/上提；底下是 AI 补的皮肤。
  // 呼吸：网格纹理改用“原图+补底”（只在补底区内与原图不同），保护层用去掉了这些会动头发的 v4 版。
  var TEX_ORIGIN = { x: 0, y: 0 };
  var BREATH_TEX4_ORIGIN = { x: 0, y: 0 };   // 全尺寸离屏纹理，与原图同坐标（避免子像素取样差异）
  var RC_UNDER_ORIGIN = { x: 440, y: 40 };
  var RC_LOCKS = [ { base: 1.00, ph: 0.00, T: 5.2 }, { base: 0.85, ph: 0.35, T: 4.8 }, { base: 0.70, ph: 0.70, T: 5.6 } ];
  var RC_AMP = 8, BRAID_AMP = 2.4;
  var RC = null;
  (function () {
    var isNode = (typeof module !== 'undefined' && module.exports && typeof require === 'function');
    var l = isNode ? (function () { try { return require('./hair4rc_locks.js'); } catch (e) { return null; } })() : root.LANYI_HAIR4RC_LOCKS;
    if (!l) return;
    function dec(b64) { var bin = (typeof atob === 'function') ? atob(b64) : Buffer.from(b64, 'base64').toString('binary'); var a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
    var d = dec(l.data), id = dec(l.lock), n = l.w * l.h, pm = new Float32Array(n * 4), bb = [];
    for (var k = 0; k < l.nLocks; k++) bb.push([1e9, 1e9, -1, -1]);
    for (var p = 0; p < n; p++) {
      var a = d[p * 4 + 3] / 255; pm[p * 4] = d[p * 4] * a; pm[p * 4 + 1] = d[p * 4 + 1] * a; pm[p * 4 + 2] = d[p * 4 + 2] * a; pm[p * 4 + 3] = a;
      if (a > 0) { var b = bb[id[p]], x = p % l.w, y = (p / l.w) | 0; if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; }
    }
    var A = dec(l.ampR.data), av = new Float32Array(A.length); for (var i = 0; i < A.length; i++) av[i] = A[i] / 255;
    RC = { x0: l.x0, y0: l.y0, w: l.w, h: l.h, pm: pm, id: id, bbox: bb, n: l.nLocks,
           ampR: { x0: l.ampR.x0, y0: l.ampR.y0, step: l.ampR.step, w: l.ampR.w, h: l.ampR.h, v: av } };
    RC.spans = []; for (var kq = 0; kq < l.nLocks; kq++) RC.spans.push(rowSpans(pm, id, l.w, l.h, kq));
  })();
  function rcWave(tt, T) { return tt <= 0 ? 0 : 0.5 - 0.5 * Math.cos(2 * Math.PI * tt / T); }
  function breathRide(x, y, ba) {            // 已批准呼吸在该点的位移（只读调用）
    if (ba <= 0) return [0, 0];
    var c = chestDisp(x, y, ba), s = shoulderDisp(x, y, ba);
    return [c[0] + s[0], c[1] + s[1]];
  }
  function rcDisp(x, y, t, k, ba, ride) {    // 返回 [dx, dy]；ride 可传入已算好的 breathRide(x, y, ba)
    var r = ride || breathRide(x, y, ba);
    if (k === 3) {                           // 辫子
      var gb = Math.pow(smoothstep01((y - 318) / 170), 1.3);
      var tt = t - 0.9 - 0.4 * clamp01((y - 318) / 170);
      var sway = tt <= 0 ? 0 : Math.sin(2 * Math.PI * tt / 5.2) * smoothstep01(tt / 1.5);
      return [r[0] + gb * (BRAID_AMP * sway + 0.8 * ba), r[1] - 0.9 * gb * ba];
    }
    var w = sampleField(RC.ampR, x, y);
    var g = Math.pow(smoothstep01((y - 130) / 170), 1.1) * (1 - 0.55 * smoothstep01((y - 320) / 60));
    var L = RC_LOCKS[k], u = clamp01((y - 120) / 280);
    var tt2 = t - 0.5 - 0.6 * u - L.ph;
    var wv = 0.7 * rcWave(tt2, 5.2) + 0.3 * rcWave(tt2, L.T);
    return [r[0] + RC_AMP * L.base * w * g * wv, r[1]];
  }
  // 呼吸网格纹理（v4）：运行时把原图 + 右侧/辫子补底画进一张离屏画布（呼吸两块网格的范围），
  // 与主画布同样的解码与合成，所以补底区以外与原图逐像素一致，已批准的呼吸输出不变。
  var BREATH_TEX4 = null;
  function breathTex4(ctx, images) {
    if (BREATH_TEX4) return BREATH_TEX4;
    if (!images.hair4rcUnder) return null;
    var w = W, h = H, c;
    if (typeof document !== 'undefined' && document.createElement) { c = document.createElement('canvas'); c.width = w; c.height = h; }
    else { c = new ctx.canvas.constructor(w, h); }
    var g = c.getContext('2d');
    g.drawImage(images.source, -BREATH_TEX4_ORIGIN.x, -BREATH_TEX4_ORIGIN.y);
    g.drawImage(images.hair4rcUnder, RC_UNDER_ORIGIN.x - BREATH_TEX4_ORIGIN.x, RC_UNDER_ORIGIN.y - BREATH_TEX4_ORIGIN.y);
    BREATH_TEX4 = c;
    return c;
  }
  var rcGrid = null, rcRide = null;
  function drawHair4RC(ctx, t, a, ba) {
    if (!RC) return;
    var M = 12, S = 4, Lk = RC, pm = Lk.pm, ids = Lk.id, lw = Lk.w;
    var X0 = Math.max(0, Lk.x0 - M), Y0 = Math.max(0, Lk.y0 - M), X1 = Math.min(W, Lk.x0 + Lk.w + M), Y1 = Math.min(H, Lk.y0 + Lk.h + M);
    var RW = X1 - X0, RH = Y1 - Y0;
    var LY = getLayer('rc', ctx, RW, RH); layerBegin(LY);
    var px = LY.acc;
    var gw = Math.ceil(RW / S) + 2, gh = Math.ceil(RH / S) + 2;
    if (!rcGrid || rcGrid.length !== gw * gh * 2) rcGrid = new Float32Array(gw * gh * 2);
    var G = rcGrid;
    // 呼吸跟随位移与发束无关：每帧只算一次（与逐束重复计算结果完全相同）
    if (!rcRide || rcRide.length !== gw * gh * 2) rcRide = new Float64Array(gw * gh * 2);
    var RIDE = rcRide;
    for (var ry = 0; ry < gh; ry++) for (var rx = 0; rx < gw; rx++) { var rv = breathRide(X0 + rx * S, Y0 + ry * S, ba), ri = (ry * gw + rx) * 2; RIDE[ri] = rv[0]; RIDE[ri + 1] = rv[1]; }
    var dx0 = 1e9, dx1 = -1, dy0 = 1e9, dy1 = -1;
    var ORDER = [2, 1, 0, 3];                       // 右侧内 → 外，最后辫子
    for (var oi = 0; oi < ORDER.length; oi++) {
      var kk = ORDER[oi], bb = Lk.bbox[kk], sp = Lk.spans[kk];
      if (bb[2] >= 0) {
        var gxmn = Infinity, gxmx = -Infinity, gymn = Infinity, gymx = -Infinity;
        for (var gy = 0; gy < gh; gy++) for (var gx = 0; gx < gw; gx++) {
          var gxp = X0 + gx * S, gyp = Y0 + gy * S, o2i = (gy * gw + gx) * 2;
          var rr = [RIDE[o2i], RIDE[o2i + 1]], dd = rcDisp(gxp, gyp, t, kk, ba, rr);
          var vx = rr[0] + a * (dd[0] - rr[0]), vy = rr[1] + a * (dd[1] - rr[1]);   // 头发强度只缩放摆动，呼吸跟随不变
          G[o2i] = vx; G[o2i + 1] = vy;
          var fvx = G[o2i], fvy = G[o2i + 1];
          if (fvx < gxmn) gxmn = fvx; if (fvx > gxmx) gxmx = fvx; if (fvy < gymn) gymn = fvy; if (fvy > gymx) gymx = fvy;
        }
        var xA = Math.max(0, Lk.x0 + bb[0] - M - X0), xB = Math.min(RW - 1, Lk.x0 + bb[2] + M - X0);
        var yA = Math.max(0, Lk.y0 + bb[1] - M - Y0), yB = Math.min(RH - 1, Lk.y0 + bb[3] + M - Y0);
        for (var y = yA; y <= yB; y++) {
          var Yabs = Y0 + y;
          // 源行范围 ly ∈ [Yabs - gymx, Yabs - gymn] - y0，双线性取 j0、j0+1 两行 → 合并这些行的跨度
          var jlo = Math.max(0, Math.floor(Yabs - gymx - Lk.y0) - 2), jhi = Math.min(Lk.h - 1, Math.ceil(Yabs - gymn - Lk.y0) + 2);
          var umin = 1e9, umax = -1;
          for (var j = jlo; j <= jhi; j++) { var a0 = sp[j * 2], a1 = sp[j * 2 + 1]; if (a1 >= a0) { if (a0 < umin) umin = a0; if (a1 > umax) umax = a1; } }
          if (umax < umin) continue;
          var xa = Math.max(xA, Math.floor(Lk.x0 + umin - 1 + gxmn) - 2 - X0), xb = Math.min(xB, Math.ceil(Lk.x0 + umax + 1 + gxmx) + 2 - X0);
          for (var x = xa; x <= xb; x++) {
            var Xabs = X0 + x, xs = Xabs, ys = Yabs;
            for (var it = 0; it < 3; it++) {
              var fx = (xs - X0) / S, fy = (ys - Y0) / S, ix = Math.floor(fx), iy = Math.floor(fy);
              if (ix < 0) { ix = 0; fx = 0; } if (ix > gw - 2) { ix = gw - 2; fx = gw - 1; }
              if (iy < 0) { iy = 0; fy = 0; } if (iy > gh - 2) { iy = gh - 2; fy = gh - 1; }
              var tx = fx - ix, ty = fy - iy, o = (iy * gw + ix) * 2, o2 = o + gw * 2;
              var ddx = (G[o] * (1 - tx) + G[o + 2] * tx) * (1 - ty) + (G[o2] * (1 - tx) + G[o2 + 2] * tx) * ty;
              var ddy = (G[o + 1] * (1 - tx) + G[o + 3] * tx) * (1 - ty) + (G[o2 + 1] * (1 - tx) + G[o2 + 3] * tx) * ty;
              xs = Xabs - ddx; ys = Yabs - ddy;
            }
            var lx = xs - Lk.x0, ly = ys - Lk.y0, i0 = Math.floor(lx), j0 = Math.floor(ly), fx2 = lx - i0, fy2 = ly - j0;
            if (i0 < -1 || j0 < -1 || i0 >= lw || j0 >= Lk.h) continue;
            var al = 0, r = 0, g2 = 0, b2 = 0;
            for (var c = 0; c < 4; c++) {
              var ii = i0 + (c & 1), jj = j0 + (c >> 1);
              if (ii < 0 || jj < 0 || ii >= lw || jj >= Lk.h) continue;
              var p = jj * lw + ii; if (ids[p] !== kk) continue;
              var wgt = ((c & 1) ? fx2 : 1 - fx2) * ((c >> 1) ? fy2 : 1 - fy2); if (wgt <= 0) continue;
              var q4 = p * 4; al += pm[q4 + 3] * wgt; r += pm[q4] * wgt; g2 += pm[q4 + 1] * wgt; b2 += pm[q4 + 2] * wgt;
            }
            if (al <= 0) continue;
            var q = (y * RW + x) * 4, ia = 1 - al;
            px[q] = r + px[q] * ia; px[q + 1] = g2 + px[q + 1] * ia; px[q + 2] = b2 + px[q + 2] * ia; px[q + 3] = al + px[q + 3] * ia;
            if (x < dx0) dx0 = x; if (x > dx1) dx1 = x; if (y < dy0) dy0 = y; if (y > dy1) dy1 = y;
          }
        }
      }
    }
    LY.dx0 = dx0; LY.dx1 = dx1; LY.dy0 = dy0; LY.dy1 = dy1;
    layerEnd(ctx, LY, X0, Y0);
  }



  // ---------------------------------------------------------------- 头发 v5（默认）：剑左侧整片长发随风
  // 整片（头侧到画面底部的长发 + 下方蓝纱拖尾）是一张图层：原图像素 + 反解 alpha，底下是 AI 补的干净背景（塔/树/栏杆/台阶/石板）。
  // 位移场：头顶、手臂、剑（含剑右侧）处钉住为 0，离钉住处越远、越往下越大；底部外缘约 27–45px 水平外飘 + 少量上扬，
  // 主波 5.0s 沿发长向下传播，叠加 2.3s 次级波与 13.7s/7.9s 阵风强弱。逐像素反向采样到自有缓冲区，不读画布像素。
  var H5_AMP = 45, H5_LIFT = 7, H5_GRID = 8;
  var HAIR5 = null;
  (function () {
    var isNode = (typeof module !== 'undefined' && module.exports && typeof require === 'function');
    var l = isNode ? (function () { try { return require('./hair5_sheet.js'); } catch (e) { return null; } })() : root.LANYI_HAIR5;
    if (!l) return;
    function dec(b64) { var bin = (typeof atob === 'function') ? atob(b64) : Buffer.from(b64, 'base64').toString('binary'); var a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
    var sp8 = dec(l.spans), sp = new Int16Array(sp8.buffer), d = dec(l.data), w = l.w, h = l.h;
    var pm = new Float32Array(w * h * 4), q = 0;
    for (var y = 0; y < h; y++) {
      var a0 = sp[y * 2], a1 = sp[y * 2 + 1];
      for (var x = a0; x <= a1; x++, q += 4) {
        var o = (y * w + x) * 4, al = d[q + 3] / 255;
        pm[o] = d[q] * al; pm[o + 1] = d[q + 1] * al; pm[o + 2] = d[q + 2] * al; pm[o + 3] = al;
      }
    }
    var P = l.pin, pw = dec(P.data), rs = dec(P.res);
    // 每个网格点的静态权重：钉住距离权重 ×（残留纱区减弱）× 沿发长幅度
    var S = P.step, gw = P.w, gh = P.h, amp = new Float32Array(gw * gh), lift = new Float32Array(gw * gh), uu = new Float32Array(gw * gh);
    for (var j = 0; j < gh; j++) for (var i = 0; i < gw; i++) {
      var k = j * gw + i, Y = j * S, u = clamp01((Y - 200) / 1590);
      var top = smoothstep01((Y - 170) / 260);
      var wpt = (pw[k] / 255) * (1 - 0.6 * rs[k] / 255);
      amp[k] = H5_AMP * (0.35 + 0.65 * Math.pow(u, 1.1)) * top * wpt;
      lift[k] = H5_LIFT * u * u * wpt;
      uu[k] = u;
    }
    HAIR5 = { x0: l.x0, y0: l.y0, w: w, h: h, spans: sp, pm: pm, S: S, gw: gw, gh: gh, amp: amp, lift: lift, u: uu,
              dx: new Float32Array(gw * gh), dy: new Float32Array(gw * gh) };
  })();
  function h5Gust(t) { return 0.72 + 0.18 * Math.sin(2 * Math.PI * t / 13.7) + 0.10 * Math.sin(2 * Math.PI * t / 7.9 + 1.0); }
  function h5Field(t, a) {                       // 更新网格位移（原图坐标），返回范围
    var F = HAIR5, n = F.gw * F.gh, g = h5Gust(t) * a * smoothstep01(t / 1.5);
    var mnx = 0, mxx = 0, mny = 0, mxy = 0;
    for (var k = 0; k < n; k++) {
      var A = F.amp[k];
      if (A <= 1e-4) { F.dx[k] = 0; F.dy[k] = 0; continue; }
      var u = F.u[k], tt = t - 1.1 * u;
      var m = tt <= 0 ? 0 : 0.5 - 0.5 * Math.cos(2 * Math.PI * tt / 5.0);
      var sec = 0.14 * u * Math.sin(2 * Math.PI * (t - 1.8 * u) / 2.3 + 1.3) * smoothstep01(t / 2.5);
      var vx = -A * g * (m + sec), vy = -F.lift[k] * g * m;
      F.dx[k] = vx; F.dy[k] = vy;
      if (vx < mnx) mnx = vx; if (vx > mxx) mxx = vx; if (vy < mny) mny = vy; if (vy > mxy) mxy = vy;
    }
    return [mnx, mxx, mny, mxy];
  }
  function drawHair5(ctx, t, a) {
    if (!HAIR5) return;
    var F = HAIR5, S = F.S, gw = F.gw, GX = F.dx, GY = F.dy, pm = F.pm, sp = F.spans, lw = F.w, lh = F.h, sx0 = F.x0, sy0 = F.y0;
    var r = h5Field(t, a);
    if (!F.rx) { F.rx = new Float32Array(gw + 2); F.ry = new Float32Array(gw + 2); }
    var RX = F.rx, RY = F.ry;
    var X0 = sx0, Y0 = Math.max(0, sy0 - 12), RW = Math.min(W, sx0 + lw + 8) - X0, RH = Math.min(H, sy0 + lh) - Y0;
    var LY = getLayer('h5', ctx, RW, RH), d = LY.img.data;
    d.fill(0);
    var dx0 = 1e9, dx1 = -1, dy0 = 1e9, dy1 = -1;
    for (var y = 0; y < RH; y++) {
      var Yabs = Y0 + y;
      var jlo = Math.max(0, Math.floor(Yabs - r[3] - sy0) - 1), jhi = Math.min(lh - 1, Math.ceil(Yabs - r[2] - sy0) + 1);
      var umin = 1e9, umax = -1;
      for (var j = jlo; j <= jhi; j++) { var s0 = sp[j * 2], s1 = sp[j * 2 + 1]; if (s1 >= s0) { if (s0 < umin) umin = s0; if (s1 > umax) umax = s1; } }
      if (umax < umin) continue;
      var xa = Math.max(0, Math.floor(sx0 + umin - 1 + r[0]) - 1 - X0), xb = Math.min(RW - 1, Math.ceil(sx0 + umax + 1 + r[1]) + 1 - X0);
      var fy = Yabs / S, iy = Math.floor(fy), ty = fy - iy, ro = iy * gw;
      var ga = Math.floor((X0 + xa) / S), gb = Math.min(gw - 1, Math.floor((X0 + xb) / S) + 1);
      for (var gi = ga; gi <= gb; gi++) { var oo = ro + gi; RX[gi] = GX[oo] * (1 - ty) + GX[oo + gw] * ty; RY[gi] = GY[oo] * (1 - ty) + GY[oo + gw] * ty; }
      for (var x = xa; x <= xb; x++) {
        var Xabs = X0 + x, fx = Xabs / S, ix = Math.floor(fx), tx = fx - ix;
        var ddx = RX[ix] * (1 - tx) + RX[ix + 1] * tx, ddy = RY[ix] * (1 - tx) + RY[ix + 1] * tx;
        var lx = Xabs - ddx - sx0, ly = Yabs - ddy - sy0, i0 = Math.floor(lx), j0 = Math.floor(ly);
        if (i0 < -1 || j0 < -1 || i0 >= lw || j0 >= lh) continue;
        var fx2 = lx - i0, fy2 = ly - j0, al = 0, rr = 0, gg = 0, bb = 0;
        if (i0 >= 0 && j0 >= 0 && i0 + 1 < lw && j0 + 1 < lh) {      // 快速路径：四个采样点都在图层内
          var q00 = (j0 * lw + i0) * 4, q01 = q00 + lw * 4;
          var a00 = pm[q00 + 3], a10 = pm[q00 + 7], a01 = pm[q01 + 3], a11 = pm[q01 + 7];
          if (a00 + a10 + a01 + a11 <= 0) continue;
          var w00 = (1 - fx2) * (1 - fy2), w10 = fx2 * (1 - fy2), w01 = (1 - fx2) * fy2, w11 = fx2 * fy2;
          al = a00 * w00 + a10 * w10 + a01 * w01 + a11 * w11;
          rr = pm[q00] * w00 + pm[q00 + 4] * w10 + pm[q01] * w01 + pm[q01 + 4] * w11;
          gg = pm[q00 + 1] * w00 + pm[q00 + 5] * w10 + pm[q01 + 1] * w01 + pm[q01 + 5] * w11;
          bb = pm[q00 + 2] * w00 + pm[q00 + 6] * w10 + pm[q01 + 2] * w01 + pm[q01 + 6] * w11;
        } else for (var c = 0; c < 4; c++) {
          var ii = i0 + (c & 1), jj = j0 + (c >> 1);
          if (ii < 0 || jj < 0 || ii >= lw || jj >= lh) continue;
          var wgt = ((c & 1) ? fx2 : 1 - fx2) * ((c >> 1) ? fy2 : 1 - fy2); if (wgt <= 0) continue;
          var q4 = (jj * lw + ii) * 4, pa = pm[q4 + 3]; if (pa <= 0) continue;
          al += pa * wgt; rr += pm[q4] * wgt; gg += pm[q4 + 1] * wgt; bb += pm[q4 + 2] * wgt;
        }
        if (al <= 0) continue;
        var q = (y * RW + x) * 4, ia = 1 / al;
        d[q] = rr * ia; d[q + 1] = gg * ia; d[q + 2] = bb * ia; d[q + 3] = al * 255;
        if (x < dx0) dx0 = x; if (x > dx1) dx1 = x; if (y < dy0) dy0 = y; if (y > dy1) dy1 = y;
      }
    }
    if (dx1 < dx0) return;
    LY.g.putImageData(LY.img, 0, 0, dx0, dy0, dx1 - dx0 + 1, dy1 - dy0 + 1);
    ctx.drawImage(LY.c, dx0, dy0, dx1 - dx0 + 1, dy1 - dy0 + 1, X0 + dx0, Y0 + dy0, dx1 - dx0 + 1, dy1 - dy0 + 1);
    return r;
  }
  var H5_UNDER_ORIGIN = { x: 0, y: 145 }, SWORD_OCC5_ORIGIN = { x: 151, y: 250 };

  function drawTexturedTriangle(ctx, img, u0, v0, u1, v1, u2, v2, x0, y0, x1, y1, x2, y2) {
    var du1 = u1 - u0, dv1 = v1 - v0, du2 = u2 - u0, dv2 = v2 - v0;
    var det = du1 * dv2 - du2 * dv1;
    if (Math.abs(det) < 1e-6) return;
    var inv = 1 / det;
    var dx1 = x1 - x0, dy1 = y1 - y0, dx2 = x2 - x0, dy2 = y2 - y0;
    var a = (dx1 * dv2 - dx2 * dv1) * inv;
    var b = (dy1 * dv2 - dy2 * dv1) * inv;
    var c = (du1 * dx2 - du2 * dx1) * inv;
    var d = (du1 * dy2 - du2 * dy1) * inv;
    var e = x0 - a * u0 - c * v0;
    var f = y0 - b * u0 - d * v0;
    // 轻微外扩裁剪三角形，避免相邻三角形之间出现细缝
    var cx = (x0 + x1 + x2) / 3, cy = (y0 + y1 + y2) / 3, ex = 0.45;
    function ep(px, py) { var vx = px - cx, vy = py - cy, l = Math.sqrt(vx * vx + vy * vy) || 1; return [px + vx / l * ex, py + vy / l * ex]; }
    var p0 = ep(x0, y0), p1 = ep(x1, y1), p2 = ep(x2, y2);
    ctx.save();
    ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.closePath();
    ctx.clip();
    ctx.transform(a, b, c, d, e, f);
    ctx.drawImage(img, TEX_ORIGIN.x, TEX_ORIGIN.y);   // 默认 (0,0) = 原图；v4 呼吸用裁切纹理时为其左上角
    ctx.restore();
  }

  // 只重绘发生位移的三角形；未位移部分保持原图像素
  function drawMesh(ctx, img, mesh, dispFn, amp, debug, minMove) {
    var mm = minMove || 1e-3;   // 呼吸沿用 1e-3（批准版不变）；头发用 0.06，近零位移三角形不重采样
    var b = mesh.bbox, cols = mesh.cols, rows = mesh.rows;
    var bw = b[2] - b[0], bh = b[3] - b[1], src = [], dst = [], r, c;
    for (r = 0; r <= rows; r++) {
      src.push([]); dst.push([]);
      for (c = 0; c <= cols; c++) {
        var x = b[0] + bw * c / cols, y = b[1] + bh * r / rows;
        var edge = (r === 0 || c === 0 || r === rows || c === cols);
        var dd = edge ? [0, 0] : dispFn(x, y, amp);
        src[r].push([x, y]); dst[r].push([x + dd[0], y + dd[1]]);
      }
    }
    // 严格裁剪在网格外框内（整数边界），外框以外像素不会被任何抗锯齿边缘触及
    ctx.save();
    ctx.beginPath(); ctx.rect(b[0], b[1], bw, bh); ctx.clip();
    function moved(p, q) { return Math.abs(p[0] - q[0]) > mm || Math.abs(p[1] - q[1]) > mm; }
    for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) {
      var s00 = src[r][c], s10 = src[r][c + 1], s01 = src[r + 1][c], s11 = src[r + 1][c + 1];
      var d00 = dst[r][c], d10 = dst[r][c + 1], d01 = dst[r + 1][c], d11 = dst[r + 1][c + 1];
      var m00 = moved(s00, d00), m10 = moved(s10, d10), m01 = moved(s01, d01), m11 = moved(s11, d11);
      if (m00 || m10 || m11) drawTexturedTriangle(ctx, img, s00[0], s00[1], s10[0], s10[1], s11[0], s11[1], d00[0], d00[1], d10[0], d10[1], d11[0], d11[1]);
      if (m00 || m11 || m01) drawTexturedTriangle(ctx, img, s00[0], s00[1], s11[0], s11[1], s01[0], s01[1], d00[0], d00[1], d11[0], d11[1], d01[0], d01[1]);
    }
    ctx.restore();
    if (debug) {
      ctx.save(); ctx.strokeStyle = 'rgba(52,211,153,0.6)'; ctx.lineWidth = 1;
      for (r = 0; r <= rows; r++) { ctx.beginPath(); for (c = 0; c <= cols; c++) { var p = dst[r][c]; if (c) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); } ctx.stroke(); }
      for (c = 0; c <= cols; c++) { ctx.beginPath(); for (r = 0; r <= rows; r++) { var q = dst[r][c]; if (r) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); } ctx.stroke(); }
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------- 合成
  /**
   * opts: { blink:true, breathing:true, breathStrength:1, forceClosure:null, debug:false }
   * 返回本帧状态，便于核验
   */
  function renderScene(ctx, images, t, opts) {
    opts = opts || {};
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    // 调试页"分层拆解"开关：opts.layers 里显式设为 false 的层不画；未提供 opts.layers（默认/录屏/核验）时与 v5.2 完全一致
    var LYR = opts.layers || null;
    function on(k) { return !LYR || LYR[k] !== false; }
    if (on('source')) ctx.drawImage(images.source, 0, 0); else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }

    // 头发：t=0 时位移全为 0，不绘制任何三角形
    var hairAmp = (opts.hair === false) ? 0 : (opts.hairStrength == null ? 1 : opts.hairStrength);
    hairT = t;
    var hairOn = hairAmp > 1e-4 && t > 0;
    var v5 = hairOn && (opts.hairMode == null || opts.hairMode === 'v5');
    var v4 = hairOn && (v5 || opts.hairMode === 'v4');                                                       // v5 沿用 v4 的右侧发缘 + 辫子
    var underOnly = !!LYR && !on('hairSheet') && (opts.hairMode == null || opts.hairMode === 'v5');            // "仅看干净补底"：t=0 也显示补底
    if ((v4 || (underOnly && !on('rcLocks'))) && on('rcUnder') && images.hair4rcUnder) ctx.drawImage(images.hair4rcUnder, RC_UNDER_ORIGIN.x, RC_UNDER_ORIGIN.y);   // 右侧/辫子补底（静态，位于呼吸零位移通道/保护场内）
    if (v5 || underOnly) {
      if (on('hairUnder') && images.hair5Under) ctx.drawImage(images.hair5Under, H5_UNDER_ORIGIN.x, H5_UNDER_ORIGIN.y);         // 整片长发下的干净背景
      if (v5 && on('hairSheet')) drawHair5(ctx, t, hairAmp);
      if (on('frontOcc') && images.swordOcc5) ctx.drawImage(images.swordOcc5, SWORD_OCC5_ORIGIN.x, SWORD_OCC5_ORIGIN.y);      // 剑（含剑刃到剑尖）与握剑的手压在最上面
    } else if (hairOn) {
      if (opts.hairMode === 'v1') drawMesh(ctx, images.source, HAIR, hairDisp, hairAmp, opts.debug, 0.06);   // v1 备选（方向认可基线）
      else if (opts.hairMode === 'v2') drawHair2(ctx, images, t, hairAmp);                                     // v2 备选：分相位连续场 + 补底
      else drawHair3(ctx, images, t, hairAmp);                                                                // v3/v4：左侧 4 束切开的发束 + 补底
      if (images.swordOcc) ctx.drawImage(images.swordOcc, SWORD_OCC_ORIGIN.x, SWORD_OCC_ORIGIN.y);
    }

    breathPreset = BREATH_PRESETS[opts.breathPreset] || BREATH_PRESETS.stronger;
    var breathAmp = (opts.breathing === false || !on('breath')) ? 0 : (opts.breathStrength == null ? 1 : opts.breathStrength) * breathWave(t);
    if (breathAmp > 1e-4 || opts.debug) {
      var tex = images.source;
      if (v4) { var bt = breathTex4(ctx, images); if (bt) { tex = bt; TEX_ORIGIN.x = BREATH_TEX4_ORIGIN.x; TEX_ORIGIN.y = BREATH_TEX4_ORIGIN.y; } }
      drawMesh(ctx, tex, CHEST, chestDisp, breathAmp, opts.debug);
      drawMesh(ctx, tex, SHOULDER, shoulderDisp, breathAmp, opts.debug);
      TEX_ORIGIN.x = 0; TEX_ORIGIN.y = 0;
      // 静态保护层：静止的头发、辫子等原图像素压回（v4 时去掉了会动的右侧发缘和辫子）
      var prot = (v4 && images.protect4) ? images.protect4 : images.protect;
      if (prot && on('protect')) ctx.drawImage(prot, PROTECT_ORIGIN.x, PROTECT_ORIGIN.y);
    }
    if (v4 && on('rcLocks')) drawHair4RC(ctx, t, hairAmp, breathAmp);

    var closure = opts.forceClosure != null ? opts.forceClosure : ((opts.blink === false || !on('blink')) ? 0 : blinkClosureAt(t));
    var stage = Math.round(clamp01(closure) * BLINK_STAGES);
    if (stage > 0) {
      ctx.drawImage(images['eyeL_' + stage], BLINK_PATCH.L.x, BLINK_PATCH.L.y);
      ctx.drawImage(images['eyeR_' + stage], BLINK_PATCH.R.x, BLINK_PATCH.R.y);
    }
    return { t: t, closure: closure, stage: stage, breathAmp: breathAmp, hair: hairOn };
  }

  var api = {
    W: W, H: H, ASSETS: ASSETS, BLINK_TIMES: BLINK_TIMES, BLINK_PATCH: BLINK_PATCH,
    CHEST: CHEST, SHOULDER: SHOULDER, BREATH_PRESETS: BREATH_PRESETS, HAIR: HAIR,
    hairField: function (x, y) { return sampleField(HAIR_FIELD, x, y); }, hairDispAt: function (x, y, t) { hairT = t; return hairDisp(x, y, 1); }, hair2DispAt: function (x, y, t) { return HAIR2 ? hair2Disp(x, y, t) : 0; }, h5FieldAt: function (t) { return HAIR5 ? h5Field(t, 1) : null; }, HAIR5: function () { return HAIR5; }, rcDispAt: function (x, y, t, k, ba) { return RC ? rcDisp(x, y, t, k, ba || 0) : [0, 0]; }, hair3DispAt: function (x, y, t, k) { return HAIR3 ? hair3Disp(x, y, t, k) : 0; }, HAIR3_LOCKS: HAIR3_LOCKS, PROTECT_ORIGIN: PROTECT_ORIGIN,
    blinkClosureAt: blinkClosureAt, breathWave: breathWave,
    chestWeight: chestWeight, shoulderWeight: shoulderWeight,
    renderScene: renderScene
  };

  // ---------------------------------------------------------------- 浏览器启动（调试页：按幽冥版的布局与交互组织）
  // 只做 UI 与控件接线；动效全部走上面的 renderScene()。不调用 getImageData（file:// 打开时画布会被本地图片"污染"）。
  var LAYER_META = [
    { key: 'source', label: '01. 原图底（source_original，关掉=黑底看各层）', tag: 'Static' },
    { key: 'hairUnder', label: '02. 左侧长发干净补底（hair5_underlay）', tag: 'Underlay' },
    { key: 'hairSheet', label: '03. 整片长发发片（v5.2 位移场，整体平移）', tag: 'Hair' },
    { key: 'frontOcc', label: '04. 前遮挡层：剑·手·手臂·肩侧发芯（原图像素，静止）', tag: 'Fixed' },
    { key: 'rcUnder', label: '05. 右侧发缘 / 胸前辫子补底', tag: 'Underlay' },
    { key: 'rcLocks', label: '06. 右侧发缘 3 束 + 胸前辫子', tag: 'Hair' },
    { key: 'breath', label: '07. 胸肩呼吸网格（胸 24×26 · 肩 11×18）', tag: 'Breath' },
    { key: 'protect', label: '08. 静态保护层（静止发丝 / 辫芯压回）', tag: 'Fixed' },
    { key: 'blink', label: '09. 眨眼补丁（33 级，覆盖整片上眼睑）', tag: 'Blink' }
  ];
  var HAIR_MODE_LABEL = { v5: 'v5.2 整片长发', v4: 'v4 左 4 束', v3: 'v3 左 4 束', v2: 'v2 分相位', v1: 'v1 连续形变' };

  function boot() {
    var canvas = document.getElementById('portrait-canvas') || document.getElementById('stage');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var BUILD = 'v5.2';
    var images = {}, keys = Object.keys(ASSETS), left = keys.length, failed = [];
    var state = {
      mode: 'animated',            // animated | static | original | split | diff
      userPaused: false, reduced: false, hidden: false,
      intensity: 1, speed: 1,
      hair: true, hairMode: 'v5', hairStrength: 1,
      blink: true, eyeMode: 'auto',
      breathing: true, breathPreset: 'stronger', breathStrength: 1,
      splitPos: 0.5, diffGain: 32,
      layers: {}, overlays: { mesh: false, field: false, occ: false, zone: false, eyeBox: false },
      simT: 0, fps: 0, frameCount: 0, renderCount: 0, assetsLoaded: false, note: ''
    };
    LAYER_META.forEach(function (m) { state.layers[m.key] = true; });
    try {
      var mql = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
      if (mql) {
        state.reduced = !!mql.matches;
        var onMql = function (ev) { state.reduced = !!ev.matches; refresh(); };
        if (mql.addEventListener) mql.addEventListener('change', onMql); else if (mql.addListener) mql.addListener(onMql);
      }
    } catch (e) {}
    var lastTs = null, dirty = true, fpsF = 0, fpsMs = 0, msAvg = 0, msN = 0, lastInfo = null;

    function $(id) { return document.getElementById(id); }
    function setText(id, s) { var el = $(id); if (el) el.textContent = s; }
    function toggleClass(el, c, onOff) { if (el && el.classList) { if (onOff) el.classList.add(c); else el.classList.remove(c); } }
    function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

    keys.forEach(function (k) {
      var img = new Image();
      img.onload = function () { if (--left === 0) start(); };
      img.onerror = function () { failed.push(ASSETS[k]); if (--left === 0) start(); };
      img.src = ASSETS[k];
      images[k] = img;
    });

    function animatedMode() { return state.mode === 'animated' || state.mode === 'split' || state.mode === 'diff'; }
    function running() { return animatedMode() && !state.userPaused && !state.reduced && !state.hidden; }
    function sceneOpts() {
      var I = state.intensity;
      return {
        hair: state.hair, hairMode: state.hairMode, hairStrength: state.hairStrength * I,
        blink: state.blink && I > 0, forceClosure: state.eyeMode === 'auto' ? null : Number(state.eyeMode),
        breathing: state.breathing, breathPreset: state.breathPreset, breathStrength: state.breathStrength * I,
        debug: state.overlays.mesh, layers: state.layers
      };
    }

    // ---- 离屏画布（只 drawImage / 合成模式，不读像素）
    function mkCanvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    var tintCache = {};
    function tinted(key, img, color) {
      if (tintCache[key]) return tintCache[key];
      if (!img || !img.width) return null;
      var c = mkCanvas(img.width, img.height), g = c.getContext('2d');
      g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
      return (tintCache[key] = c);
    }
    var diffA = null, diffB = null;
    function drawDiff() {   // |当前帧 - 原图| × gain：difference 合成 + lighter 反复叠加（纯 GPU 合成，无 getImageData）
      if (!diffA) { diffA = mkCanvas(W, H); diffB = mkCanvas(W, H); }
      var a = diffA.getContext('2d'), b = diffB.getContext('2d');
      a.globalCompositeOperation = 'copy'; a.drawImage(canvas, 0, 0);
      a.globalCompositeOperation = 'difference'; a.drawImage(images.source, 0, 0);
      for (var gsum = 1; gsum < state.diffGain; gsum *= 2) {
        b.globalCompositeOperation = 'copy'; b.drawImage(diffA, 0, 0);
        a.globalCompositeOperation = 'lighter'; a.drawImage(diffB, 0, 0);
      }
      a.globalCompositeOperation = 'source-over';
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.drawImage(diffA, 0, 0);
    }
    function label(x, y, w, txt, color) {
      ctx.fillStyle = 'rgba(10, 14, 24, 0.82)'; ctx.fillRect(x, y, w, 38);
      ctx.strokeStyle = 'rgba(147, 197, 253, 0.6)'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, 38);
      ctx.fillStyle = color; ctx.font = '600 20px sans-serif'; ctx.fillText(txt, x + 14, y + 26);
    }
    function drawOverlays(info) {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over';
      var o = state.overlays, c;
      if (o.zone && (c = tinted('zone', images.hair5Under, 'rgb(34, 211, 238)'))) { ctx.globalAlpha = 0.35; ctx.drawImage(c, H5_UNDER_ORIGIN.x, H5_UNDER_ORIGIN.y); }
      if (o.occ && (c = tinted('occ', images.swordOcc5, 'rgb(251, 113, 133)'))) { ctx.globalAlpha = 0.45; ctx.drawImage(c, SWORD_OCC5_ORIGIN.x, SWORD_OCC5_ORIGIN.y); }
      ctx.globalAlpha = 1;
      if (o.eyeBox) {
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.95)'; ctx.lineWidth = 2;
        ['L', 'R'].forEach(function (k) { var im = images['eyeL_1'] && images['eye' + k + '_1']; if (im) ctx.strokeRect(BLINK_PATCH[k].x, BLINK_PATCH[k].y, im.width, im.height); });
      }
      if (o.field && HAIR5 && state.hairMode === 'v5' && info && info.hair) {
        var F = HAIR5, st = 4;
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.9)'; ctx.fillStyle = 'rgba(250, 204, 21, 0.9)'; ctx.lineWidth = 2;
        for (var gy = 0; gy < F.gh; gy += st) for (var gx = 0; gx < F.gw; gx += st) {
          var k = gy * F.gw + gx; if (!(F.amp[k] > 1e-3)) continue;
          var x = gx * F.S, y = gy * F.S, dx = F.dx ? F.dx[k] : 0, dy = F.dy ? F.dy[k] : 0;
          ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.stroke();
        }
      }
    }

    function renderSafe(t) {
      try { return renderScene(ctx, images, t, sceneOpts()); }
      catch (err) {
        // 头发出错时不让整页停住：退回最轻的 v1 头发（纯网格，不读像素），眨眼/呼吸照常
        var msg = (err && err.message) ? err.message : String(err);
        if (state.hair && state.hairMode !== 'v1') {
          state.note = '（' + state.hairMode + ' 头发出错已自动改用 v1：' + msg + '）';
          state.hairMode = 'v1'; var sh = $('sel-hair'); if (sh) sh.value = 'v1';
        } else { state.note = '（头发出错已关闭：' + msg + '）'; state.hair = false; }
        if (typeof console !== 'undefined') console.error(err);
        return renderScene(ctx, images, t, sceneOpts());
      }
    }
    function draw() {
      if (!state.assetsLoaded || state.hidden) return;
      state.renderCount++;
      var t0 = now(), info = null, t = state.reduced ? 0 : state.simT;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      if (state.mode === 'original') {
        ctx.drawImage(images.source, 0, 0);
      } else if (state.mode === 'static') {
        info = renderSafe(0); drawOverlays(info);
      } else if (state.mode === 'diff') {
        info = renderSafe(t); drawDiff();
      } else {
        info = renderSafe(t); drawOverlays(info);
        if (state.mode === 'split') {
          var sx = Math.round(state.splitPos * W);
          ctx.save(); ctx.beginPath(); ctx.rect(0, 0, sx, H); ctx.clip(); ctx.drawImage(images.source, 0, 0); ctx.restore();
          ctx.strokeStyle = 'rgba(147, 197, 253, 0.95)'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
          if (sx > 150) label(18, 18, 128, '← 原图', '#eef2ff');
          if (W - sx > 170) label(W - 166, 18, 148, '当前帧 →', '#93c5fd');
        }
      }
      lastInfo = info || { stage: 0, breathAmp: 0 };
      var ms = now() - t0; msN++; msAvg = msN < 30 ? msAvg + (ms - msAvg) / msN : msAvg * 0.95 + ms * 0.05;
      updateStatusLine();
    }

    function updateStatusLine() {
      var info = lastInfo || { stage: 0, breathAmp: 0 };
      setText('status-line', (running() ? '播放中' : (state.reduced ? '已静止（减弱动态）' : (animatedMode() ? '已暂停' : '静态锁帧'))) +
        ' · t=' + state.simT.toFixed(1) + 's · 眨眼阶段 ' + info.stage + '/32 · 呼吸 ' + (info.breathAmp || 0).toFixed(2) +
        ' · 每帧约 ' + msAvg.toFixed(0) + 'ms · ' + BUILD + state.note);
    }

    function updateStatusUI() {
      var badge = $('mode-badge'), fps = $('fps-badge'), btnPause = $('btn-pause');
      toggleClass($('reduced-motion-banner'), 'hidden', !state.reduced);
      toggleClass($('split-slider-wrap'), 'hidden', state.mode !== 'split');
      toggleClass($('diff-gain-wrap'), 'hidden', state.mode !== 'diff');
      var rm = $('toggle-reduced-motion'); if (rm) rm.checked = state.reduced;
      var ba = document.querySelector ? document.querySelector('[data-mode="animated"]') : null;
      if (ba) ba.textContent = state.reduced ? '待机视图（减弱动态已静止）' : '实时微动效';
      if (btnPause) {
        btnPause.textContent = state.reduced ? (state.userPaused ? '▶ 取消手动暂停（当前受减弱动态锁定静止）' : '⏸ 设为手动暂停（当前已因减弱动态静止）')
          : (state.userPaused ? '▶ 继续播放（已手动暂停）' : '⏸ 暂停动画');
        btnPause.setAttribute('aria-pressed', state.userPaused ? 'true' : 'false');
      }
      // 专项徽标
      var bb = $('breathing-status-badge');
      if (bb) {
        var bOn = state.breathing && state.layers.breath && state.breathStrength * state.intensity > 0;
        bb.textContent = state.reduced ? '已因减弱动态静止' : (!bOn ? '已关闭（静态锁定）' : '已启用（' + (state.breathStrength * state.intensity).toFixed(2) + 'x · 周期 4.6s）');
        bb.className = (bOn && !state.reduced) ? 'feature-badge-ok' : 'feature-badge-pending';
      }
      var kb = $('blink-status-badge');
      if (kb) {
        var kOn = state.blink && state.layers.blink && state.intensity > 0;
        kb.textContent = state.eyeMode !== 'auto' ? ('固定' + (state.eyeMode === '1' ? '全闭' : '半闭') + '（验收用）') :
          (state.reduced ? '已因减弱动态静止（睁眼）' : (!kOn ? '已关闭（睁眼）' : '已启用（0.8 秒 · 3.4–5.8 秒随机间隔）'));
        kb.className = (kOn && !state.reduced) || state.eyeMode !== 'auto' ? 'feature-badge-ok' : 'feature-badge-pending';
      }
      var hb = $('hair-status-badge');
      if (hb) {
        var hOn = state.hair && state.hairStrength * state.intensity > 0;
        hb.textContent = state.reduced ? '已因减弱动态静止' : (!hOn ? '已关闭（静止）' : '已启用（' + HAIR_MODE_LABEL[state.hairMode] + ' · ' + (state.hairStrength * state.intensity).toFixed(2) + 'x）');
        hb.className = (hOn && !state.reduced) ? 'feature-badge-ok' : 'feature-badge-pending';
      }
      document.querySelectorAll && document.querySelectorAll('#layer-list input[data-layer]').forEach(function (cb) { cb.checked = state.layers[cb.getAttribute('data-layer')] !== false; });
      var cbB = $('toggle-breathing'); if (cbB) cbB.checked = state.breathing && state.layers.breath;
      var cbK = $('toggle-blink'); if (cbK) cbK.checked = state.blink && state.layers.blink;
      if (!badge || !fps) return;
      var cls = 'status-pill static', txt, ftxt = '0 FPS（静态锁帧）';
      if (state.hidden) { txt = '后台已挂起 · 零重绘'; cls = 'status-pill paused'; ftxt = '0 FPS（后台挂起）'; }
      else if (state.mode === 'original') txt = '原图直出（source_original.jpg）';
      else if (state.mode === 'static') txt = '静态重组（t = 0.00s · 零位移验证）';
      else if (state.reduced) { txt = '减弱动态已生效 · 静态展示中（未播放）'; cls = 'status-pill paused'; ftxt = '0 FPS（已静止）'; }
      else if (state.userPaused) { txt = '手动已暂停 · 帧画面已锁定'; cls = 'status-pill paused'; ftxt = '0 FPS（手动暂停）'; }
      else {
        var tag = state.mode === 'split' ? '原图 vs 当前帧 分屏 · ' : (state.mode === 'diff' ? '误差放大 ×' + state.diffGain + ' · ' : '实时待机微动效 · ');
        txt = tag + state.intensity.toFixed(2) + 'x' + (state.speed !== 1 ? ' · 速度 ' + state.speed.toFixed(2) + 'x' : '');
        cls = 'status-pill running'; ftxt = state.fps + ' FPS';
      }
      badge.textContent = txt; badge.className = cls; fps.textContent = ftxt;
    }
    function refresh() { dirty = true; lastTs = null; updateStatusUI(); }

    function tick(ts) {
      requestAnimationFrame(tick);                 // 先排下一帧：即使本帧出错，动画循环也不会停
      if (lastTs == null) lastTs = ts;
      var dtMs = Math.max(0, ts - lastTs), dt = Math.min(0.1, dtMs / 1000);
      lastTs = ts;
      if (state.hidden || !state.assetsLoaded) return;
      if (running()) {
        state.simT += dt * state.speed; state.frameCount++; dirty = true;
        fpsF++; fpsMs += dtMs;
        if (fpsMs >= 400) { state.fps = Math.round(fpsF * 1000 / fpsMs); fpsF = 0; fpsMs = 0; var fb = $('fps-badge'); if (fb) fb.textContent = state.fps + ' FPS'; }
      }
      if (dirty) { dirty = false; draw(); }       // 暂停/静态时不重复重绘
    }
    function start() {
      if (failed.length) {
        setText('mode-badge', '素材加载失败'); var b = $('mode-badge'); if (b) b.className = 'status-pill paused';
        setText('status-line', '素材加载失败：' + failed.join(', ') + '（请确认整个文件夹已解压，或运行 start.bat / start.sh）');
        return;
      }
      state.assetsLoaded = true; refresh();
      requestAnimationFrame(tick);
    }

    // ---- 控件接线
    function bind(id, ev, fn) { var el = $(id); if (el) el.addEventListener(ev, function (e) { fn(e, el); refresh(); }); }
    function setMode(m) {
      state.mode = m;
      if (document.querySelectorAll) document.querySelectorAll('[data-mode]').forEach(function (btn) {
        var a = btn.getAttribute('data-mode') === m; toggleClass(btn, 'active', a); btn.setAttribute('aria-pressed', a ? 'true' : 'false');
      });
      refresh();
    }
    if (document.querySelectorAll) document.querySelectorAll('[data-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () { setMode(btn.getAttribute('data-mode')); });
    });
    bind('btn-pause', 'click', function () { state.userPaused = !state.userPaused; });
    bind('btn-reset', 'click', function () {
      state.simT = 0; state.intensity = 1; state.speed = 1; state.hairStrength = 1; state.breathStrength = 1;
      [['slider-intensity', 1], ['slider-speed', 1], ['hair-strength', 1], ['slider-breathing', 1]].forEach(function (p) { var el = $(p[0]); if (el) el.value = p[1]; });
      var wp = $('wind-preset'); if (wp) wp.value = '1';
      syncLabels();
    });
    bind('btn-override-rm', 'click', function () { state.reduced = false; });
    bind('toggle-reduced-motion', 'change', function (e) { state.reduced = e.target.checked; });
    bind('slider-intensity', 'input', function (e) { state.intensity = Number(e.target.value); syncLabels(); });
    bind('slider-speed', 'input', function (e) { state.speed = Number(e.target.value); syncLabels(); });
    bind('slider-split', 'input', function (e) { state.splitPos = Number(e.target.value); syncLabels(); });
    bind('sel-diff-gain', 'change', function (e) { state.diffGain = Number(e.target.value); });
    bind('toggle-hair', 'change', function (e) { state.hair = e.target.checked; });
    bind('sel-hair', 'change', function (e) { state.hairMode = e.target.value; });
    bind('wind-preset', 'change', function (e) { state.hairStrength = Number(e.target.value); var r = $('hair-strength'); if (r) r.value = state.hairStrength; syncLabels(); });
    bind('hair-strength', 'input', function (e) { state.hairStrength = Number(e.target.value); syncLabels(); });
    bind('toggle-blink', 'change', function (e) { state.blink = e.target.checked; state.layers.blink = e.target.checked; });
    bind('blink-mode', 'change', function (e) { state.eyeMode = e.target.value; });
    bind('toggle-breathing', 'change', function (e) { state.breathing = e.target.checked; state.layers.breath = e.target.checked; });
    bind('breath-preset', 'change', function (e) { state.breathPreset = e.target.value; });
    bind('slider-breathing', 'input', function (e) { state.breathStrength = Number(e.target.value); syncLabels(); });
    ['mesh', 'field', 'occ', 'zone', 'eyeBox'].forEach(function (k) { bind('toggle-ov-' + k, 'change', function (e) { state.overlays[k] = e.target.checked; }); });
    bind('btn-layers-all', 'click', function () { LAYER_META.forEach(function (m) { state.layers[m.key] = true; }); state.breathing = true; state.blink = true; });
    bind('btn-layers-under', 'click', function () {   // 仅看干净补底：原图 + 补底（不画会动的发片、遮挡层、呼吸、眨眼）
      LAYER_META.forEach(function (m) { state.layers[m.key] = (m.key === 'source' || m.key === 'hairUnder' || m.key === 'rcUnder'); });
      state.breathing = false; state.blink = false; state.hairMode = 'v5'; var sh = $('sel-hair'); if (sh) sh.value = 'v5';
    });
    (function initLayerList() {
      var box = $('layer-list'); if (!box || !document.createElement) return;
      LAYER_META.forEach(function (m) {
        var lab = document.createElement('label'); lab.className = 'layer-item';
        var lft = document.createElement('span'); lft.className = 'layer-item-left';
        var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = true; cb.setAttribute('data-layer', m.key);
        cb.addEventListener('change', function () {
          state.layers[m.key] = cb.checked;
          if (m.key === 'breath') state.breathing = cb.checked;
          if (m.key === 'blink') state.blink = cb.checked;
          refresh();
        });
        var tx = document.createElement('span'); tx.textContent = m.label;
        var tg = document.createElement('span'); tg.className = 'layer-tag'; tg.textContent = m.tag;
        lft.appendChild(cb); lft.appendChild(tx); lab.appendChild(lft); lab.appendChild(tg); box.appendChild(lab);
      });
    })();
    function syncLabels() {
      setText('intensity-value', state.intensity.toFixed(2) + 'x' + (state.intensity === 1 ? '（默认）' : ''));
      setText('speed-value', state.speed.toFixed(2) + 'x' + (state.speed === 1 ? '（实时）' : '（仅调试）'));
      setText('split-value', Math.round(state.splitPos * 100) + '%');
      setText('hair-value', state.hairStrength.toFixed(2) + 'x' + (state.hairStrength === 1 ? '（默认 · 底部外缘约 27–45px）' : ''));
      setText('breathing-value', state.breathStrength.toFixed(2) + 'x' + (state.breathStrength === 1 ? '（默认 · 胸口约 12.5px）' : ''));
    }
    if (window.addEventListener) window.addEventListener('keydown', function (e) {
      if (e.code === 'Space' && e.target === document.body) { if (e.preventDefault) e.preventDefault(); state.userPaused = !state.userPaused; refresh(); }
    });
    document.addEventListener('visibilitychange', function () { state.hidden = !!document.hidden; refresh(); });
    syncLabels(); updateStatusUI();

    // 自动化核验接口（与幽冥版 window.youmingPrototype 对应）
    window.lanyiDebug = {
      getState: function () {
        return { build: BUILD, mode: state.mode, userPaused: state.userPaused, reduced: state.reduced, hidden: state.hidden, running: running(),
          intensity: state.intensity, speed: state.speed, hair: state.hair, hairMode: state.hairMode, hairStrength: state.hairStrength,
          blink: state.blink, eyeMode: state.eyeMode, breathing: state.breathing, breathPreset: state.breathPreset, breathStrength: state.breathStrength,
          splitPos: state.splitPos, diffGain: state.diffGain, layers: JSON.parse(JSON.stringify(state.layers)), overlays: JSON.parse(JSON.stringify(state.overlays)),
          simT: state.simT, frameCount: state.frameCount, renderCount: state.renderCount, assetsLoaded: state.assetsLoaded, lastInfo: lastInfo, sceneOpts: sceneOpts() };
      },
      setMode: setMode,
      setTimeForTest: function (t) { state.simT = Number(t) || 0; refresh(); },
      setPageHiddenForTest: function (h) { state.hidden = !!h; refresh(); }
    };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LanyiPortrait = api;
  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  }
})(typeof self !== 'undefined' ? self : this);
