// 自动回合制战斗内核（B1）：敌人生成、属性汇总、mulberry32 种子模拟、胜率预估与首通奖励。
(function () {
  const root = typeof window !== 'undefined' ? window : globalThis;

  function cfg() {
    if (root.GameConfig) return root.GameConfig;
    if (typeof window !== 'undefined' && window.GameConfig) return window.GameConfig;
    return null;
  }

  function mulberry32(seed) {
    let a = (seed === undefined || seed === null ? Date.now() : seed) >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function enemyFor(n) {
    const stageNum = Math.max(1, Math.floor(n || 1));
    const B = cfg().BATTLE;
    const chapter = Math.floor((stageNum - 1) / 10) + 1;
    const stageInChapter = ((stageNum - 1) % 10) + 1;
    const isBoss = stageNum % 10 === 0;
    const regionIdx = Math.min(B.REGIONS.length - 1, Math.floor((chapter - 1) / 5));
    const regionObj = B.REGIONS[regionIdx];
    const mobs = regionObj.mobs || [];
    const entry = isBoss
      ? B.BOSSES[Math.min(B.BOSSES.length - 1, chapter - 1)]
      : mobs[(stageNum - 1) % mobs.length];
    const name = entry && typeof entry === 'object' ? entry.name : entry;
    const img = entry && typeof entry === 'object' ? entry.img : '';
    const cp = B.BASE_CP * Math.pow(B.GROWTH, stageNum - 1) * (isBoss ? B.BOSS_MULT : 1);
    return {
      n: stageNum,
      chapter,
      stageInChapter,
      region: regionObj.name,
      name,
      img,
      isBoss,
      cp,
      atk: cp * B.SPLIT.atk,
      hp: cp * B.SPLIT.hp,
      def: cp * B.SPLIT.def,
      spd: 100 + 0.5 * stageNum,
      crit: 0.05,
      critDmg: 1.5,
      cd: 1.5
    };
  }

  function playerStats(state) {
    if (state && typeof state.atk === 'number' && typeof state.hp === 'number' && !state.equip) {
      const cd = state.critDmg || state.cd || 1.5;
      const crit = state.crit != null ? state.crit : 0.05;
      const cp =
        state.cp != null
          ? state.cp
          : (state.atk * 10 + state.hp + state.def * 8 + state.spd * 2) * (1 + crit * (cd - 1));
      return {
        atk: state.atk,
        hp: state.hp,
        def: state.def,
        spd: state.spd,
        crit,
        critDmg: cd,
        cd,
        cp
      };
    }
    const E = root.Equip || (typeof window !== 'undefined' && window.Equip);
    const T = root.Titles || (typeof window !== 'undefined' && window.Titles);
    const attr = E.attributes(state);
    const mult = T && typeof T.factor === 'function' ? T.factor(state, 'cp') : 1;
    const atk = attr.atk * mult;
    const hp = attr.hp * mult;
    const def = attr.def * mult;
    const spd = attr.spd;
    const crit = attr.crit;
    const critDmg = attr.critDmg;
    const cp = (atk * 10 + hp + def * 8 + spd * 2) * (1 + crit * (critDmg - 1));
    return { atk, hp, def, spd, crit, critDmg, cd: critDmg, cp };
  }

  function simulate(a, b, seed) {
    const B = cfg() && cfg().BATTLE;
    const maxRounds = (B && B.MAX_ROUNDS) || 20;
    const rng = mulberry32(seed);
    let ha = a.hp;
    let hb = b.hp;
    const events = [];

    function rollHit(attacker, defender) {
      const cd = attacker.critDmg || attacker.cd || 1.5;
      const critChance = attacker.crit != null ? attacker.crit : 0.05;
      let d = ((attacker.atk * attacker.atk) / (attacker.atk + defender.def)) * (0.95 + rng() * 0.1);
      const crit = rng() < critChance;
      if (crit) d *= cd;
      return { dmg: d, crit };
    }

    for (let t = 1; t <= maxRounds; t++) {
      const order =
        a.spd >= b.spd
          ? [
              [a, b, true],
              [b, a, false]
            ]
          : [
              [b, a, false],
              [a, b, true]
            ];
      for (let i = 0; i < order.length; i++) {
        const [x, y, isA] = order[i];
        const hits = x.spd >= 2 * y.spd ? 2 : 1;
        for (let k = 0; k < hits; k++) {
          const res = rollHit(x, y);
          if (isA) {
            hb -= res.dmg;
          } else {
            ha -= res.dmg;
          }
          events.push({
            t,
            who: isA ? 'a' : 'b',
            dmg: Math.max(1, Math.round(res.dmg)),
            crit: res.crit,
            hpA: Math.max(0, Math.round(ha)),
            hpB: Math.max(0, Math.round(hb))
          });
          if (hb <= 0) {
            return { win: true, rounds: t, events };
          }
          if (ha <= 0) {
            return { win: false, rounds: t, events };
          }
        }
      }
    }
    return { win: false, rounds: maxRounds, timeout: true, events };
  }

  function winRate(state, n, runs = 100) {
    const total = Math.max(1, Math.floor(runs || 100));
    const p = playerStats(state);
    const e = typeof n === 'object' && n !== null ? n : enemyFor(n);
    let wins = 0;
    for (let i = 0; i < total; i++) {
      if (simulate(p, e, i + 1).win) wins += 1;
    }
    return wins / total;
  }

  function winRateLabel(rate) {
    const pct = rate <= 1 ? rate * 100 : rate;
    if (pct >= 95) return '必胜';
    if (pct >= 60) return '大概率胜';
    if (pct >= 40) return '五五开';
    if (pct >= 10) return '凶险';
    return '不敌';
  }

  function firstClearReward(state, n) {
    const stageNum = Math.max(1, Math.floor(n || 1));
    const isBoss = stageNum % 10 === 0;
    const baseJade = 2 + Math.floor(stageNum / 10);
    const peaches = isBoss ? 5 : 1;
    const lingyu = isBoss ? baseJade * 5 : baseJade;
    const GS = root.GameState || (typeof window !== 'undefined' && window.GameState);
    const stonePerSec = GS && typeof GS.getStonePerSec === 'function' ? GS.getStonePerSec() : 0;
    const qiPerSec = GS && typeof GS.getQiPerSec === 'function' ? GS.getQiPerSec() : 0;
    const stones = Math.round(stonePerSec * (isBoss ? 300 : 60));
    const qi = Math.round(qiPerSec * (isBoss ? 150 : 30));
    return { peaches, lingyu, stones, qi, isBoss };
  }

  const Battle = {
    mulberry32,
    enemyFor,
    playerStats,
    simulate,
    winRate,
    winRateLabel,
    firstClearReward
  };

  root.Battle = Battle;
  if (typeof window !== 'undefined') window.Battle = Battle;
  if (typeof module !== 'undefined' && module.exports) module.exports = Battle;
})();

