// 界面文案（突破 / 渡劫关口 / 离线结算 / 仙桃树 / 洞府 / 轮回）
// 来源：docs/worldbuilding/界面文案.md 文末 JSON（按 meta.replaceAnchors 接入）；不含加载提示，不改任何解锁表与数值。
(function () {
  'use strict';
  const DATA = {
    breakthrough: {
      "banxue": {
        "successMinor": "精血如雷，骨文入血。你踏入【{next}】，皮肉发出生腥的热。",
        "failure": "血关未开，精血逆行。散去 {loss} 灵气，下次破境成功率 +4%。再强冲，便是血枯骨裂。",
        "successTribulation": "血关已过。你以枯过一回的身子踏入【{next}】，洞天的风，已经在咬你的骨缝。"
      },
      "dongtian": {
        "successMinor": "洞天又吞下一截神精。你踏入【{next}】，耳中有风从体内往外灌。",
        "failure": "洞天欲崩，本源倒灌。散去 {loss} 灵气，下次破境成功率 +4%。先把体内的风按回去。",
        "successTribulation": "洞天没有崩。你踏入【{next}】，被夺来的那一口造化，开始在体内发芽。"
      },
      "hualing": {
        "successMinor": "肉身与神识又近一分。你踏入【{next}】，三元尚未齐，已有灵在骨里翻身。",
        "failure": "化灵半途，神形欲裂。散去 {loss} 灵气，下次破境成功率 +4%。再乱冲，便成残灵。",
        "successTribulation": "三元成灵，你踏入【{next}】。半途那种要裂成残灵的疼，还留在齿间。"
      },
      "mingwen": {
        "successMinor": "又一道杀符落进体内。你踏入【{next}】，符文还热，像刚咬过什么。",
        "failure": "错纹噬主，符逆入心。散去 {loss} 灵气，下次破境成功率 +4%。先把咬人的那一道刻回去。",
        "successTribulation": "自铭完成。你踏入【{next}】，纹路不再只是抄来的凶兽之形，开始认你，也开始饿。"
      },
      "liezhen": {
        "successMinor": "身内杀阵又推进一步。你踏入【{next}】，步伐落处，像有人提前被算进死门。",
        "failure": "阵反，己身欲为祭。散去 {loss} 灵气，下次破境成功率 +4%。先撤一枚阵脚，再谈往前。",
        "successTribulation": "阵成。你踏入【{next}】，杀伐可推演，也可反噬。这一步，你暂时还站在阵心。"
      },
      "zunzhe": {
        "successMinor": "尊位更实一分。你踏入【{next}】，方圆的草意都低了低头。",
        "failure": "尊位未稳，血债反噬。散去 {loss} 灵气，下次破境成功率 +4%。未称尊之前，先把喷出的血按住。",
        "successTribulation": "凡人称尊。你踏入【{next}】，血债已写进这一境的名字里，路过之处，难再寸草不生。"
      },
      "shenhuo": {
        "successMinor": "神火又旺一寸。你踏入【{next}】，道种在火里翻了个身，像在看你还能烧多久。",
        "failure": "神火欲熄，或将反吞。散去 {loss} 灵气，下次破境成功率 +4%。先护住道种，再添柴。",
        "successTribulation": "神火长燃，你踏入【{next}】。火是借来的热，熄与被反吞，都写在后路里。"
      },
      "zhenyi": {
        "successMinor": "真神更凝一分。你踏入【{next}】，形与神暂时还没有互相拆开。",
        "failure": "道种不稳，神形欲裂。散去 {loss} 灵气，下次破境成功率 +4%。裂开的那一道，先不要去碰。",
        "successTribulation": "真一已成。你踏入【{next}】，长燃的不是祥瑞，是尚且稳住的道种。"
      },
      "shengji": {
        "successMinor": "祭台又近一步。你踏入【{next}】，脚下的灰，不全是别人的。",
        "failure": "祭未成，身欲为薪。散去 {loss} 灵气，下次破境成功率 +4%。这一次，你还不是祭品。",
        "successTribulation": "圣祭渡过，你踏入【{next}】。成神的路从祭上走过来，败者已成燃料，你暂未成为其中之一。"
      },
      "tianshen": {
        "successMinor": "神威又添一分。你踏入【{next}】，一滴血里已有崩山的意思，只是还没落下去。",
        "failure": "神威反压，肢骨欲断。散去 {loss} 灵气，下次破境成功率 +4%。断的可再生，散掉的神识却要慢慢捡。",
        "successTribulation": "天神之威落下。你踏入【{next}】。果香开始发甜——若有人在侧忽然恭喜，先不要急着谢。"
      },
      "xudao": {
        "successMinor": "道种又触到一层大道。你踏入【{next}】，有一瞬想不起「我」这个字怎么写。",
        "failure": "以道吞我，自我欲失。散去 {loss} 灵气，下次破境成功率 +4%。先把名字在心里默一遍，再睁眼。",
        "successTribulation": "虚道已过。你踏入【{next}】，没有化进道里。那个差一点消失的「我」，还在。"
      },
      "zhanwo": {
        "successMinor": "又斩下一截执念。你踏入【{next}】，脚下那一截自己还在动，先不要回头捡。",
        "failure": "斩偏，道消人欲灭。散去 {loss} 灵气，下次破境成功率 +4%。先认一认，还站着的是不是你。",
        "successTribulation": "斩我明道。你踏入【{next}】。这一剑没有斩偏，可被斩下的那一半，未必就此散尽。"
      },
      "dunyi": {
        "successMinor": "杀伐之权又收紧一分。你踏入【{next}】，一方之内，已有人先低下头。",
        "failure": "杀伐反噬，权柄外泄。散去 {loss} 灵气，下次破境成功率 +4%。先守住这一方，再称霸。",
        "successTribulation": "遁一已成，你踏入【{next}】。霸主之位在前，人道的尽头也在前。再往上，香会更甜。"
      },
      "zhizun": {
        "successMinor": "又近人道绝巅一分。你踏入【{next}】。威压压境，长生若来，也不是善果。",
        "failure": "绝巅未稳，神源反噬。散去 {loss} 灵气，下次破境成功率 +4%。再冲，也只是更像一枚要熟的果。",
        "successMax": "已至至尊后。人道到头了。若还有人请你去轮回凝果，先问一句：这果，是留给你的，还是要被收走的。"
      }
    },
    gates: {
      "黑风寨主": {
        "lockLog": "化灵一关，不是祥瑞。黑风寨主把过路修士当货卖，才堆出他的「化灵」。先去第 3 章第 30 关击败【黑风寨主】，再谈破境。",
        "button": "先败黑风寨主",
        "index": 8,
        "chapter": 3,
        "stage": 30
      },
      "青冥蛟王": {
        "lockLog": "称尊之前，先过蛟。青冥蛟王守在第 9 章第 90 关，妒的是龙位，也妒一切当它面称尊的人。先击败【青冥蛟王】。",
        "button": "先败青冥蛟王",
        "index": 17,
        "chapter": 9,
        "stage": 90
      },
      "赤炎魔君": {
        "lockLog": "圣祭本意：要成神，先为祭。赤炎魔君守在第 15 章第 150 关，祭台上的火不是祥瑞。先击败【赤炎魔君】，再问自己是去称神，还是去为薪。",
        "button": "先败赤炎魔君",
        "index": 26,
        "chapter": 15,
        "stage": 150
      },
      "九幽鬼母": {
        "lockLog": "斩我关口，守着的是一位母亲。第 21 章第 210 关的【九幽鬼母】，是鬼后斩下的那一半。先击败她，再谈把自己也斩清楚。",
        "button": "先败九幽鬼母",
        "index": 35,
        "chapter": 21,
        "stage": 210
      }
    },
    offline: {
      "short": {
        "title": "闭关片刻",
        "body": "你只离开片刻。洞府的阵还在转，桃树上多了一点香。回来时，案上已有薄薄一层收获。"
      },
      "normal": {
        "title": "闭关归来",
        "body": "神识归位。你不在的这段时辰里，吐纳未停，洞府未歇。收获已写下，账——若有账——也一并无声地添过一笔。"
      },
      "long": {
        "title": "久关初醒",
        "body": "你离开得够久，久到桃核都凉了又热。灵气与灵石按着时辰堆好。有人把茶重新温过，像早已算准你会在这一刻推门。"
      },
      "capped": {
        "title": "闭关已满",
        "body": "单次离线已至上限。再长的夜，也不再替你积下去。田要歇，果也要歇——或者说，有人不愿让你在看不见的地方长得太快。"
      },
      "log": {
        "title": "日志句",
        "body": "闭关归来（离线 {duration}）。吐纳得灵气 {qi}，洞府孕育灵石 {stone}。树与账，都没有停。"
      }
    },
    peach: {
      "locked": "搬血中之后，树才会认你。赠桃三十枚，不是礼物，是第一笔栽培。",
      "full": "仙桃已满。果香溢出来，像在催你再快一点。",
      "upgrade": "树开始蕴养。根系往更深的地方钻，不一定只是为了你。",
      "stageup": "桃树进阶：【{stageName}】。更高的品，更甜的催熟。"
    },
    dongfu: {
      "title": "洞府 · {tier} · 总等级 {lv}。田亩已成，只是尚未写明田主。",
      "upgrade": "扩建【{name}】。多一进房舍，便多一处被人照看的角落。",
      "tierup": "洞府进阶：{name}·{tier}。亮了，也更像一处被安排好的居所。",
      "gongfa_hint": "以灵石参悟功法。气进得越快，果香来得也越早。"
    },
    reincarnation: {
      "subtitle": "天神境起，可兵解重修。道果永留。至于果最终归于谁，账上另有一行。",
      "locked": "需突破至【天神初】，才开得了这一次轮回。开了，不等于能把上一世全部带走。",
      "ready": "境界已够。此世可凝 {n} 枚道果。凝之前想好：下一世见面时，还有谁会叫得出你的名字。",
      "confirm": "转世将重置境界、灵气、灵石以及功法与洞府等级，永久获得 {n} 枚道果，并保留道果秘术。上一世没摘完的，会连核一起被端到下一世。是否踏入轮回？",
      "success": "轮回已成，凝结 {n} 枚道果。资质是长了。香，也更明显了。"
    }
  };

  // 用 vars 替换 {key} 占位；缺失的键保留原样，便于测试发现
  function fmt(template, vars) {
    if (typeof template !== 'string') return '';
    return template.replace(/\{(\w+)\}/g, (m, k) =>
      vars && Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m
    );
  }

  function pick(group, key) {
    const g = DATA[group];
    return g && typeof g[key] === 'string' ? g[key] : null;
  }

  // 取文案；取不到时返回 fallback（调用方传入旧文案，保证缺数据时不出空白）
  function t(group, key, vars, fallback) {
    const s = pick(group, key);
    return s ? fmt(s, vars) : fallback;
  }

  function breakthrough(majorId, kind, vars, fallback) {
    const b = DATA.breakthrough[majorId];
    const s = b && b[kind];
    return s ? fmt(s, vars) : fallback;
  }

  function gate(boss, kind, fallback) {
    const g = DATA.gates[boss];
    return g && typeof g[kind] === 'string' ? g[kind] : fallback;
  }

  // 离线弹窗档位：触顶 / 久关（≥4 小时）/ 片刻（<1 小时）/ 常规
  function offlineTier(report) {
    if (!report) return 'normal';
    if (report.capped) return 'capped';
    const sec = Number(report.effectiveSeconds) || 0;
    if (sec >= 4 * 3600) return 'long';
    if (sec < 3600) return 'short';
    return 'normal';
  }

  function offline(id) {
    return DATA.offline[id] || DATA.offline.normal;
  }

  window.UIText = { data: DATA, fmt, t, breakthrough, gate, offlineTier, offline };
})();
