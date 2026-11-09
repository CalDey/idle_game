// Bot-authored non-browser renderer: requires the SAME js/main.js and calls renderScene() per frame
// with node-canvas (Cairo). No Chrome/Playwright/CDP. Writes raw full-res frames to ffmpeg and
// checks every frame against the source in protected masks.
const path = require('path'), fs = require('fs'), { spawn } = require('child_process');
const { createCanvas, loadImage } = require('./node_modules/canvas');
const ROOT = path.resolve(__dirname, '..');
const LP = require(path.join(ROOT, 'js/main.js'));
const FPS = 30, DUR = Number(process.argv[2] || 20), PRESET = process.argv[3] || 'stronger', HMODE = process.argv[4] || 'v4';
(async () => {
  const images = {};
  for (const [k, p] of Object.entries(LP.ASSETS)) images[k] = await loadImage(path.join(ROOT, p));
  const W = LP.W, H = LP.H;
  const cv = createCanvas(W, H), ctx = cv.getContext('2d');
  // reference: source drawn alone
  const rc = createCanvas(W, H), rctx = rc.getContext('2d'); rctx.drawImage(images.source, 0, 0);
  const ref = rctx.getImageData(0, 0, W, H).data;
  const labels = fs.readFileSync(path.join(ROOT, 'work/protect_labels_' + HMODE + '.u8'));
  const names = JSON.parse(fs.readFileSync(path.join(ROOT, 'work/protect_labels.json')));
  const bits = Object.keys(names).map(Number);
  const maxDiff = {}; bits.forEach(b => maxDiff[b] = 0);
  const out = path.join(ROOT, 'work/frames_full_' + PRESET + '_' + HMODE + '.rgba');
  const fd = fs.openSync(out, 'w');
  const report = { hair: true, hairMode: HMODE, preset: PRESET, fps: FPS, duration: DUR, frames: [], t0_max_diff_full_frame: null };
  const EYE = [[504,158,558,194],[568,183,600,205]];
  for (let i = 0; i < FPS * DUR; i++) {
    const t = i / FPS;
    const info = LP.renderScene(ctx, images, t, { breathPreset: PRESET, hairMode: HMODE });
    const d = ctx.getImageData(0, 0, W, H).data;
    let frameMax = 0, eyeMax = 0, motionMax = 0;
    for (let p = 0, q = 0; p < W * H; p++, q += 4) {
      const dd = Math.max(Math.abs(d[q] - ref[q]), Math.abs(d[q + 1] - ref[q + 1]), Math.abs(d[q + 2] - ref[q + 2]));
      if (!dd) continue;
      if (dd > frameMax) frameMax = dd;
      const L = labels[p];
      for (const b of bits) if ((L & b) && dd > maxDiff[b]) maxDiff[b] = dd;
      const x = p % W, y = (p / W) | 0;
      const inEye = EYE.some(e => x >= e[0] && x < e[2] && y >= e[1] && y < e[3]);
      if (inEye) { if (dd > eyeMax) eyeMax = dd; } else if (dd > motionMax) motionMax = dd;
    }
    if (i === 0) report.t0_max_diff_full_frame = frameMax;
    report.frames.push({ i, t: +t.toFixed(3), stage: info.stage, breath: +info.breathAmp.toFixed(3), maxDiff: frameMax, eyeMax, breathZoneMax: motionMax });
    fs.writeSync(fd, Buffer.from(d.buffer, d.byteOffset, d.byteLength));
  }
  fs.closeSync(fd);
  report.protected_max_diff_all_frames = {}; bits.forEach(b => report.protected_max_diff_all_frames[names[b]] = maxDiff[b]);
  report.blink_times_in_range = LP.BLINK_TIMES.filter(x => x < DUR);
  fs.writeFileSync(path.join(ROOT, 'review/render_verification_' + PRESET + '_hair' + HMODE + '.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ t0: report.t0_max_diff_full_frame, prot: report.protected_max_diff_all_frames, blinks: report.blink_times_in_range }, null, 1));
})();
