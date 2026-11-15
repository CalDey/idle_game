// 仙姬派遣：把未上阵的仙姬派去接限时悬赏，到点（真实时间）后领奖。
// 规则：
// - 每个本地日期 4 条悬赏，由「日期 + 存档创建时间」确定性生成；跨日刷新，已派出的任务保留到领取。
// - 时长 2/4/6/8 小时（不超过 12 小时离线上限），≥6 小时需 2 人，其余 1 人；部分任务要求地品/天品以上。
// - 只能派当前不在出战队伍中的已解锁仙姬；同一仙姬同时只能接 1 条；派遣中的仙姬不能编入出战队伍（召回后可上阵）。
//   出战队伍永远不受影响，最多同时占用 8 人。
// - 仙缘标签匹配：悬赏有「仙缘」标签，每名持该标签的派遣仙姬奖励 +25%（最多 2 人 +50%）。
// - 奖励只用灵石、灵玉、仙桃：派出时按当时产出写入快照，并记下 state.reincarnationCount。
//   仅当领取时轮回次数多于派出时，才对灵石/灵玉按今生产出封顶（防止轮回后领前世高额）；
//   同一世里产出下降（换阵/加成到期）仍发快照值。旧任务没有该字段时不封顶（视为派出后未再轮回）。
//   仙桃仍受单条上限。不发灵气、不发道果，不影响转世收益。
// - 时间用 Date.now()（真实时间），刷新/离线后仍按结束时间判定；系统时钟回拨超过 1 分钟则从当前时间重新计时。
// - 存档字段 state.dispatch；旧存档缺省自动补全，损坏字段被修正。
(function () {
  const root = typeof window !== 'undefined' ? window : globalThis;

  const RULES = {
    BOARD_SIZE: 4,
    UNLOCK_BEST: 5, // 首通第 5 关后开启
    DURATIONS: [2, 4, 6, 8],
    TWO_HERO_FROM_H: 6,
    TAG_BONUS: 0.25,
    TAG_BONUS_MAX_HEROES: 2,
    // 单种奖励的折算（双奖励任务每种 ×0.6）
    STONE_MIN_PER_H: 6, // 每小时任务 = 6 分钟灵石产出
    STONE_CAP_MIN: 60, // 单条最多 60 分钟灵石产出
    JADE_H_PER_H: 0.2, // 每小时任务 = 0.2 小时挂机灵玉
    JADE_CAP_H: 3, // 单条最多 3 小时挂机灵玉
    PEACH_PER_H: 0.5,
    PEACH_CAP: 5,
    DUAL_WEIGHT: 0.6,
    CLOCK_SKEW_MS: 60 * 1000
  };

  const Q_ORDER = ['fan', 'ling', 'xuan', 'di', 'tian', 'xian'];
  const Q_NAMES = { xuan: '玄品', di: '地品', tian: '天品', xian: '仙品' };

  // 悬赏模板：kinds 奖励种类；hours 可选时长；tags 可能出现的仙缘标签
  const TEMPLATES = [
    { id: 'xunshan', name: '巡山除祟', text: '山道夜有阴祟作乱，樵夫不敢上山。', kinds: ['stone'], hours: [2, 4], tags: ['jian', 'yan'] },
    { id: 'caiyao', name: '采撷灵药', text: '后山灵药初熟，需细心之人采回。', kinds: ['peach'], hours: [2, 4, 6], tags: ['yu', 'zuo'] },
    { id: 'husong', name: '护送商队', text: '坊市商队途经妖林，重金求护。', kinds: ['stone', 'jade'], hours: [4, 6, 8], tags: ['jian', 'bing'] },
    { id: 'gudong', name: '探查古洞', text: '崖下古洞灵光隐现，或有前人遗宝。', kinds: ['jade'], hours: [4, 6, 8], tags: ['ming', 'bing'] },
    { id: 'lingmai', name: '镇守灵脉', text: '灵脉躁动，需有人坐镇调和。', kinds: ['stone'], hours: [6, 8], tags: ['bing', 'yu'] },
    { id: 'xianzong', name: '寻访仙踪', text: '传闻云海深处有散仙留迹。', kinds: ['jade', 'peach'], hours: [4, 6], tags: ['ming', 'zuo'] },
    { id: 'zhanyao', name: '斩妖悬赏', text: '城外妖狐伤人，悬赏榜上挂了三日无人揭。', kinds: ['jade'], hours: [2, 4], tags: ['jian', 'yan'] },
    { id: 'lingtian', name: '照看灵田', text: '灵田逢虫灾，需人以术法驱虫护苗。', kinds: ['peach'], hours: [4, 8], tags: ['yu', 'yan'] },
    { id: 'fangshi', name: '坊市采买', text: '洞府缺些杂用之物，顺道往坊市一行。', kinds: ['stone', 'peach'], hours: [2, 4], tags: ['zuo', 'ming'] },
    { id: 'tanlu', name: '秘境探路', text: '秘境外围迷雾翻涌，需先行探明路径。', kinds: ['jade', 'stone'], hours: [6, 8], tags: ['bing', 'ming'] },
    { id: 'baiye', name: '拜谒仙门', text: '代洞府携礼拜谒邻近仙门，结一段善缘。', kinds: ['jade'], hours: [6, 8], tags: ['yu', 'zuo'] },
    { id: 'yexun', name: '夜巡古道', text: '古道常有劫修出没，夜巡以保一方安宁。', kinds: ['stone'], hours: [2, 6], tags: ['yan', 'ming'] }
  ];
  const TPL_MAP = {};
  TEMPLATES.forEach((t) => { TPL_MAP[t.id] = t; });
  const RES_NAMES = { stone: '灵石', jade: '灵玉', peach: '仙桃' };

  function cfg() { return root.GameConfig || {}; }
  function bonds() { return root.Bonds || null; }

  function mulberry32(a) {
    let t = a >>> 0;
    return function () {
      t = (t + 0x6d2b79f5) >>> 0;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function todayKey(now) {
    const d = new Date(now);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function seedBase(s) {
    return Math.floor(Number(s && s.createdAt) || 0);
  }

  // 纯函数：同一日期 + 同一存档种子 → 同一悬赏榜
  function buildBoard(dateKey, base) {
    const rng = mulberry32(hashStr(`dispatch|${dateKey}|${base}`));
    const pool = TEMPLATES.slice();
    const board = [];
    for (let i = 0; i < RULES.BOARD_SIZE && pool.length; i++) {
      const idx = Math.floor(rng() * pool.length);
      const tpl = pool.splice(idx, 1)[0];
      const h = tpl.hours[Math.floor(rng() * tpl.hours.length)];
      const tag = tpl.tags[Math.floor(rng() * tpl.tags.length)];
      const qr = rng();
      // 约 1/4 要求地品以上，约 1/8 要求天品以上（未上阵的 10 人中地品以上至少 7 人、天品以上至少 3 人）
      const minQ = qr < 0.125 ? 'tian' : qr < 0.375 ? 'di' : null;
      board.push({
        slot: i,
        tpl: tpl.id,
        h,
        need: h >= RULES.TWO_HERO_FROM_H ? 2 : 1,
        tag,
        minQ,
        taken: false
      });
    }
    return board;
  }

  function defaults() {
    return { v: 1, date: '', board: [], active: [], seq: 0, total: 0 };
  }

  function validHeroIds(arr) {
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string' && x).slice(0, 2) : [];
  }

  function normalizeMission(m) {
    if (!m || typeof m !== 'object' || !TPL_MAP[m.tpl]) return null;
    const h = RULES.DURATIONS.includes(Number(m.h)) ? Number(m.h) : null;
    if (!h) return null;
    return { h, need: h >= RULES.TWO_HERO_FROM_H ? 2 : 1, tag: typeof m.tag === 'string' ? m.tag : TPL_MAP[m.tpl].tags[0], minQ: m.minQ === 'di' || m.minQ === 'tian' ? m.minQ : null };
  }

  // 只拷贝展示/快照用的奖励数字，不改结算。
  function copyReward(raw) {
    const reward = {};
    if (!raw || typeof raw !== 'object') return reward;
    ['stone', 'jade', 'peach'].forEach((k) => {
      const n = Math.floor(Number(raw[k]) || 0);
      if (n > 0) reward[k] = n;
    });
    return reward;
  }

  function pinBoardSnapshot(b, reward) {
    if (!b) return;
    const snap = copyReward(reward);
    if (Object.keys(snap).length) b.reward = snap;
    else delete b.reward;
  }

  function rewardIsCapped(shown, locked) {
    const a = shown || {};
    const b = locked || {};
    return ['stone', 'jade', 'peach'].some((k) => (Number(a[k]) || 0) < (Number(b[k]) || 0));
  }

  function normalize(raw) {
    const out = defaults();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    out.date = typeof raw.date === 'string' ? raw.date : '';
    out.seq = Math.max(0, Math.floor(Number(raw.seq) || 0));
    out.total = Math.max(0, Math.floor(Number(raw.total) || 0));
    if (Array.isArray(raw.board)) {
      raw.board.forEach((b, i) => {
        const m = normalizeMission(b);
        if (m && out.board.length < RULES.BOARD_SIZE) {
          const row = Object.assign({ slot: Number.isInteger(b.slot) ? b.slot : i, tpl: b.tpl }, m, { taken: Boolean(b.taken) });
          if (b.claimed) row.claimed = true;
          if (b.capped) row.capped = true;
          pinBoardSnapshot(row, b.reward);
          out.board.push(row);
        }
      });
    }
    if (Array.isArray(raw.active)) {
      const used = new Set();
      raw.active.forEach((a) => {
        const m = normalizeMission(a);
        if (!m) return;
        const heroes = [];
        (Array.isArray(a.heroes) ? a.heroes : []).forEach((id) => {
          if (typeof id === 'string' && id && !used.has(id) && !heroes.includes(id) && heroes.length < m.need) heroes.push(id);
        });
        const startAt = Number(a.startAt);
        if (!heroes.length || !Number.isFinite(startAt)) return;
        heroes.forEach((id) => used.add(id));
        const reward = copyReward(a.reward);
        const recRaw = a.reincarnationCount;
        const recSnap = (recRaw == null || recRaw === '') ? null : Math.floor(Number(recRaw));
        const row = Object.assign({
          id: typeof a.id === 'string' ? a.id : `d${out.seq++}`,
          tpl: a.tpl,
          date: typeof a.date === 'string' ? a.date : '',
          slot: Number.isInteger(a.slot) ? a.slot : -1,
          heroes,
          matched: Math.max(0, Math.min(2, Math.floor(Number(a.matched) || 0))),
          startAt,
          endAt: startAt + m.h * 3600 * 1000,
          reward
        }, m);
        if (Number.isFinite(recSnap) && recSnap >= 0) row.reincarnationCount = recSnap;
        out.active.push(row);
      });
    }
    return out;
  }

  // 原地补全/修复 state.dispatch，并在跨日时刷新悬赏榜
  function ensureState(s, now) {
    const t = Number(now) || Date.now();
    const d = normalize(s.dispatch);
    const day = todayKey(t);
    if (d.date !== day || d.board.length !== RULES.BOARD_SIZE) {
      d.date = day;
      d.board = buildBoard(day, seedBase(s));
      // 今日已派出（未领取或已领取）的任务在当日刷新时仍记为已接
      d.active.forEach((a) => {
        if (a.date === day && d.board[a.slot] && d.board[a.slot].tpl === a.tpl) d.board[a.slot].taken = true;
      });
    }
    // 时钟回拨保护
    d.active.forEach((a) => {
      if (a.startAt > t + RULES.CLOCK_SKEW_MS) {
        a.startAt = t;
        a.endAt = t + a.h * 3600 * 1000;
      }
    });
    if (s.dispatch && typeof s.dispatch === 'object' && !Array.isArray(s.dispatch)) {
      Object.keys(s.dispatch).forEach((k) => { if (!(k in d)) delete s.dispatch[k]; });
      Object.assign(s.dispatch, d);
      return s.dispatch;
    }
    s.dispatch = d;
    return d;
  }

  function bestStage(s) {
    return Math.max(0, Number(s && s.stage && s.stage.best) || 0);
  }

  function isUnlocked(s) {
    return bestStage(s) >= RULES.UNLOCK_BEST;
  }

  function heroList() {
    return (cfg().HEROES || []).filter((h) => h && h.id);
  }

  function heroById(id) {
    return heroList().find((h) => h.id === id) || null;
  }

  function isHeroUnlocked(s, id) {
    const B = root.Battle;
    if (B && typeof B.isHeroUnlocked === 'function') return B.isHeroUnlocked(id, s);
    const h = heroById(id);
    return Boolean(h && !h.locked);
  }

  function squadIds(s) {
    const B = root.Battle;
    if (B && typeof B.getSquadIds === 'function') return B.getSquadIds(s);
    return Array.isArray(s.squad) ? s.squad.slice() : [];
  }

  function busyIds(s) {
    const d = s.dispatch && Array.isArray(s.dispatch.active) ? s.dispatch.active : [];
    const out = [];
    d.forEach((a) => (a.heroes || []).forEach((id) => out.push(id)));
    return out;
  }

  function busyMission(s, heroId) {
    const d = s.dispatch && Array.isArray(s.dispatch.active) ? s.dispatch.active : [];
    return d.find((a) => (a.heroes || []).includes(heroId)) || null;
  }

  function isBusy(s, heroId) {
    return Boolean(busyMission(s, heroId));
  }

  function qRank(q) {
    const i = Q_ORDER.indexOf(q);
    return i < 0 ? 0 : i;
  }

  function meetsQuality(heroId, minQ) {
    if (!minQ) return true;
    const h = heroById(heroId);
    return Boolean(h) && qRank(h.quality) >= qRank(minQ);
  }

  function tagsOf(heroId) {
    const Bd = bonds();
    return Bd ? Bd.tagsOf(heroId) : [];
  }

  // 可派遣的仙姬：已解锁、不在出战队伍、未在派遣中
  function availableHeroes(s) {
    const squad = new Set(squadIds(s));
    const busy = new Set(busyIds(s));
    return heroList().filter((h) => isHeroUnlocked(s, h.id) && !squad.has(h.id) && !busy.has(h.id)).map((h) => h.id);
  }

  function jadeRate(s) {
    return 6 + 0.4 * bestStage(s);
  }

  function stonePerSec(s, env) {
    const e = env || {};
    if (Number.isFinite(Number(e.stonePerSec))) return Math.max(0, Number(e.stonePerSec));
    const GS = root.GameState;
    return GS && typeof GS.getStonePerSec === 'function' ? Math.max(0, GS.getStonePerSec()) : 0;
  }

  function countMatched(mission, heroIds) {
    return Math.min(RULES.TAG_BONUS_MAX_HEROES, heroIds.filter((id) => tagsOf(id).includes(mission.tag)).length);
  }

  // 奖励报价。env: { stonePerSec }
  function quote(s, mission, heroIds, env) {
    const tpl = TPL_MAP[mission.tpl];
    const ids = validHeroIds(heroIds);
    const matched = countMatched(mission, ids);
    const mult = 1 + RULES.TAG_BONUS * matched;
    const w = tpl.kinds.length > 1 ? RULES.DUAL_WEIGHT : 1;
    const h = mission.h;
    const reward = {};
    const sps = stonePerSec(s, env);
    tpl.kinds.forEach((k) => {
      if (k === 'stone') {
        const min = Math.min(RULES.STONE_CAP_MIN, RULES.STONE_MIN_PER_H * h * w * mult);
        reward.stone = Math.max(1, Math.round(sps * 60 * min));
      } else if (k === 'jade') {
        const hrs = Math.min(RULES.JADE_CAP_H, RULES.JADE_H_PER_H * h * w * mult);
        reward.jade = Math.max(1, Math.round(jadeRate(s) * hrs));
      } else if (k === 'peach') {
        reward.peach = Math.max(1, Math.min(RULES.PEACH_CAP, Math.round(RULES.PEACH_PER_H * h * w * mult)));
      }
    });
    return { reward, matched, mult };
  }

  function checkHeroes(s, mission, heroIds) {
    const ids = validHeroIds(heroIds);
    if (new Set(ids).size !== ids.length) return { ok: false, reason: 'duplicate', message: '同一仙姬不能重复派遣' };
    if (ids.length !== mission.need) return { ok: false, reason: 'count', message: `需派遣 ${mission.need} 名仙姬` };
    const avail = new Set(availableHeroes(s));
    const squad = new Set(squadIds(s));
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (!isHeroUnlocked(s, id)) return { ok: false, reason: 'locked', message: '该仙姬尚未解锁' };
      if (squad.has(id)) return { ok: false, reason: 'in_squad', message: '出战中的仙姬不能派遣' };
      if (isBusy(s, id)) return { ok: false, reason: 'busy', message: '该仙姬正在派遣中' };
      if (!avail.has(id)) return { ok: false, reason: 'unavailable', message: '该仙姬暂不可派遣' };
    }
    if (mission.minQ && !ids.some((id) => meetsQuality(id, mission.minQ))) {
      return { ok: false, reason: 'quality', message: `需至少 1 名${Q_NAMES[mission.minQ]}及以上仙姬` };
    }
    return { ok: true, ids };
  }

  function start(s, slot, heroIds, env) {
    const e = env || {};
    const now = Number(e.now) || Date.now();
    if (!isUnlocked(s)) return { ok: false, reason: 'locked_feature', message: `首通第 ${RULES.UNLOCK_BEST} 关后开启` };
    const d = ensureState(s, now);
    const mission = d.board.find((b) => b.slot === slot);
    if (!mission) return { ok: false, reason: 'bad_slot', message: '悬赏不存在' };
    if (mission.taken) return { ok: false, reason: 'taken', message: '该悬赏今日已接' };
    const chk = checkHeroes(s, mission, heroIds);
    if (!chk.ok) return chk;
    const q = quote(s, mission, chk.ids, e);
    const a = {
      id: `d${d.seq++}`,
      tpl: mission.tpl,
      date: d.date,
      slot: mission.slot,
      heroes: chk.ids.slice(),
      matched: q.matched,
      startAt: now,
      endAt: now + mission.h * 3600 * 1000,
      reward: q.reward,
      h: mission.h,
      need: mission.need,
      tag: mission.tag,
      minQ: mission.minQ,
      reincarnationCount: reincarnationCountOf(s)
    };
    d.active.push(a);
    mission.taken = true;
    delete mission.claimed;
    pinBoardSnapshot(mission, q.reward);
    return { ok: true, mission: a };
  }

  function isDone(a, now) {
    return (Number(now) || Date.now()) >= a.endAt;
  }

  function remainingMs(a, now) {
    return Math.max(0, a.endAt - (Number(now) || Date.now()));
  }

  function reincarnationCountOf(s) {
    return Math.max(0, Math.floor(Number(s && s.reincarnationCount) || 0));
  }

  // 仅当领取时轮回次数 > 派出时记下的 reincarnationCount，才对灵石/灵玉按今生产出封顶。
  // 旧任务没有该字段时不封顶（视为派出后未再轮回）。仙桃始终受 PEACH_CAP。
  function shouldCapAfterReincarnation(s, a) {
    if (!a || a.reincarnationCount == null || a.reincarnationCount === '') return false;
    const snapped = Math.floor(Number(a.reincarnationCount));
    if (!Number.isFinite(snapped) || snapped < 0) return false;
    return reincarnationCountOf(s) > snapped;
  }

  function claimReward(s, a, env) {
    const r = Object.assign({}, a.reward);
    if (shouldCapAfterReincarnation(s, a)) {
      if (r.stone) {
        const cap = Math.max(1, Math.round(stonePerSec(s, env) * 60 * RULES.STONE_CAP_MIN));
        r.stone = Math.min(r.stone, cap);
      }
      if (r.jade) r.jade = Math.min(r.jade, Math.max(1, Math.round(jadeRate(s) * RULES.JADE_CAP_H)));
    }
    if (r.peach) r.peach = Math.min(r.peach, RULES.PEACH_CAP);
    const bonus = root.Karma && typeof root.Karma.dispatchYieldBonus === 'function'
      ? root.Karma.dispatchYieldBonus(s, (env && env.now) || Date.now())
      : 0;
    if (bonus > 0) {
      if (r.stone) r.stone = Math.max(1, Math.round(r.stone * (1 + bonus)));
      if (r.jade) r.jade = Math.max(1, Math.round(r.jade * (1 + bonus)));
      if (r.peach) r.peach = Math.max(1, Math.min(RULES.PEACH_CAP, Math.round(r.peach * (1 + bonus))));
    }
    return r;
  }

  function claim(s, id, env) {
    const e = env || {};
    const now = Number(e.now) || Date.now();
    const d = ensureState(s, now);
    const idx = d.active.findIndex((a) => a.id === id);
    if (idx < 0) return { ok: false, reason: 'not_found' };
    const a = d.active[idx];
    if (!isDone(a, now)) return { ok: false, reason: 'not_ready', remainingMs: remainingMs(a, now) };
    const r = claimReward(s, a, e);
    if (r.stone) s.stones = (Number(s.stones) || 0) + r.stone;
    if (r.jade) s.lingyu = (Number(s.lingyu) || 0) + r.jade;
    if (r.peach) {
      if (!s.tree || typeof s.tree !== 'object') s.tree = {};
      s.tree.peaches = (Number(s.tree.peaches) || 0) + r.peach;
    }
    d.active.splice(idx, 1);
    d.total += 1;
    if (a.date === d.date) {
      const b = d.board.find((x) => x.slot === a.slot && x.tpl === a.tpl);
      if (b) {
        b.taken = true;
        b.claimed = true;
        pinBoardSnapshot(b, r);
        if (rewardIsCapped(r, a.reward)) b.capped = true;
        else delete b.capped;
      }
    }
    return { ok: true, mission: a, reward: r };
  }

  function claimAll(s, env) {
    const e = env || {};
    const now = Number(e.now) || Date.now();
    const d = ensureState(s, now);
    const sum = { stone: 0, jade: 0, peach: 0 };
    let n = 0;
    d.active.filter((a) => isDone(a, now)).map((a) => a.id).forEach((id) => {
      const res = claim(s, id, Object.assign({}, e, { now }));
      if (res.ok) {
        n++;
        Object.keys(res.reward).forEach((k) => { sum[k] += res.reward[k]; });
      }
    });
    return { ok: n > 0, count: n, reward: sum };
  }

  // 召回：不发奖励；当日悬赏可重新接取
  function recall(s, id, env) {
    const now = Number((env || {}).now) || Date.now();
    const d = ensureState(s, now);
    const idx = d.active.findIndex((a) => a.id === id);
    if (idx < 0) return { ok: false, reason: 'not_found' };
    const a = d.active[idx];
    if (isDone(a, now)) return { ok: false, reason: 'already_done' };
    d.active.splice(idx, 1);
    if (a.date === d.date) {
      const b = d.board.find((x) => x.slot === a.slot && x.tpl === a.tpl);
      if (b) {
        b.taken = false;
        delete b.claimed;
        delete b.reward;
        delete b.capped;
      }
    }
    return { ok: true, mission: a };
  }

  function summary(s, now) {
    const t = Number(now) || Date.now();
    const d = ensureState(s, t);
    const done = d.active.filter((a) => isDone(a, t)).length;
    return {
      unlocked: isUnlocked(s),
      running: d.active.length - done,
      done,
      open: d.board.filter((b) => !b.taken).length,
      nextEnd: d.active.filter((a) => !isDone(a, t)).reduce((m, a) => Math.min(m, a.endAt), Infinity)
    };
  }

  // 奖励在派出时写入快照并记下 reincarnationCount；仅轮回后领取才按今生产出封顶。
  const SETTLEMENT_HINT = '按派出时锁定（轮回后按今生产出封顶）';

  function hasClaimable(s, now) {
    return summary(s, now).done > 0;
  }

  const core = {
    RULES, TEMPLATES, TPL_MAP, RES_NAMES, Q_NAMES, SETTLEMENT_HINT,
    todayKey, buildBoard, normalize, ensureState, isUnlocked,
    availableHeroes, busyIds, busyMission, isBusy, meetsQuality, countMatched,
    quote, checkHeroes, start, claim, claimAll, recall, isDone, remainingMs, summary, claimReward, hasClaimable
  };
  root.Dispatch = core;
  if (typeof module !== 'undefined' && module.exports) module.exports = core;

  // ===================== 界面（仅浏览器） =====================
  if (typeof document === 'undefined' || !document.getElementById) return;

  const fmt = (n) => (cfg().formatNumber ? cfg().formatNumber(n) : String(Math.round(n)));
  const ICONS = { stone: 'res_stone', jade: 'res_lingyu', peach: 'res_peach' };
  let els = null;
  let view = 'board';
  let pickSlot = -1;
  let picked = [];
  let flash = '';
  let lastSummaryHtml = '';

  function env() {
    return { now: Date.now() };
  }

  function fmtLeft(ms) {
    const sec = Math.ceil(ms / 1000);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const ss = sec % 60;
    if (h > 0) return `${h}时${String(m).padStart(2, '0')}分`;
    if (m > 0) return `${m}分${String(ss).padStart(2, '0')}秒`;
    return `${ss}秒`;
  }

  function resLine(map) {
    return ['stone', 'jade', 'peach']
      .filter((k) => map[k] > 0)
      .map((k) => `<span class="evt-res"><img class="gi gi-12" src="assets/icons/${ICONS[k]}@64.webp?v=18" alt="" aria-hidden="true">${RES_NAMES[k]} +${fmt(map[k])}</span>`)
      .join('');
  }

  function tagName(tag) {
    const Bd = bonds();
    return Bd && Bd.BOND_MAP[tag] ? Bd.BOND_MAP[tag].name : tag;
  }

  function heroName(id) {
    const h = heroById(id);
    return (h && h.name) || id;
  }

  function reqLine(m) {
    const parts = [`${m.h} 小时`, `${m.need} 人`];
    if (m.minQ) parts.push(`需 ${Q_NAMES[m.minQ]}+`);
    return parts.join(' · ');
  }

  // 洞府场景右上角的「派遣」按钮：未开启时隐藏；有可领取时亮红点并显示数量
  function renderSummary() {
    if (!els) return;
    const s = root.GameState.state;
    const unlocked = isUnlocked(s);
    els.openBtn.hidden = !unlocked;
    if (!unlocked) return;
    const sm = summary(s);
    let text = '派遣';
    let label = `仙姬派遣：今日悬赏剩 ${sm.open}/${RULES.BOARD_SIZE}`;
    if (sm.done) {
      text = `可领 ${sm.done}`;
      label = `仙姬派遣：${sm.done} 条可领取`;
    } else if (sm.running) {
      text = `派遣 ${fmtLeftShort(sm.nextEnd - Date.now())}`;
      label = `仙姬派遣：${sm.running} 条进行中`;
    } else if (sm.open) {
      text = `派遣 ${sm.open}`;
    }
    const key = `${text}|${label}|${sm.done > 0}`;
    if (key !== lastSummaryHtml) {
      lastSummaryHtml = key;
      els.summary.textContent = text;
      els.openBtn.setAttribute('aria-label', label);
      els.openBtn.classList.toggle('has-ready', sm.done > 0);
      if (els.badge) els.badge.classList.toggle('visible', sm.done > 0);
      const tabBadge = document.getElementById('badge-upgrade');
      if (tabBadge) tabBadge.classList.toggle('is-dispatch-claim', sm.done > 0);
    }
  }

  function fmtLeftShort(ms) {
    const min = Math.max(1, Math.ceil(ms / 60000));
    return min >= 60 ? `${Math.floor(min / 60)}时${String(min % 60).padStart(2, '0')}` : `${min}分`;
  }

  function heroChip(id) {
    const h = heroById(id);
    const av = h && (h.avatar || h.img);
    return `<span class="dispatch-hero-chip">${av ? `<img src="${av}" alt="" aria-hidden="true">` : ''}${heroName(id)}</span>`;
  }

  function renderBoard() {
    const s = root.GameState.state;
    const now = Date.now();
    const d = ensureState(s, now);
    let html = '';
    if (flash) html += `<div class="dispatch-flash">${flash}</div>`;
    if (d.active.length) {
      html += '<div class="dispatch-section-title">派遣中</div>';
      d.active.forEach((a) => {
        const tpl = TPL_MAP[a.tpl];
        const done = isDone(a, now);
        const r = claimReward(s, a, {});
        html += `
          <div class="dispatch-mission is-active${done ? ' is-done' : ''}">
            <div class="dispatch-mission-head"><span class="dispatch-mission-name">${tpl.name}</span><span class="dispatch-mission-time">${done ? '已完成' : `剩余 ${fmtLeft(remainingMs(a, now))}`}</span></div>
            <div class="dispatch-mission-heroes">${a.heroes.map(heroChip).join('')}</div>
            <div class="evt-option-line evt-reward">${resLine(r)}${a.matched ? `<span class="dispatch-bonus">仙缘 +${Math.round(a.matched * RULES.TAG_BONUS * 100)}%</span>` : ''}</div>
            <div class="dispatch-settle-hint">${SETTLEMENT_HINT}</div>
            <div class="dispatch-mission-actions">${done
              ? `<button type="button" class="btn btn-primary btn-sm" data-dispatch-claim="${a.id}">领取</button>`
              : `<button type="button" class="btn btn-sm" data-dispatch-recall="${a.id}">召回</button>`}</div>
          </div>`;
      });
    }
    html += `<div class="dispatch-section-title">今日悬赏 <span class="dispatch-section-sub">每日 0 点刷新 · 仅可派未上阵的仙姬</span></div>`;
    d.board.forEach((b) => {
      const tpl = TPL_MAP[b.tpl];
      const active = d.active.find((a) => a.slot === b.slot && a.tpl === b.tpl);
      const taken = Boolean(b.taken || active);
      const claimed = Boolean(b.claimed) || (taken && !active);
      let rewardHtml;
      let actionHtml;
      if (taken) {
        // 在途与「派遣中」一致，用 claimReward（轮回后按今生产出封顶）；已领展示实发数。
        const locked = (active && active.reward) || null;
        const shown = active
          ? claimReward(s, active, {})
          : (b.reward || null);
        const capped = active ? rewardIsCapped(shown, locked) : Boolean(b.capped);
        const status = claimed ? '已领取' : '已派出';
        rewardHtml = `${shown ? resLine(shown) : ''}${capped ? '<span class="dispatch-capped">已封顶</span>' : ''}`;
        actionHtml = `<span class="dispatch-taken">${status}</span>`;
      } else {
        const preview = quote(s, b, [], {});
        rewardHtml = `${resLine(preview.reward)}<span class="bond-tag bond-${b.tag}">${tagName(b.tag)}</span><span class="dispatch-bonus-hint">基础价，不含仙缘加成</span>`;
        actionHtml = `<button type="button" class="btn btn-sm" data-dispatch-pick="${b.slot}">选人派遣</button>`;
      }
      html += `
        <div class="dispatch-mission${taken ? ' is-taken' : ''}${claimed ? ' is-claimed' : ''}">
          <div class="dispatch-mission-head"><span class="dispatch-mission-name">${tpl.name}</span><span class="dispatch-mission-req">${reqLine(b)}</span></div>
          <div class="dispatch-mission-text">${tpl.text}</div>
          <div class="evt-option-line evt-reward">${rewardHtml}</div>
          <div class="dispatch-mission-actions">${actionHtml}</div>
        </div>`;
    });
    els.body.innerHTML = html;
    const anyDone = d.active.some((a) => isDone(a, now));
    els.actions.innerHTML = `${anyDone ? '<button type="button" class="btn btn-primary" data-dispatch-claimall="1">全部领取</button>' : ''}<button type="button" class="btn" data-dispatch-close="1">关闭</button>`;
  }

  function renderPick() {
    const s = root.GameState.state;
    const d = ensureState(s);
    const b = d.board.find((x) => x.slot === pickSlot);
    if (!b || b.taken) {
      view = 'board';
      renderBoard();
      return;
    }
    const tpl = TPL_MAP[b.tpl];
    const avail = availableHeroes(s);
    picked = picked.filter((id) => avail.includes(id));
    const q = quote(s, b, picked, {});
    const chk = checkHeroes(s, b, picked);
    let html = `
      <div class="dispatch-mission is-picking">
        <div class="dispatch-mission-head"><span class="dispatch-mission-name">${tpl.name}</span><span class="dispatch-mission-req">${reqLine(b)}</span></div>
        <div class="dispatch-mission-text">${tpl.text}</div>
        <div class="evt-option-line evt-reward">预计 ${resLine(q.reward)}<span class="bond-tag bond-${b.tag}">${tagName(b.tag)}</span>${q.matched ? `<span class="dispatch-bonus">+${Math.round(q.matched * RULES.TAG_BONUS * 100)}%</span>` : '<span class="dispatch-bonus-hint">带该标签仙姬每人 +25%</span>'}</div>
      </div>
      <div class="dispatch-section-title">选择 ${b.need} 名仙姬 <span class="dispatch-section-sub">已选 ${picked.length}/${b.need}</span></div>`;
    if (!avail.length) {
      html += '<div class="dispatch-empty">没有可派遣的仙姬：出战队伍与派遣中的仙姬不可再派。</div>';
    }
    html += '<div class="dispatch-hero-grid">';
    avail.forEach((id) => {
      const h = heroById(id);
      const sel = picked.includes(id);
      const qOk = meetsQuality(id, b.minQ);
      const tags = tagsOf(id).map((t) => `<span class="bond-tag bond-${t}${t === b.tag ? ' is-match' : ''}">${tagName(t)}</span>`).join('');
      html += `
        <button type="button" class="dispatch-hero${sel ? ' is-selected' : ''}${b.minQ && !qOk ? ' is-lowq' : ''}" data-dispatch-hero="${id}" aria-pressed="${sel}">
          ${h.avatar ? `<img class="dispatch-hero-avatar" src="${h.avatar}" alt="" aria-hidden="true">` : ''}
          <span class="dispatch-hero-name">${h.name}</span>
          <span class="bond-tags">${tags}</span>
        </button>`;
    });
    html += '</div>';
    if (picked.length === b.need && !chk.ok) html += `<div class="dispatch-flash is-warn">${chk.message}</div>`;
    els.body.innerHTML = html;
    els.actions.innerHTML = `<button type="button" class="btn" data-dispatch-back="1">返回</button><button type="button" class="btn btn-primary" data-dispatch-go="1"${chk.ok ? '' : ' disabled'}>派遣（${picked.length}/${b.need}）</button>`;
  }

  function render() {
    if (!els) return;
    if (view === 'pick') renderPick();
    else renderBoard();
  }

  function isOpen() {
    return Boolean(els && els.modal.classList.contains('active'));
  }

  function open() {
    if (!els) return false;
    const s = root.GameState.state;
    if (!isUnlocked(s)) return false;
    view = 'board';
    flash = '';
    render();
    els.modal.classList.add('active');
    els.modal.setAttribute('aria-hidden', 'false');
    return true;
  }

  function close() {
    if (!els) return;
    els.modal.classList.remove('active');
    els.modal.setAttribute('aria-hidden', 'true');
    view = 'board';
    picked = [];
    renderSummary();
  }

  function save() {
    if (root.GameState && typeof root.GameState.saveGame === 'function') root.GameState.saveGame();
  }

  function onBodyClick(e) {
    const t = e.target && e.target.closest ? e.target.closest('button') : null;
    if (!t || t.disabled) return;
    const s = root.GameState.state;
    const ds = t.dataset || {};
    if (ds.dispatchPick !== undefined) {
      pickSlot = Number(ds.dispatchPick);
      picked = [];
      view = 'pick';
    } else if (ds.dispatchHero) {
      const id = ds.dispatchHero;
      const b = ensureState(s).board.find((x) => x.slot === pickSlot);
      if (picked.includes(id)) picked = picked.filter((x) => x !== id);
      else if (b && picked.length < b.need) picked.push(id);
      else if (b && b.need === 1) picked = [id];
    } else if (ds.dispatchBack) {
      view = 'board';
      flash = '';
    } else if (ds.dispatchGo) {
      const res = start(s, pickSlot, picked, env());
      if (res.ok) {
        save();
        flash = `【${TPL_MAP[res.mission.tpl].name}】已派出：${res.mission.heroes.map(heroName).join('、')}，${res.mission.h} 小时后归来`;
        view = 'board';
        picked = [];
      } else {
        flash = res.message || '派遣失败';
      }
    } else if (ds.dispatchClaim) {
      const res = claim(s, ds.dispatchClaim, env());
      if (res.ok) {
        save();
        flash = `【${TPL_MAP[res.mission.tpl].name}】归来，获得 ${resLine(res.reward)}`;
      }
    } else if (ds.dispatchClaimall) {
      const res = claimAll(s, env());
      if (res.ok) {
        save();
        flash = `${res.count} 条悬赏归来，获得 ${resLine(res.reward)}`;
      }
    } else if (ds.dispatchRecall) {
      const res = recall(s, ds.dispatchRecall, env());
      if (res.ok) {
        save();
        flash = `已召回 ${res.mission.heroes.map(heroName).join('、')}（本次无奖励，悬赏可重新接取）`;
      }
    } else if (ds.dispatchClose) {
      close();
      return;
    } else {
      return;
    }
    render();
    renderSummary();
  }

  function tick() {
    const GS = root.GameState;
    if (!els || !GS || !GS.state) return;
    renderSummary();
    if (isOpen() && view === 'board') render();
  }

  function init() {
    els = {
      badge: document.getElementById('badge-dispatch'),
      summary: document.getElementById('dispatch-summary'),
      openBtn: document.getElementById('btn-dispatch-open'),
      modal: document.getElementById('dispatch-modal'),
      body: document.getElementById('dispatch-modal-body'),
      actions: document.getElementById('dispatch-modal-actions'),
      close: document.getElementById('btn-dispatch-close')
    };
    if (!els.summary || !els.openBtn || !els.modal || !els.body || !root.GameState) {
      els = null;
      return;
    }
    els.openBtn.addEventListener('click', open);
    els.close.addEventListener('click', close);
    els.modal.addEventListener('click', (e) => {
      if (e.target === els.modal) close();
    });
    els.body.addEventListener('click', onBodyClick);
    els.actions.addEventListener('click', onBodyClick);
    document.addEventListener('keydown', (e) => {
      if (e && e.key === 'Escape' && isOpen()) close();
    });
    tick();
    setInterval(tick, 1000);
  }

  core.ui = { open, close, render, renderSummary, isOpen, tick, init, _state: () => ({ view, pickSlot, picked: picked.slice(), flash }) };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
