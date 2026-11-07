// 自走棋战斗内核：阵容生成、布阵校验、mulberry32 种子分段模拟、大招释放、胜率预估与首通奖励。
(function () {
  const root = typeof window !== 'undefined' ? window : globalThis;

  const BOARD_COLS = 6;
  const BOARD_ROWS = 8;
  const MAX_SQUAD_SIZE = 6;
  const MIN_SQUAD_SIZE = 1;

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

  function resolveStateRef(stateOrPlayer) {
    if (
      stateOrPlayer &&
      (stateOrPlayer.equip ||
        stateOrPlayer.formation ||
        stateOrPlayer.heroId ||
        Array.isArray(stateOrPlayer.squad) ||
        Array.isArray(stateOrPlayer.unlockedHeroes) ||
        Array.isArray(stateOrPlayer.lockedHeroes))
    ) {
      return stateOrPlayer;
    }
    if (root.GameState && root.GameState.state) return root.GameState.state;
    if (typeof window !== 'undefined' && window.GameState && window.GameState.state) {
      return window.GameState.state;
    }
    return stateOrPlayer || {};
  }

  function getAllConfigHeroes() {
    const C = cfg();
    return (
      (C && Array.isArray(C.HEROES) && C.HEROES) || [
        {
          id: 'lanyi',
          name: '清冷剑仙',
          img: 'assets/hero_v21_new_hd.jpg?v=3',
          poster: 'assets/hero_v21_new_poster.jpg?v=3'
        }
      ]
    );
  }

  function isHeroUnlocked(heroId, state) {
    if (!heroId || typeof heroId !== 'string') return false;
    const rawList = getAllConfigHeroes();
    const hero = rawList.find((h) => h && h.id === heroId);
    if (!hero) return false;
    const s = resolveStateRef(state);
    if (s && Array.isArray(s.lockedHeroes) && s.lockedHeroes.includes(heroId)) {
      return false;
    }
    if (s && Array.isArray(s.unlockedHeroes)) {
      return s.unlockedHeroes.includes(heroId) && !hero.locked;
    }
    return !hero.locked;
  }

  // 获取所有已解锁主角，当前主角（state.heroId）排在第一个
  function unlockedHeroes(state) {
    const rawList = getAllConfigHeroes();
    const s = resolveStateRef(state);
    const unlocked = rawList.filter((h) => h && isHeroUnlocked(h.id, s));
    if (unlocked.length === 0) return [];

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

  function sanitizeSquadIds(rawIds, state) {
    if (!Array.isArray(rawIds)) return [];
    const s = resolveStateRef(state);
    const seen = new Set();
    const out = [];
    for (let i = 0; i < rawIds.length; i++) {
      const id = rawIds[i];
      if (typeof id !== 'string' || !id) continue;
      if (seen.has(id)) continue;
      if (!isHeroUnlocked(id, s)) continue;
      seen.add(id);
      out.push(id);
      if (out.length >= MAX_SQUAD_SIZE) break;
    }
    return out;
  }

  function defaultSquadIds(state) {
    const unlocked = unlockedHeroes(state);
    return unlocked.slice(0, MAX_SQUAD_SIZE).map((h) => h.id);
  }

  function getSquadIds(state) {
    const s = resolveStateRef(state);
    if (s && Array.isArray(s.squad)) {
      return sanitizeSquadIds(s.squad, s);
    }
    if (s && s.stage && Array.isArray(s.stage.squad)) {
      return sanitizeSquadIds(s.stage.squad, s);
    }
    if (s && Array.isArray(s.heroOrder)) {
      const fromOrder = sanitizeSquadIds(s.heroOrder, s);
      if (fromOrder.length > 0) return fromOrder;
    }
    return defaultSquadIds(s);
  }

  function squadHeroes(state) {
    const s = resolveStateRef(state);
    const rawList = getAllConfigHeroes();
    const heroMap = {};
    for (let i = 0; i < rawList.length; i++) {
      const h = rawList[i];
      if (h && h.id) heroMap[h.id] = h;
    }
    const ids = getSquadIds(s);
    const list = [];
    for (let i = 0; i < ids.length; i++) {
      const h = heroMap[ids[i]];
      if (h && isHeroUnlocked(h.id, s)) {
        list.push(h);
      }
    }
    return list.slice(0, MAX_SQUAD_SIZE);
  }

  function canStartBattle(state) {
    const heroes = squadHeroes(state);
    const ids = heroes.map((h) => h.id);
    if (ids.length < MIN_SQUAD_SIZE) {
      return {
        ok: false,
        reason: 'EMPTY_SQUAD',
        message: '请至少选择 1 名上阵角色',
        count: 0,
        squad: []
      };
    }
    return {
      ok: true,
      reason: null,
      message: '',
      count: ids.length,
      squad: ids
    };
  }

  function playerStats(state) {
    const s = resolveStateRef(state);
    const activeSquad = squadHeroes(s);
    const squadIds = activeSquad.map((h) => h.id);
    const hasExplicitSquad = Boolean(
      s && (Array.isArray(s.squad) || (s.stage && Array.isArray(s.stage.squad)) || Array.isArray(s.heroOrder))
    );
    const squadCount = hasExplicitSquad ? squadIds.length : Math.min(MAX_SQUAD_SIZE, squadIds.length || MAX_SQUAD_SIZE);
    const squadScale = Math.max(0, Math.min(1, squadCount / MAX_SQUAD_SIZE));

    if (state && typeof state.atk === 'number' && typeof state.hp === 'number' && !state.equip) {
      if (state._fromPlayerStats) {
        return {
          ...state,
          squad: Array.isArray(state.squad) ? state.squad.slice(0, MAX_SQUAD_SIZE) : squadIds
        };
      }
      const cd = state.critDmg || state.cd || 1.5;
      const crit = state.crit != null ? state.crit : 0.05;
      const scale = Array.isArray(state.squad) ? squadScale : 1;
      const atk = state.atk * scale;
      const hp = state.hp * scale;
      const def = state.def * scale;
      const spd = state.spd;
      const baseCp =
        state.cp != null
          ? state.cp
          : (state.atk * 10 + state.hp + state.def * 8 + state.spd * 2) * (1 + crit * (cd - 1));
      const cp = baseCp * scale;
      return {
        _fromPlayerStats: true,
        baseAtk: state.atk,
        baseHp: state.hp,
        baseDef: state.def,
        baseCp,
        atk,
        hp,
        def,
        spd,
        crit,
        critDmg: cd,
        cd,
        cp,
        heroId: state.heroId,
        formation: state.formation,
        squad: Array.isArray(state.squad) ? squadIds : defaultSquadIds(state),
        unlockedHeroes: state.unlockedHeroes,
        lockedHeroes: state.lockedHeroes
      };
    }
    const E = root.Equip || (typeof window !== 'undefined' && window.Equip);
    const T = root.Titles || (typeof window !== 'undefined' && window.Titles);
    const attr = E.attributes(s);
    const mult = T && typeof T.factor === 'function' ? T.factor(s, 'cp') : 1;
    const baseAtk = attr.atk * mult;
    const baseHp = attr.hp * mult;
    const baseDef = attr.def * mult;
    const spd = attr.spd;
    const crit = attr.crit;
    const critDmg = attr.critDmg;
    const baseCp = (baseAtk * 10 + baseHp + baseDef * 8 + spd * 2) * (1 + crit * (critDmg - 1));
    const atk = baseAtk * squadScale;
    const hp = baseHp * squadScale;
    const def = baseDef * squadScale;
    const cp = squadCount === 0 ? 0 : baseCp * squadScale;
    return {
      _fromPlayerStats: true,
      baseAtk,
      baseHp,
      baseDef,
      baseCp,
      atk,
      hp,
      def,
      spd,
      crit,
      critDmg,
      cd: critDmg,
      cp,
      heroId: s && s.heroId,
      formation: s && s.formation,
      squad: squadIds,
      unlockedHeroes: s && s.unlockedHeroes,
      lockedHeroes: s && s.lockedHeroes
    };
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

  // 确保 state.formation 有效且仅包含当前上阵小队（最多 6 人，兼容旧存档与换阵继承槽位）
  function ensureFormation(state, prevFormation) {
    const s = resolveStateRef(state);
    const heroes = squadHeroes(s);
    const rawForm = s && s.formation && typeof s.formation === 'object' ? s.formation : {};
    const prevForm = prevFormation && typeof prevFormation === 'object' ? prevFormation : rawForm;
    const nextForm = {};
    const used = new Set();

    // 1. 保留当前上阵角色已存在的合法坐标
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

    // 收集被换下阵角色的空出坐标，供新换上阵的角色优先继承
    const vacatedSlots = [];
    const prevKeys = Object.keys(prevForm);
    for (let i = 0; i < prevKeys.length; i++) {
      const oldId = prevKeys[i];
      if (!nextForm[oldId]) {
        const pos = prevForm[oldId];
        if (pos && isValidPlayerCell(pos.c, pos.r)) {
          const key = `${pos.c},${pos.r}`;
          if (!used.has(key)) {
            vacatedSlots.push({ c: pos.c, r: pos.r });
          }
        }
      }
    }

    // 2. 未分配坐标的上阵角色依次放入继承槽位、默认阵型或我方半区空格
    for (let i = 0; i < heroes.length; i++) {
      const h = heroes[i];
      if (nextForm[h.id]) continue;
      let placed = false;

      while (vacatedSlots.length > 0 && !placed) {
        const vSlot = vacatedSlots.shift();
        const vKey = `${vSlot.c},${vSlot.r}`;
        if (!used.has(vKey)) {
          used.add(vKey);
          nextForm[h.id] = { c: vSlot.c, r: vSlot.r };
          placed = true;
        }
      }

      for (let j = 0; j < DEFAULT_PLAYER_SLOTS.length && !placed; j++) {
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

  function setSquad(state, rawIds) {
    const s = resolveStateRef(state);
    if (!Array.isArray(rawIds)) {
      return { ok: false, reason: 'INVALID_INPUT', message: '无效的队伍列表', squad: getSquadIds(s) };
    }
    const validIds = [];
    const seen = new Set();
    for (let i = 0; i < rawIds.length; i++) {
      const id = rawIds[i];
      if (typeof id !== 'string' || !id) continue;
      if (seen.has(id)) {
        return { ok: false, reason: 'DUPLICATE_ID', message: '队伍中不能包含重复角色', squad: getSquadIds(s) };
      }
      if (!isHeroUnlocked(id, s)) {
        return { ok: false, reason: 'LOCKED_OR_INVALID_ID', message: '包含未解锁或无效角色', squad: getSquadIds(s) };
      }
      seen.add(id);
      validIds.push(id);
    }
    if (validIds.length > MAX_SQUAD_SIZE) {
      return {
        ok: false,
        reason: 'MAX_EXCEEDED',
        message: `最多只能上阵 ${MAX_SQUAD_SIZE} 名角色`,
        squad: getSquadIds(s)
      };
    }
    if (validIds.length < MIN_SQUAD_SIZE) {
      return {
        ok: false,
        reason: 'EMPTY_SQUAD',
        message: '请至少选择 1 名角色上阵',
        squad: getSquadIds(s)
      };
    }

    const prevForm = s && s.formation ? { ...s.formation } : {};
    if (s && typeof s === 'object') {
      s.squad = [...validIds];
      if (s.stage && typeof s.stage === 'object') {
        s.stage.squad = [...validIds];
      }
      ensureFormation(s, prevForm);
    }
    return { ok: true, reason: null, message: '', squad: [...validIds] };
  }

  const FALLBACK_HERO_SKILLS = {
    lanyi: {
      id: 'jianyi_powang',
      name: '剑意斩 · 破妄',
      kind: 'single',
      mainMult: 2.2,
      splashMult: 0,
      healSelfOfMainDmg: 0,
      healAllyMaxHpRatio: 0,
      rowMult: 0,
      buffAtkMult: 1,
      buffHits: 0
    },
    cloak: {
      id: 'youming_shiguang',
      name: '幽冥噬光',
      kind: 'splash_lifesteal',
      mainMult: 1.4,
      splashMult: 0.5,
      healSelfOfMainDmg: 0.25,
      healAllyMaxHpRatio: 0,
      rowMult: 0,
      buffAtkMult: 1,
      buffHits: 0
    },
    saintess: {
      id: 'shengcai_guangyi',
      name: '圣裁光翼',
      kind: 'damage_heal_allies',
      mainMult: 1.3,
      splashMult: 0,
      healSelfOfMainDmg: 0,
      healAllyMaxHpRatio: 0.08,
      rowMult: 0,
      buffAtkMult: 1,
      buffHits: 0
    },
    miko: {
      id: 'yinghuo_zhuci',
      name: '樱火祝词',
      kind: 'row',
      mainMult: 1.1,
      splashMult: 0,
      healSelfOfMainDmg: 0,
      healAllyMaxHpRatio: 0,
      rowMult: 1.1,
      buffAtkMult: 1,
      buffHits: 0
    },
    shuanghua: {
      id: 'shuanghua_ningpo',
      name: '霜华凝魄',
      kind: 'splash_freeze',
      mainMult: 1.5,
      splashMult: 0.5,
      healSelfOfMainDmg: 0,
      healAllyMaxHpRatio: 0,
      rowMult: 0,
      buffAtkMult: 1,
      buffHits: 0
    },
    sweetmaid: {
      id: 'tianxin_jiahu',
      name: '甜心加护',
      kind: 'damage_buff_ally',
      mainMult: 1.2,
      splashMult: 0,
      healSelfOfMainDmg: 0,
      healAllyMaxHpRatio: 0,
      rowMult: 0,
      buffAtkMult: 1.35,
      buffHits: 2
    },
    jianghua: {
      id: 'hongxiu_chanxin',
      name: '红袖缠心',
      kind: 'damage_heal_allies',
      mainMult: 1.4,
      splashMult: 0.45,
      healSelfOfMainDmg: 0,
      healAllyMaxHpRatio: 0.05,
      rowMult: 0,
      buffAtkMult: 1,
      buffHits: 0
    }
  };

  function getHeroSkillConfig(heroId, unitSkill) {
    const C = cfg();
    if (heroId && C && C.HERO_SKILLS && C.HERO_SKILLS[heroId]) {
      return C.HERO_SKILLS[heroId];
    }
    if (heroId && C && Array.isArray(C.HEROES)) {
      const found = C.HEROES.find((h) => h && h.id === heroId);
      if (found && found.skill) return found.skill;
    }
    if (heroId && FALLBACK_HERO_SKILLS[heroId]) {
      return FALLBACK_HERO_SKILLS[heroId];
    }
    if (unitSkill && (!unitSkill.heroId || unitSkill.heroId === heroId)) {
      return unitSkill;
    }
    const B = (C && C.BATTLE) || {};
    return {
      id: 'powang_shentong',
      name: '破妄神通',
      kind: 'splash',
      mainMult: B.ULT_MAIN_MULT || 1.6,
      splashMult: B.ULT_SPLASH_MULT || 0.5,
      healSelfOfMainDmg: 0,
      healAllyMaxHpRatio: 0,
      rowMult: 0,
      buffAtkMult: 1,
      buffHits: 0
    };
  }

  function buildPlayerUnits(stateOrPlayer) {
    const pStats = playerStats(stateOrPlayer);
    const s = resolveStateRef(stateOrPlayer);
    const heroes = squadHeroes(s).slice(0, MAX_SQUAD_SIZE);
    if (heroes.length < MIN_SQUAD_SIZE) {
      return [];
    }
    const formation = ensureFormation(s);
    const count = heroes.length;
    const B = (cfg() && cfg().BATTLE) || {};
    const maxRage = B.RAGE_MAX || 100;
    const share = 1 / MAX_SQUAD_SIZE;
    const unitPortion = 1 / count;
    // 补偿 6 人分散站位与后排走位损耗，配合 PLAYER_DMG_FACTOR 使同战力胜率落在 0.45~0.55
    const playerAtkComp = 1.09;
    const mainHeroId = s && s.heroId;
    const hasMainInSquad = Boolean(mainHeroId && heroes.some((h) => h.id === mainHeroId));

    return heroes.map((h, idx) => {
      const pos = formation[h.id] || DEFAULT_PLAYER_SLOTS[idx % DEFAULT_PLAYER_SLOTS.length] || { c: idx % BOARD_COLS, r: 5 };
      const skillCfg = getHeroSkillConfig(h.id, h.skill);
      return {
        id: `p_${h.id}`,
        heroId: h.id,
        side: 'player',
        name: h.name || '修士',
        img: h.img || '',
        poster: h.poster || h.img || '',
        skill: Object.assign({ heroId: h.id }, skillCfg),
        skillId: skillCfg.id,
        isBoss: false,
        isLeader: hasMainInSquad ? h.id === mainHeroId : idx === 0,
        c: pos.c,
        r: pos.r,
        share,
        formMult: playerAtkComp,
        atk: pStats.atk * unitPortion,
        hp: pStats.hp * unitPortion,
        maxHp: pStats.hp * unitPortion,
        def: pStats.def * unitPortion,
        spd: pStats.spd,
        crit: pStats.crit != null ? pStats.crit : 0.05,
        critDmg: pStats.critDmg || pStats.cd || 1.5,
        rage: 0,
        maxRage,
        skipNextAtk: false,
        atkBuffMult: 1,
        atkBuffHits: 0,
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
        skipNextAtk: false,
        atkBuffMult: 1,
        atkBuffHits: 0,
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
          skipNextAtk: false,
          atkBuffMult: 1,
          atkBuffHits: 0,
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
          skipNextAtk: false,
          atkBuffMult: 1,
          atkBuffHits: 0,
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
    const emptySquad = playerUnits.length < MIN_SQUAD_SIZE;
    let finished = emptySquad;
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

    function rollHit(attacker, defender, isUlt) {
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
      if (!isUlt && attacker.atkBuffHits > 0 && attacker.atkBuffMult > 1) {
        d *= attacker.atkBuffMult;
      }
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
      const skill = getHeroSkillConfig(caster.heroId, caster.skill);
      const skillId = skill.id || 'powang_shentong';
      const skillName = skill.name || '破妄神通';
      const skillKind = skill.kind || 'splash';

      const stepEvents = [];
      const hitTargets = [];
      const deadList = [];
      const heals = [];
      let buffTargetId = null;
      let buffTargetName = null;
      let freezeTargetId = null;
      let mainDmg = 0;
      let mainCrit = false;

      if (skillKind === 'row') {
        const rowMult = skill.rowMult || skill.mainMult || 1.1;
        const rowEnemies = [primary];
        for (let i = 0; i < enemyUnits.length; i++) {
          const e = enemyUnits[i];
          if (e.alive && e.id !== primary.id && e.r === primary.r) {
            rowEnemies.push(e);
          }
        }
        for (let i = 0; i < rowEnemies.length; i++) {
          const e = rowEnemies[i];
          const rRes = rollHit(caster, e, true);
          const rRawDmg = rRes.dmg * rowMult;
          const rDmg = Math.max(1, Math.round(rRawDmg));
          if (i === 0) {
            mainDmg = rDmg;
            mainCrit = rRes.crit;
          }
          if (applyDamageToUnit(e, rRawDmg, false)) {
            deadList.push(e);
          }
          hitTargets.push({
            unitId: e.id,
            name: e.name,
            c: e.c,
            r: e.r,
            dmg: rDmg,
            crit: rRes.crit,
            isSplash: i > 0,
            hp: Math.max(0, Math.round(e.hp)),
            maxHp: Math.round(e.maxHp),
            died: !e.alive
          });
        }
      } else {
        const mainMult = skill.mainMult != null ? skill.mainMult : ultMainMult;
        const splashMult = skill.splashMult != null ? skill.splashMult : 0;

        // 主目标伤害
        const mainRes = rollHit(caster, primary, true);
        const mainRawDmg = mainRes.dmg * mainMult;
        mainDmg = Math.max(1, Math.round(mainRawDmg));
        mainCrit = mainRes.crit;
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

        // 周围 1 格（含斜向）其它敌人溅射
        if (splashMult > 0) {
          const splashEnemies = [];
          for (let i = 0; i < enemyUnits.length; i++) {
            const e = enemyUnits[i];
            if (!e.alive || e.id === primary.id) continue;
            if (chebyshevDist(primary, e) <= 1) {
              splashEnemies.push(e);
            }
          }
          const perSplashMult = splashEnemies.length > 0 ? splashMult / splashEnemies.length : 0;
          for (let i = 0; i < splashEnemies.length; i++) {
            const e = splashEnemies[i];
            const spRes = rollHit(caster, e, true);
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
        }
      }

      // 魔灵光：施法者回复生命 = 本次主目标实际伤害的 25%（不超过自身 maxHp，死亡单位不抬血）
      if ((skillKind === 'splash_lifesteal' || skill.healSelfOfMainDmg > 0) && caster.alive && caster.hp > 0) {
        const ratio = skill.healSelfOfMainDmg || 0.25;
        const healAmt = Math.max(1, Math.round(mainDmg * ratio));
        caster.hp = Math.min(caster.maxHp, caster.hp + healAmt);
        heals.push({
          unitId: caster.id,
          name: caster.name,
          c: caster.c,
          r: caster.r,
          amount: healAmt,
          hp: Math.round(caster.hp),
          maxHp: Math.round(caster.maxHp)
        });
      }

      // 圣王女：所有存活我方单位各回复自身 maxHp × 8%（向上取整至少 1，不超过 maxHp）
      if (skillKind === 'damage_heal_allies' || skill.healAllyMaxHpRatio > 0) {
        const ratio = skill.healAllyMaxHpRatio || 0.08;
        for (let i = 0; i < playerUnits.length; i++) {
          const ally = playerUnits[i];
          if (!ally.alive || ally.hp <= 0) continue;
          const healAmt = Math.max(1, Math.ceil(ally.maxHp * ratio));
          ally.hp = Math.min(ally.maxHp, ally.hp + healAmt);
          heals.push({
            unitId: ally.id,
            name: ally.name,
            c: ally.c,
            r: ally.r,
            amount: healAmt,
            hp: Math.round(ally.hp),
            maxHp: Math.round(ally.maxHp)
          });
        }
      }

      // 霜华玉仙：主目标存活则挂 skipNextAtk = true
      if (skillKind === 'splash_freeze') {
        if (primary.alive && primary.hp > 0) {
          primary.skipNextAtk = true;
          freezeTargetId = primary.id;
        }
      }

      // 甜心女仆：选存活我方中当前 atk 最高的一人（并列取 order 更小/先遍历到的）
      if (skillKind === 'damage_buff_ally' || (skill.buffHits > 0 && skill.buffAtkMult > 1)) {
        let bestAlly = null;
        for (let i = 0; i < playerUnits.length; i++) {
          const ally = playerUnits[i];
          if (!ally.alive || ally.hp <= 0) continue;
          if (
            !bestAlly ||
            ally.atk > bestAlly.atk ||
            (ally.atk === bestAlly.atk && (ally.order != null ? ally.order : i) < (bestAlly.order != null ? bestAlly.order : i))
          ) {
            bestAlly = ally;
          }
        }
        if (bestAlly) {
          bestAlly.atkBuffMult = skill.buffAtkMult || 1.35;
          bestAlly.atkBuffHits = skill.buffHits || 2;
          buffTargetId = bestAlly.id;
          buffTargetName = bestAlly.name;
        }
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
        skillId,
        skillName,
        skillKind,
        primaryTargetId: primary.id,
        primaryTargetName: primary.name,
        primaryC: primary.c,
        primaryR: primary.r,
        dmg: mainDmg,
        crit: mainCrit,
        targets: hitTargets,
        heals,
        buffTargetId,
        buffTargetName,
        freezeTargetId,
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
          if (actor.skipNextAtk) {
            actor.skipNextAtk = false;
            const skipEv = {
              type: 'skip_atk',
              t: round,
              unitId: actor.id,
              name: actor.name,
              side: actor.side,
              c: actor.c,
              r: actor.r,
              hpA: Math.max(0, Math.round(sumSideHp('player'))),
              hpB: Math.max(0, Math.round(sumSideHp('enemy')))
            };
            events.push(skipEv);
            continue;
          }

          // 攻击相邻目标
          const res = rollHit(actor, target);
          if (actor.atkBuffHits > 0) {
            actor.atkBuffHits -= 1;
            if (actor.atkBuffHits <= 0) {
              actor.atkBuffHits = 0;
              actor.atkBuffMult = 1;
            }
          }
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
      emptySquad,
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
    const check = canStartBattle(state);
    if (!check.ok) return 0;
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
    MAX_SQUAD_SIZE,
    MIN_SQUAD_SIZE,
    DEFAULT_PLAYER_SLOTS,
    mulberry32,
    enemyFor,
    playerStats,
    isHeroUnlocked,
    unlockedHeroes,
    sanitizeSquadIds,
    defaultSquadIds,
    getSquadIds,
    squadHeroes,
    canStartBattle,
    setSquad,
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
