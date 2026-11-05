// 自走棋战斗内核：阵容生成、布阵校验、mulberry32 种子分段模拟、大招释放、胜率预估与首通奖励。
(function () {
  const root = typeof window !== 'undefined' ? window : globalThis;

  const BOARD_COLS = 6;
  const BOARD_ROWS = 8;

  // 默认我方阵型：前排 3 个（第 5 行 r=4），后排 3 个（第 7 行 r=6）
  const DEFAULT_PLAYER_SLOTS = [
    { c: 2, r: 4 },
    { c: 1, r: 4 },
    { c: 4, r: 4 },
    { c: 2, r: 6 },
    { c: 1, r: 6 },
    { c: 4, r: 6 }
  ];

  const ENEMY_FORMATIONS = {
    boss: [
      { c: 2, r: 1 },
      { c: 1, r: 2 },
      { c: 3, r: 2 }
    ],
    3: [
      { c: 1, r: 2 },
      { c: 3, r: 2 },
      { c: 2, r: 1 }
    ],
    4: [
      { c: 1, r: 2 },
      { c: 3, r: 2 },
      { c: 2, r: 1 },
      { c: 4, r: 1 }
    ],
    5: [
      { c: 1, r: 2 },
      { c: 2, r: 2 },
      { c: 4, r: 2 },
      { c: 1, r: 1 },
      { c: 3, r: 1 }
    ]
  };

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
        cp,
        heroId: state.heroId,
        formation: state.formation
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
    return {
      atk,
      hp,
      def,
      spd,
      crit,
      critDmg,
      cd: critDmg,
      cp,
      heroId: state && state.heroId,
      formation: state && state.formation
    };
  }

  function resolveStateRef(stateOrPlayer) {
    if (stateOrPlayer && (stateOrPlayer.equip || stateOrPlayer.formation || stateOrPlayer.heroId)) {
      return stateOrPlayer;
    }
    if (root.GameState && root.GameState.state) return root.GameState.state;
    if (typeof window !== 'undefined' && window.GameState && window.GameState.state) {
      return window.GameState.state;
    }
    return stateOrPlayer || {};
  }

  // 获取所有已解锁主角，当前主角（state.heroId）排在第一个
  function unlockedHeroes(state) {
    const C = cfg();
    const rawList = (C && Array.isArray(C.HEROES) && C.HEROES) || [
      {
        id: 'lanyi',
        name: '清冷剑仙',
        img: 'assets/hero_v21_new_hd.jpg?v=1',
        poster: 'assets/hero_v21_new_poster.jpg?v=1'
      }
    ];
    const unlocked = rawList.filter((h) => h && !h.locked);
    if (unlocked.length === 0) return rawList.slice(0, 1);

    const s = resolveStateRef(state);
    const mainId = (s && s.heroId) || unlocked[0].id;
    const ordered = [];
    const mainHero = unlocked.find((h) => h.id === mainId);
    if (mainHero) ordered.push(mainHero);
    for (let i = 0; i < unlocked.length; i++) {
      if (!mainHero || unlocked[i].id !== mainHero.id) {
        ordered.push(unlocked[i]);
      }
    }
    return ordered;
  }

  function isValidPlayerCell(c, r) {
    return (
      Number.isInteger(c) &&
      Number.isInteger(r) &&
      c >= 0 &&
      c < BOARD_COLS &&
      r >= 4 &&
      r < BOARD_ROWS
    );
  }

  // 确保 state.formation 有效且包含所有已解锁角色（兼容旧存档与新解锁角色）
  function ensureFormation(state) {
    const s = resolveStateRef(state);
    const heroes = unlockedHeroes(s);
    const rawForm = s && s.formation && typeof s.formation === 'object' ? s.formation : {};
    const nextForm = {};
    const used = new Set();

    // 1. 保留已存在的合法坐标
    for (let i = 0; i < heroes.length; i++) {
      const h = heroes[i];
      const pos = rawForm[h.id];
      if (pos && isValidPlayerCell(pos.c, pos.r)) {
        const key = `${pos.c},${pos.r}`;
        if (!used.has(key)) {
          used.add(key);
          nextForm[h.id] = { c: pos.c, r: pos.r };
        }
      }
    }

    // 2. 未分配坐标的角色依次放入默认阵型或我方半区空格
    for (let i = 0; i < heroes.length; i++) {
      const h = heroes[i];
      if (nextForm[h.id]) continue;
      let placed = false;
      for (let j = 0; j < DEFAULT_PLAYER_SLOTS.length; j++) {
        const slot = DEFAULT_PLAYER_SLOTS[j];
        const key = `${slot.c},${slot.r}`;
        if (!used.has(key)) {
          used.add(key);
          nextForm[h.id] = { c: slot.c, r: slot.r };
          placed = true;
          break;
        }
      }
      if (!placed) {
        for (let r = 4; r < BOARD_ROWS && !placed; r++) {
          for (let c = 0; c < BOARD_COLS && !placed; c++) {
            const key = `${c},${r}`;
            if (!used.has(key)) {
              used.add(key);
              nextForm[h.id] = { c, r };
              placed = true;
            }
          }
        }
      }
    }

    if (s && typeof s === 'object') {
      s.formation = nextForm;
    }
    return nextForm;
  }

  function buildPlayerUnits(stateOrPlayer) {
    const pStats = playerStats(stateOrPlayer);
    const s = resolveStateRef(stateOrPlayer);
    const heroes = unlockedHeroes(s);
    const formation = ensureFormation(s);
    const count = Math.max(1, heroes.length);
    const B = (cfg() && cfg().BATTLE) || {};
    const maxRage = B.RAGE_MAX || 100;
    const share = 1 / count;
    // 补偿 6 人分散站位与后排走位损耗，配合 PLAYER_DMG_FACTOR 使同战力胜率落在 0.45~0.55
    const playerAtkComp = 1.09;

    return heroes.map((h, idx) => {
      const pos = formation[h.id] || DEFAULT_PLAYER_SLOTS[idx % DEFAULT_PLAYER_SLOTS.length] || { c: idx % BOARD_COLS, r: 5 };
      return {
        id: `p_${h.id}`,
        heroId: h.id,
        side: 'player',
        name: h.name || '修士',
        img: h.img || '',
        poster: h.poster || h.img || '',
        isBoss: false,
        isLeader: idx === 0,
        c: pos.c,
        r: pos.r,
        share,
        formMult: playerAtkComp,
        atk: pStats.atk * share,
        hp: pStats.hp * share,
        maxHp: pStats.hp * share,
        def: pStats.def * share,
        spd: pStats.spd,
        crit: pStats.crit != null ? pStats.crit : 0.05,
        critDmg: pStats.critDmg || pStats.cd || 1.5,
        rage: 0,
        maxRage,
        unyieldingUsed: false,
        alive: true,
        order: idx
      };
    });
  }

  function buildEnemyUnits(enemyOrStageNum) {
    const eStats =
      typeof enemyOrStageNum === 'object' && enemyOrStageNum !== null && typeof enemyOrStageNum.atk === 'number'
        ? enemyOrStageNum
        : enemyFor(enemyOrStageNum);
    const stageNum = Math.max(1, Math.floor(eStats.n || 1));
    const B = cfg().BATTLE;
    const maxRage = B.RAGE_MAX || 100;
    const chapter = eStats.chapter || Math.floor((stageNum - 1) / 10) + 1;
    const stageInChapter = eStats.stageInChapter || ((stageNum - 1) % 10) + 1;
    const isBoss = Boolean(eStats.isBoss !== undefined ? eStats.isBoss : stageNum % 10 === 0);
    const regionIdx = Math.min(B.REGIONS.length - 1, Math.floor((chapter - 1) / 5));
    const regionObj = B.REGIONS[regionIdx] || B.REGIONS[0];
    const mobs = (regionObj && regionObj.mobs) || [{ name: '妖兽', img: 'placeholder' }];

    const units = [];
    if (isBoss) {
      // Boss 关 = 1 个 Boss (占 60% 属性) + 2 个小怪 (各占 20% 属性)
      const slots = ENEMY_FORMATIONS.boss;
      const bossShare = 0.6;
      const mobShare = 0.2;
      const bossFormMult = 0.98;
      units.push({
        id: 'e_0',
        side: 'enemy',
        n: stageNum,
        chapter,
        name: eStats.name || '妖王',
        img: eStats.img || 'placeholder',
        isBoss: true,
        c: slots[0].c,
        r: slots[0].r,
        share: bossShare,
        formMult: bossFormMult,
        atk: eStats.atk * bossShare,
        hp: eStats.hp * bossShare,
        maxHp: eStats.hp * bossShare,
        def: eStats.def * bossShare,
        spd: eStats.spd,
        crit: eStats.crit != null ? eStats.crit : 0.05,
        critDmg: eStats.critDmg || eStats.cd || 1.5,
        rage: 0,
        maxRage,
        alive: true,
        order: 0
      });

      for (let i = 0; i < 2; i++) {
        const mEntry = mobs[(chapter - 1 + i) % mobs.length];
        const mName = mEntry && typeof mEntry === 'object' ? mEntry.name : mEntry;
        const mImg = mEntry && typeof mEntry === 'object' ? mEntry.img : 'placeholder';
        const slot = slots[i + 1];
        units.push({
          id: `e_${i + 1}`,
          side: 'enemy',
          n: stageNum,
          chapter,
          name: mName || '随从',
          img: mImg || 'placeholder',
          isBoss: false,
          c: slot.c,
          r: slot.r,
          share: mobShare,
          formMult: bossFormMult,
          atk: eStats.atk * mobShare,
          hp: eStats.hp * mobShare,
          maxHp: eStats.hp * mobShare,
          def: eStats.def * mobShare,
          spd: eStats.spd,
          crit: eStats.crit != null ? eStats.crit : 0.05,
          critDmg: eStats.critDmg || eStats.cd || 1.5,
          rage: 0,
          maxRage,
          alive: true,
          order: i + 1
        });
      }
    } else {
      // 普通关：3~5 个小怪，随章节内关卡递增 (1~3关3只, 4~6关4只, 7~9关5只)
      const mobCount = 3 + Math.min(2, Math.floor((stageInChapter - 1) / 3));
      const share = 1 / mobCount;
      const mobFormMult = 1 + 0.02 * (mobCount - 3);
      const slots = ENEMY_FORMATIONS[mobCount] || ENEMY_FORMATIONS[3];
      for (let i = 0; i < mobCount; i++) {
        const mEntry = mobs[(stageNum - 1 + i) % mobs.length];
        const mName = mEntry && typeof mEntry === 'object' ? mEntry.name : mEntry;
        const mImg = mEntry && typeof mEntry === 'object' ? mEntry.img : 'placeholder';
        const slot = slots[i] || { c: i % BOARD_COLS, r: 1 };
        units.push({
          id: `e_${i}`,
          side: 'enemy',
          n: stageNum,
          chapter,
          name: mName || eStats.name || '妖兽',
          img: mImg || eStats.img || 'placeholder',
          isBoss: false,
          c: slot.c,
          r: slot.r,
          share,
          formMult: mobFormMult,
          atk: eStats.atk * share,
          hp: eStats.hp * share,
          maxHp: eStats.hp * share,
          def: eStats.def * share,
          spd: eStats.spd,
          crit: eStats.crit != null ? eStats.crit : 0.05,
          critDmg: eStats.critDmg || eStats.cd || 1.5,
          rage: 0,
          maxRage,
          alive: true,
          order: i
        });
      }
    }

    return units;
  }

  function chebyshevDist(a, b) {
    return Math.max(Math.abs(a.c - b.c), Math.abs(a.r - b.r));
  }

  function manhattanDist(a, b) {
    return Math.abs(a.c - b.c) + Math.abs(a.r - b.r);
  }

  // 创建分段式确定性自走棋会话
  function createSession(stateOrPlayer, enemyOrStageNum, seed) {
    const B = (cfg() && cfg().BATTLE) || {};
    const maxRounds = B.MAX_ROUNDS || 24;
    const rageMax = B.RAGE_MAX || 100;
    const rageOnAtk = B.RAGE_ON_ATK || 22;
    const rageOnHit = B.RAGE_ON_HIT || 14;
    const ultMainMult = B.ULT_MAIN_MULT || 1.6;
    const ultSplashMult = B.ULT_SPLASH_MULT || 0.5;
    const bossUltMainMult = B.BOSS_ULT_MAIN_MULT || 1.2;
    const bossUltSplashMult = B.BOSS_ULT_SPLASH_MULT || 0.45;

    const rng = mulberry32(seed);
    const playerUnits = buildPlayerUnits(stateOrPlayer);
    const enemyUnits = buildEnemyUnits(enemyOrStageNum);
    const enemyCount = enemyUnits.length;
    const isBossStage = enemyUnits.some((u) => u.isBoss);
    const playerDmgFactor = isBossStage
      ? (B.PLAYER_DMG_FACTOR_BOSS || B.PLAYER_DMG_FACTOR || 0.942)
      : enemyCount <= 3
        ? (B.PLAYER_DMG_FACTOR_MOB3 || B.PLAYER_DMG_FACTOR || 0.965)
        : (B.PLAYER_DMG_FACTOR_MOB45 || B.PLAYER_DMG_FACTOR || 0.918) * (enemyCount >= 5 ? 0.898 : 1);
    const paceMult = isBossStage ? (B.PACE_BOSS || 1.15) : (B.PACE_NORMAL || 1.95);
    const units = [...playerUnits, ...enemyUnits];
    const unitMap = {};
    units.forEach((u) => {
      unitMap[u.id] = u;
    });

    const maxHpA = playerUnits.reduce((s, u) => s + u.maxHp, 0);
    const maxHpB = enemyUnits.reduce((s, u) => s + u.maxHp, 0);

    let round = 0;
    let actorQueue = [];
    let finished = false;
    let win = false;
    let timeout = false;
    const events = [];

    function sumSideHp(side) {
      let total = 0;
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (u.side === side && u.alive) total += u.hp;
      }
      return total;
    }

    function livingSideCount(side) {
      let count = 0;
      for (let i = 0; i < units.length; i++) {
        if (units[i].side === side && units[i].alive) count += 1;
      }
      return count;
    }

    function checkEnd() {
      const aliveP = livingSideCount('player');
      const aliveE = livingSideCount('enemy');
      if (aliveE <= 0) {
        finished = true;
        win = true;
        return true;
      }
      if (aliveP <= 0) {
        finished = true;
        win = false;
        return true;
      }
      return false;
    }

    function rollHit(attacker, defender) {
      const cd = attacker.critDmg || attacker.cd || 1.5;
      const critChance = attacker.crit != null ? attacker.crit : 0.05;
      const shareA = attacker.share || 1 / 6;
      const shareB = defender.share || 1 / 3;
      const effDef = defender.def * (shareA / shareB);
      const formMult = attacker.formMult || 1;
      const sideFactor = attacker.side === 'player' ? playerDmgFactor : 1;
      let d =
        ((attacker.atk * attacker.atk) / (attacker.atk + effDef)) *
        paceMult *
        formMult *
        sideFactor *
        (0.95 + rng() * 0.1);
      const crit = rng() < critChance;
      if (crit) d *= cd;
      return { dmg: d, crit };
    }

    function applyDamageToUnit(target, rawDmg, allowUnyielding) {
      target.hp = Math.max(0, target.hp - rawDmg);
      if (
        target.hp <= 0 &&
        allowUnyielding &&
        target.side === 'player' &&
        target.rage >= rageMax &&
        !target.unyieldingUsed
      ) {
        // 满怒待释放大招的我方单位保底留 1 点血，确保手动模式下能放出大招
        target.hp = 1;
        target.unyieldingUsed = true;
        return false;
      }
      if (target.hp <= 0) {
        target.hp = 0;
        target.alive = false;
        target.rage = 0;
        return true;
      }
      return false;
    }

    function findNearestEnemy(actor) {
      const enemySide = actor.side === 'player' ? 'enemy' : 'player';
      let best = null;
      let bestCheb = Infinity;
      let bestManh = Infinity;
      let bestHp = Infinity;

      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (!u.alive || u.side !== enemySide) continue;
        const cheb = chebyshevDist(actor, u);
        const manh = manhattanDist(actor, u);
        if (
          cheb < bestCheb ||
          (cheb === bestCheb && manh < bestManh) ||
          (cheb === bestCheb && manh === bestManh && u.hp < bestHp)
        ) {
          best = u;
          bestCheb = cheb;
          bestManh = manh;
          bestHp = u.hp;
        }
      }
      return best;
    }

    function isCellOccupied(c, r, ignoreUnitId) {
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (!u.alive || u.id === ignoreUnitId) continue;
        if (u.c === c && u.r === r) return true;
      }
      return false;
    }

    function chooseNextStepCell(actor, target) {
      const dirs = [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1]
      ];
      const curCheb = chebyshevDist(actor, target);
      const curManh = manhattanDist(actor, target);
      let bestCell = null;
      let bestScore = curCheb * 100 + curManh * 10;

      for (let i = 0; i < dirs.length; i++) {
        const nc = actor.c + dirs[i][0];
        const nr = actor.r + dirs[i][1];
        if (nc < 0 || nc >= BOARD_COLS || nr < 0 || nr >= BOARD_ROWS) continue;
        if (isCellOccupied(nc, nr, actor.id)) continue;
        const cheb = Math.max(Math.abs(nc - target.c), Math.abs(nr - target.r));
        const manh = Math.abs(nc - target.c) + Math.abs(nr - target.r);
        // 偏向直行靠近
        const diagPenalty = dirs[i][0] !== 0 && dirs[i][1] !== 0 ? 1 : 0;
        const score = cheb * 100 + manh * 10 + diagPenalty;
        if (score < bestScore) {
          bestScore = score;
          bestCell = { c: nc, r: nr };
        }
      }
      return bestCell;
    }

    function getReadyPlayerUnits() {
      const list = [];
      for (let i = 0; i < playerUnits.length; i++) {
        const u = playerUnits[i];
        if (u.alive && u.rage >= rageMax) list.push(u);
      }
      return list;
    }

    function getReadyPlayerUnit() {
      const list = getReadyPlayerUnits();
      return list.length > 0 ? list[0] : null;
    }

    // 释放某个我方单位的大招
    function castUlt(unitId) {
      if (finished) return [];
      const caster =
        unitMap[unitId] ||
        playerUnits.find((u) => u.id === unitId || u.heroId === unitId);
      if (!caster || !caster.alive || caster.side !== 'player' || caster.rage < rageMax) {
        return [];
      }

      const primary = findNearestEnemy(caster);
      if (!primary) {
        checkEnd();
        return [];
      }

      caster.rage = 0;
      caster.unyieldingUsed = false;
      const stepEvents = [];
      const hitTargets = [];
      const deadList = [];

      // 主目标：2 倍普攻伤害
      const mainRes = rollHit(caster, primary);
      const mainRawDmg = mainRes.dmg * ultMainMult;
      const mainDmg = Math.max(1, Math.round(mainRawDmg));
      if (applyDamageToUnit(primary, mainRawDmg, false)) {
        deadList.push(primary);
      }
      hitTargets.push({
        unitId: primary.id,
        name: primary.name,
        c: primary.c,
        r: primary.r,
        dmg: mainDmg,
        crit: mainRes.crit,
        isSplash: false,
        hp: Math.max(0, Math.round(primary.hp)),
        maxHp: Math.round(primary.maxHp),
        died: !primary.alive
      });

      // 周围 1 格（含斜向）其它敌人：总计 0.8 倍溅射伤害
      const splashEnemies = [];
      for (let i = 0; i < enemyUnits.length; i++) {
        const e = enemyUnits[i];
        if (!e.alive || e.id === primary.id) continue;
        if (chebyshevDist(primary, e) <= 1) {
          splashEnemies.push(e);
        }
      }
      const perSplashMult = splashEnemies.length > 0 ? ultSplashMult / splashEnemies.length : 0;
      for (let i = 0; i < splashEnemies.length; i++) {
        const e = splashEnemies[i];
        const spRes = rollHit(caster, e);
        const spRawDmg = spRes.dmg * perSplashMult;
        const spDmg = Math.max(1, Math.round(spRawDmg));
        if (applyDamageToUnit(e, spRawDmg, false)) {
          deadList.push(e);
        }
        hitTargets.push({
          unitId: e.id,
          name: e.name,
          c: e.c,
          r: e.r,
          dmg: spDmg,
          crit: spRes.crit,
          isSplash: true,
          hp: Math.max(0, Math.round(e.hp)),
          maxHp: Math.round(e.maxHp),
          died: !e.alive
        });
      }

      const hpA = Math.max(0, Math.round(sumSideHp('player')));
      const hpB = Math.max(0, Math.round(sumSideHp('enemy')));
      const ultEv = {
        type: 'ult',
        t: Math.max(1, round),
        who: 'a',
        isEnemyUlt: false,
        casterId: caster.id,
        heroId: caster.heroId,
        casterName: caster.name,
        casterImg: caster.img,
        casterPoster: caster.poster,
        casterRage: 0,
        primaryTargetId: primary.id,
        primaryTargetName: primary.name,
        primaryC: primary.c,
        primaryR: primary.r,
        dmg: mainDmg,
        crit: mainRes.crit,
        targets: hitTargets,
        hpA,
        hpB
      };
      events.push(ultEv);
      stepEvents.push(ultEv);

      for (let i = 0; i < deadList.length; i++) {
        const d = deadList[i];
        const dieEv = {
          type: 'die',
          t: Math.max(1, round),
          unitId: d.id,
          side: d.side,
          name: d.name,
          c: d.c,
          r: d.r,
          hpA,
          hpB
        };
        events.push(dieEv);
        stepEvents.push(dieEv);
      }

      checkEnd();
      return stepEvents;
    }

    // 敌方 Boss 释放大招（只播放棋盘红色特效，不播立绘）
    function castEnemyUlt(caster) {
      if (finished || !caster || !caster.alive || caster.side !== 'enemy') return [];
      const primary = findNearestEnemy(caster);
      if (!primary) {
        checkEnd();
        return [];
      }

      caster.rage = 0;
      const stepEvents = [];
      const hitTargets = [];
      const deadList = [];

      const mainRes = rollHit(caster, primary);
      const mainRawDmg = mainRes.dmg * bossUltMainMult;
      const mainDmg = Math.max(1, Math.round(mainRawDmg));
      if (applyDamageToUnit(primary, mainRawDmg, true)) {
        deadList.push(primary);
      }
      hitTargets.push({
        unitId: primary.id,
        name: primary.name,
        c: primary.c,
        r: primary.r,
        dmg: mainDmg,
        crit: mainRes.crit,
        isSplash: false,
        hp: Math.max(0, Math.round(primary.hp)),
        maxHp: Math.round(primary.maxHp),
        died: !primary.alive
      });

      const splashPlayers = [];
      for (let i = 0; i < playerUnits.length; i++) {
        const p = playerUnits[i];
        if (!p.alive || p.id === primary.id) continue;
        if (chebyshevDist(primary, p) <= 1) {
          splashPlayers.push(p);
        }
      }
      const perSplashMult = splashPlayers.length > 0 ? bossUltSplashMult / splashPlayers.length : 0;
      for (let i = 0; i < splashPlayers.length; i++) {
        const p = splashPlayers[i];
        const spRes = rollHit(caster, p);
        const spRawDmg = spRes.dmg * perSplashMult;
        const spDmg = Math.max(1, Math.round(spRawDmg));
        if (applyDamageToUnit(p, spRawDmg, true)) {
          deadList.push(p);
        }
        hitTargets.push({
          unitId: p.id,
          name: p.name,
          c: p.c,
          r: p.r,
          dmg: spDmg,
          crit: spRes.crit,
          isSplash: true,
          hp: Math.max(0, Math.round(p.hp)),
          maxHp: Math.round(p.maxHp),
          died: !p.alive
        });
      }

      const hpA = Math.max(0, Math.round(sumSideHp('player')));
      const hpB = Math.max(0, Math.round(sumSideHp('enemy')));
      const ultEv = {
        type: 'ult',
        t: Math.max(1, round),
        who: 'b',
        isEnemyUlt: true,
        casterId: caster.id,
        casterName: caster.name,
        casterRage: 0,
        primaryTargetId: primary.id,
        primaryTargetName: primary.name,
        primaryC: primary.c,
        primaryR: primary.r,
        dmg: mainDmg,
        crit: mainRes.crit,
        targets: hitTargets,
        hpA,
        hpB
      };
      events.push(ultEv);
      stepEvents.push(ultEv);

      for (let i = 0; i < deadList.length; i++) {
        const d = deadList[i];
        const dieEv = {
          type: 'die',
          t: Math.max(1, round),
          unitId: d.id,
          side: d.side,
          name: d.name,
          c: d.c,
          r: d.r,
          hpA,
          hpB
        };
        events.push(dieEv);
        stepEvents.push(dieEv);
      }

      checkEnd();
      return stepEvents;
    }

    function refillActorQueue() {
      round += 1;
      if (round > maxRounds) {
        finished = true;
        win = false;
        timeout = true;
        return false;
      }
      const aliveList = units
        .filter((u) => u.alive)
        .map((u) => ({
          u,
          score: round === 1 ? 100 * (0.96 + rng() * 0.08) : (u.spd || 100) * (0.5 + rng())
        }));
      aliveList.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.u.order - b.u.order;
      });
      actorQueue = aliveList.map((item) => item.u.id);
      return true;
    }

    // 推进单个行动步骤
    function step(options) {
      if (finished) return [];
      if (checkEnd()) return [];

      const autoUlt = Boolean(options && options.autoUlt);
      if (autoUlt) {
        const readyUnit = getReadyPlayerUnit();
        if (readyUnit) {
          return castUlt(readyUnit.id);
        }
      }

      let guard = 0;
      while (!finished && guard < 64) {
        guard += 1;
        if (actorQueue.length === 0) {
          if (!refillActorQueue()) return [];
        }

        const actorId = actorQueue.shift();
        const actor = unitMap[actorId];
        if (!actor || !actor.alive) continue;

        // 若自动大招开启且该我方单位怒气已满，优先放大招
        if (autoUlt && actor.side === 'player' && actor.rage >= rageMax) {
          return castUlt(actor.id);
        }

        // 敌方 Boss 怒气已满则释放 Boss 大招
        if (actor.side === 'enemy' && actor.isBoss && actor.rage >= rageMax) {
          return castEnemyUlt(actor);
        }

        const target = findNearestEnemy(actor);
        if (!target) {
          checkEnd();
          return [];
        }

        const dist = chebyshevDist(actor, target);
        if (dist <= 1) {
          // 攻击相邻目标
          const res = rollHit(actor, target);
          const dmg = Math.max(1, Math.round(res.dmg));
          const targetDied = applyDamageToUnit(target, res.dmg, true);

          if (actor.side === 'player' || actor.isBoss) {
            actor.rage = Math.min(rageMax, actor.rage + rageOnAtk);
          }
          if ((target.side === 'player' || target.isBoss) && target.hp > 0 && !targetDied) {
            target.rage = Math.min(rageMax, target.rage + rageOnHit);
          }

          const hpA = Math.max(0, Math.round(sumSideHp('player')));
          const hpB = Math.max(0, Math.round(sumSideHp('enemy')));
          const atkEv = {
            type: 'attack',
            t: round,
            who: actor.side === 'player' ? 'a' : 'b',
            attackerId: actor.id,
            attackerName: actor.name,
            attackerSide: actor.side,
            attackerC: actor.c,
            attackerR: actor.r,
            attackerRage: Math.round(actor.rage || 0),
            targetId: target.id,
            targetName: target.name,
            targetSide: target.side,
            targetC: target.c,
            targetR: target.r,
            targetHp: Math.max(0, Math.round(target.hp)),
            targetMaxHp: Math.round(target.maxHp),
            targetRage: Math.round(target.rage || 0),
            targetDied,
            dmg,
            crit: res.crit,
            hpA,
            hpB
          };
          const out = [atkEv];
          events.push(atkEv);

          if (targetDied) {
            const dieEv = {
              type: 'die',
              t: round,
              unitId: target.id,
              side: target.side,
              name: target.name,
              c: target.c,
              r: target.r,
              hpA,
              hpB
            };
            events.push(dieEv);
            out.push(dieEv);
          }

          checkEnd();
          return out;
        } else {
          // 朝最近敌人移动 1 格
          const nextCell = chooseNextStepCell(actor, target);
          if (nextCell) {
            const fromC = actor.c;
            const fromR = actor.r;
            actor.c = nextCell.c;
            actor.r = nextCell.r;
            const moveEv = {
              type: 'move',
              t: round,
              unitId: actor.id,
              side: actor.side,
              name: actor.name,
              fromC,
              fromR,
              toC: nextCell.c,
              toR: nextCell.r,
              hpA: Math.max(0, Math.round(sumSideHp('player'))),
              hpB: Math.max(0, Math.round(sumSideHp('enemy')))
            };
            events.push(moveEv);
            return [moveEv];
          }
          // 被完全阻挡则跳过该单位本回合行动
        }
      }

      return [];
    }

    function runToEnd(autoUlt = true) {
      let safety = 0;
      while (!finished && safety < 1200) {
        safety += 1;
        step({ autoUlt });
      }
      return {
        win,
        rounds: Math.max(1, Math.min(round, maxRounds)),
        timeout,
        events,
        units,
        maxHpA,
        maxHpB
      };
    }

    return {
      get round() {
        return Math.max(1, Math.min(round || 1, maxRounds));
      },
      get rounds() {
        return Math.max(1, Math.min(round || 1, maxRounds));
      },
      get finished() {
        return finished;
      },
      get win() {
        return win;
      },
      get timeout() {
        return timeout;
      },
      events,
      units,
      playerUnits,
      enemyUnits,
      unitMap,
      maxHpA,
      maxHpB,
      getReadyPlayerUnits,
      getReadyPlayerUnit,
      castUlt,
      step,
      runToEnd
    };
  }

  // 改造前的一对一回合制模拟（保留供对比胜率）
  function simulateLegacy(a, b, seed) {
    const p = a && typeof a.atk === 'number' && !a.equip ? a : playerStats(a);
    const e = typeof b === 'object' && b !== null && typeof b.atk === 'number' ? b : enemyFor(b);
    const maxRounds = 20;
    const rng = mulberry32(seed);
    let hpA = p.hp;
    let hpB = e.hp;
    const maxHpA = p.hp;
    const maxHpB = e.hp;
    const events = [];

    function rollHit1v1(attacker, defender) {
      const cd = attacker.critDmg || attacker.cd || 1.5;
      const critChance = attacker.crit != null ? attacker.crit : 0.05;
      let d = ((attacker.atk * attacker.atk) / (attacker.atk + defender.def)) * (0.95 + rng() * 0.1);
      const crit = rng() < critChance;
      if (crit) d *= cd;
      return { dmg: d, crit };
    }

    const spdA = p.spd || 100;
    const spdB = e.spd || 100;

    for (let t = 1; t <= maxRounds; t++) {
      const aFirst = rng() * (spdA + spdB) < spdA;
      const order = aFirst ? ['a', 'b'] : ['b', 'a'];
      for (let i = 0; i < 2; i++) {
        const who = order[i];
        if (who === 'a') {
          const res = rollHit1v1(p, e);
          hpB = Math.max(0, hpB - res.dmg);
          events.push({
            t,
            who: 'a',
            dmg: Math.max(1, Math.round(res.dmg)),
            crit: res.crit,
            hpA: Math.max(0, Math.round(hpA)),
            hpB: Math.max(0, Math.round(hpB))
          });
          if (hpB <= 0) {
            return { win: true, rounds: t, timeout: false, events, maxHpA, maxHpB };
          }
        } else {
          const res = rollHit1v1(e, p);
          hpA = Math.max(0, hpA - res.dmg);
          events.push({
            t,
            who: 'b',
            dmg: Math.max(1, Math.round(res.dmg)),
            crit: res.crit,
            hpA: Math.max(0, Math.round(hpA)),
            hpB: Math.max(0, Math.round(hpB))
          });
          if (hpA <= 0) {
            return { win: false, rounds: t, timeout: false, events, maxHpA, maxHpB };
          }
        }
      }
    }

    return { win: false, rounds: maxRounds, timeout: true, events, maxHpA, maxHpB };
  }

  function simulate(a, b, seed) {
    const session = createSession(a, b, seed);
    return session.runToEnd(true);
  }

  function winRate(state, n, runs = 50) {
    const total = Math.max(1, Math.floor(runs || 50));
    const p = playerStats(state);
    const e = typeof n === 'object' && n !== null ? n : enemyFor(n);
    let wins = 0;
    for (let i = 0; i < total; i++) {
      if (simulate(p, e, i + 1).win) wins += 1;
    }
    return wins / total;
  }

  function winRateLegacy(state, n, runs = 50) {
    const total = Math.max(1, Math.floor(runs || 50));
    const p = playerStats(state);
    const e = typeof n === 'object' && n !== null ? n : enemyFor(n);
    let wins = 0;
    for (let i = 0; i < total; i++) {
      if (simulateLegacy(p, e, i + 1).win) wins += 1;
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
    BOARD_COLS,
    BOARD_ROWS,
    DEFAULT_PLAYER_SLOTS,
    mulberry32,
    enemyFor,
    playerStats,
    unlockedHeroes,
    ensureFormation,
    buildPlayerUnits,
    buildEnemyUnits,
    createSession,
    simulate,
    simulateLegacy,
    winRate,
    winRateLegacy,
    winRateLabel,
    firstClearReward
  };

  root.Battle = Battle;
  if (typeof window !== 'undefined') window.Battle = Battle;
  if (typeof module !== 'undefined' && module.exports) module.exports = Battle;
})();
