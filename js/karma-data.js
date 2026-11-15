// 因果回收定稿 v1 数据（文案来自 因果回收定稿_v1.json；奖励来自 karma_rewards_v2.md）。
// 心口阵纹按用户指定用保守方案：下一次大境界渡劫成功率 +30%，失败不扣灵气；文案不得写成渡劫一定成功。
(function () {
  const PORTRAIT_V = 1;
  const CALLBACKS = [
    {
      id: 'kc_old_clerk',
      name: '旧账房',
      source: { event: 'evt_heifeng_tax', choice: 0 },
      trigger: { minChapter: 5 },
      text: '黑风寨散了。一个女账房抱着账本逃到你洞府门口，身后是追兵的火把。账本上交过血税的名字，后面大多画了红圈。你的名字后面，没画。',
      options: [
        {
          label: '收留她',
          cost: {},
          reward: { stonesSec: 300, qiSec: 60, lingyu: 30, peaches: 6 },
          resultText: '她把当年那袋灵石原样退回，还多压了一层：「寨主说，要记得走路的人。我也记得。」',
          ink: 'pale',
          ledgerResult: '旧账房：收留。税已退还。'
        },
        {
          label: '把她交给追兵',
          cost: {},
          reward: { stonesSec: 180, lingyu: 15 },
          resultText: '赏钱很快到手。火把走远时，她回头看了你一眼，像在账本上替你补了一个红圈。',
          ink: 'red',
          ledgerResult: '旧账房：交出。卖了一个记得你的人。'
        }
      ]
    },
    {
      id: 'kc_blade_spirit',
      name: '残灵索刀',
      source: { event: 'evt_heifeng_tax', choice: 1 },
      trigger: { minChapter: 4 },
      portrait: {
        id: 'daoling',
        src: 'assets/npc/npc_daoling.webp',
        hd: 'assets/npc/npc_daoling_hd.jpg',
        v: PORTRAIT_V,
        position: '38% 28%'
      },
      text: '那把断掉的残灵刀没有散干净。刀里的残灵记住了你的味道，聚成一个女刀灵，夜夜坐在你洞府外，拿你的门槛磨刀。',
      options: [
        {
          label: '斩了她',
          cost: {},
          reward: { stonesSec: 120, lingyu: 24 },
          resultText: '刀灵碎成一地铁屑，屑里还缠着几缕没喂完的残灵。门槛上的刀痕，第二天还在。',
          ink: 'red',
          ledgerResult: '残灵索刀：斩了。门槛上的刀痕还在。'
        },
        {
          label: '收作器灵',
          cost: {},
          reward: {},
          resultText: '她化进你的法宝里，刀意一下子利了。她贴着你耳边说：「你输一次，我就咬你一口。」',
          ink: 'pale',
          ledgerResult: '残灵索刀：收作器灵。她还在磨刀。',
          effect: { type: 'artifactBuff', atkMult: 0.06, onBattleLoss: { qiLossExtraPct: 0.05 } }
        },
        {
          label: '把税箱还给她',
          cost: { stonesSec: 300 },
          reward: {},
          resultText: '你把那只税箱推到门外。她数了一夜，数到天亮，磨刀声停了。',
          ink: 'pale',
          ledgerResult: '残灵索刀：税箱已还。'
        }
      ]
    },
    {
      id: 'kc_one_arm',
      name: '独臂税官',
      source: { event: 'evt_heifeng_tax', choice: 2 },
      trigger: { minChapter: 7 },
      text: '前路被一伙人拦住。领头的只剩一只手，如今已是别处的寨头。他看清是你，抬手让开：「你留过我一只手。」',
      options: [
        {
          label: '收下他的人情',
          cost: {},
          reward: { lingyu: 20 },
          resultText: '他凑近说了一句话，关于下一座山头上等着你的东西。说完就走，像还清了一笔账。',
          ink: 'pale',
          ledgerResult: '独臂税官：人情已收。',
          effect: { type: 'bossIntel', target: 'nextBoss', bossDmgMult: 0.12, showRecCp: true }
        },
        {
          label: '不要人情，要他剩下那只手',
          cost: {},
          reward: { stonesSec: 300, lingyu: 40, peaches: 8 },
          resultText: '他没有求饶，只求你放过寨里的人。你收下那只手，寨子当夜就散了。',
          ink: 'red',
          ledgerResult: '独臂税官：两只手，都留在你这里。'
        },
        {
          label: '什么都不要，放他走',
          cost: {},
          reward: {},
          resultText: '他愣了很久，才带人让出整条路。你什么也没拿，路上的风却顺了。',
          ink: 'pale',
          ledgerResult: '独臂税官：放走了。'
        }
      ]
    },
    {
      id: 'kc_peach_debt',
      name: '桃债',
      source: { event: 'evt_peach_under_tree', choice: 0 },
      trigger: { minChapter: 12 },
      text: '她又站在那棵树下，像从来没离开过：「主人的桃，是要还的。」你想吐出来，可那枚桃早就长进了你的修为里。',
      textIfOwned: {
        heroId: 'sweetmaid',
        text: '她端着一只空盘走进你的洞府，笑得和那天一样：「主人的桃，是要还的。」你想吐出来，可那枚桃早就长进了你的修为里。'
      },
      options: [
        {
          label: '还',
          cost: { qiReqPct: 0.15 },
          reward: { stonesSec: 360, lingyu: 60, peaches: 12 },
          resultText: '一截修为被她轻轻抽走，像抽一根线。随后她放下一份更重的回礼，在袖里的册子上划掉一笔：「这样，才不算欠。」',
          ink: 'pale',
          ledgerResult: '桃债：已还。她的册子上划掉了一笔。'
        }
      ]
    },
    {
      id: 'kc_asked',
      name: '已问',
      source: { event: 'evt_peach_under_tree', choice: 1 },
      trigger: { minChapter: 20 },
      text: '那一夜，你的仙姬们做了同一个梦：有人在很远的地方念你的名字，念完，后面跟着两个字——「已问」。',
      textIfOwned: {
        heroId: 'sweetmaid',
        text: '那一夜，你的仙姬们做了同一个梦：有人在很远的地方念你的名字，念完，后面跟着两个字——「已问」。醒来时，甜心女仆已经候在门外，问你睡得好不好。'
      },
      options: [
        {
          label: '醒来去问她们',
          cost: {},
          reward: { lingyu: 40 },
          resultText: '她们各自说了梦里的细节。拼起来，什么都对得上，只少一个名字。',
          ink: 'pale',
          ledgerResult: '已问：████████（这一行被墨涂掉了）',
          effect: { type: 'dispatchOrBondBonus', dispatchYield: 0.15, durationDays: 7 }
        },
        {
          label: '当没梦见',
          cost: {},
          reward: {},
          resultText: '你翻身睡去。因果簿上这一页，有一行被墨涂掉了。',
          ink: 'pale',
          ledgerResult: '已问：████████（这一行被墨涂掉了）'
        }
      ]
    },
    {
      id: 'kc_ripe',
      name: '时候已到',
      source: { event: 'evt_peach_under_tree', choice: 2 },
      trigger: { minChapter: 25 },
      text: '她又来了。桃已经熟透，皮上发黑：「上次你推回来了。这次，不能推了。」',
      textIfOwned: {
        heroId: 'sweetmaid',
        text: '她捧着那枚桃走进你的洞府。桃已经熟透，皮上发黑：「上次你推回来了。这次，不能推了。」'
      },
      options: [
        {
          label: '收下',
          cost: {},
          reward: { qiSec: 120, lingyu: 80, peaches: 16 },
          resultText: '桃一入口就化了，甜得发苦。她看着你咽下去，才轻声说：「好孩子。」',
          ink: 'pale',
          ledgerResult: '时候已到：收下了。'
        },
        {
          label: '再推一次',
          cost: {},
          reward: {},
          resultText: '她不恼，只是把桃收回袖里：「那就再等等。」',
          ink: 'pale',
          ledgerResult: '时候已到：又推了一次。此账未了。',
          keepOpen: true,
          retryAfterChapters: 1
        }
      ]
    },
    {
      id: 'kc_basket_bones',
      name: '篓中骨',
      source: { event: 'evt_array_eye', choice: 0 },
      trigger: { afterChapters: 1 },
      portrait: {
        id: 'caiyao',
        src: 'assets/npc/npc_caiyao.webp',
        hd: 'assets/npc/npc_caiyao_hd.jpg',
        v: PORTRAIT_V,
        position: '60% 18%'
      },
      text: '一个采药女背着那只篓子，跪在你的药园外。篓里不是药，是她父亲的骨头。她不哭，只问你：「阵成了吗？」',
      options: [
        {
          label: '阵还缺一个眼',
          cost: {},
          reward: { stonesSec: 240, lingyu: 24 },
          resultText: '她没有跑。阵又亮了一层，篓子倒在药园外，再没人来收。',
          ink: 'red',
          ledgerResult: '篓中骨：她也成了阵眼。'
        },
        {
          label: '给灵石打发她',
          cost: { stonesSec: 300 },
          reward: {},
          resultText: '她把灵石收进篓里，压在骨头上面，背起来走了。走得很慢。',
          ink: 'pale',
          ledgerResult: '篓中骨：用灵石打发了。'
        },
        {
          label: '收她做药园杂役',
          cost: {},
          reward: {},
          resultText: '她留下来照看药园，药长得出奇地好。每天收工，她都隔着篱笆看你一眼。',
          ink: 'pale',
          ledgerResult: '篓中骨：她在药园里，每天看你一眼。',
          effect: { type: 'gardenBonus', dongfuStonePerSec: 0.08 }
        }
      ]
    },
    {
      id: 'kc_heart_rune',
      name: '心口阵纹',
      source: { event: 'evt_array_eye', choice: 1 },
      trigger: { onNextMajorTribulation: true },
      auto: true,
      tribulationLine: '阵纹替你烧了一轮。',
      text: '心口那道旧阵纹亮了起来，替你吞下一道雷，烧成一道疤。',
      options: [
        {
          label: '（自动结算）',
          cost: {},
          reward: { lingyu: 20, tribulation: { rateBonus: 0.30, noQiLossOnFail: true } },
          resultText: '心口多了一道疤，雷声比往常轻了一些。',
          ink: 'pale',
          ledgerResult: '心口阵纹：替你挡了一道雷。'
        }
      ]
    },
    {
      id: 'kc_return_basket',
      name: '还篓',
      source: { event: 'evt_array_eye', choice: 2 },
      trigger: { afterChapters: 2 },
      text: '一个少年送来一篓灵药，说是爷爷让送的：「爷爷说，那天他其实看见了阵。」篓底压着一张别人的阵图，阵眼那一格，画的也是个凡人。',
      options: [
        {
          label: '收下灵药',
          cost: {},
          reward: { stonesSec: 240, lingyu: 30, peaches: 12 },
          resultText: '药是好药。阵图你折起来收着，没有再看。',
          ink: 'pale',
          ledgerResult: '还篓：收下了。阵图压在箱底。'
        },
        {
          label: '照着阵图，去找那个修士',
          cost: {},
          reward: {},
          resultText: '那人的阵还没成。阵眼那一格的凡人，你放走了。',
          ink: 'red',
          ledgerResult: '还篓：照图寻人。',
          effect: { type: 'eliteBattle', eliteMult: 1.35 },
          resultWin: '那人的阵还没成。阵眼那一格的凡人，你放走了。',
          resultLose: '你没能破阵。阵图上那一格凡人，被人用朱砂涂满了。',
          rewardWin: { stonesSec: 360, lingyu: 50, peaches: 10 }
        }
      ]
    }
  ];

  const BOSS_PREFIGHT = {
    stage: 30,
    bossName: '黑风寨主',
    lines: {
      0: '记得你，走路的人。',
      1: '我的刀，在你身上留了味。',
      2: '带话那个，现在只剩一只手。你倒是会记账。'
    }
  };

  const LEDGER_UI = {
    name: '因果簿',
    firstAppearToast: '背包里多了一本你没写过的册子。它自己翻开，多了一笔。',
    tabDesc: '你做过的事，都有人记着。',
    status: { open: '此账未了', closed: '已了' },
    entryTemplate: '{name}　你当时：{choice}　{status}',
    closedTemplate: '{ledgerResult}',
    sourceChoices: {
      evt_heifeng_tax: [
        { text: '交了灵石，买路。', ink: 'pale' },
        { text: '杀了税官，搜了税箱。', ink: 'red' },
        { text: '废了他一只手，留他带话。', ink: 'red' }
      ],
      evt_peach_under_tree: [
        { text: '接过桃，吃了。', ink: 'pale' },
        { text: '追问她的主人是谁。', ink: 'pale' },
        { text: '把桃推了回去。', ink: 'pale' }
      ],
      evt_array_eye: [
        { text: '把采药的凡人当成阵眼。', ink: 'red' },
        { text: '用自己当阵眼。', ink: 'pale' },
        { text: '拆了阵，放那人走。', ink: 'pale' }
      ]
    }
  };

  const SOURCE_IDS = ['evt_heifeng_tax', 'evt_peach_under_tree', 'evt_array_eye'];

  const data = { CALLBACKS, BOSS_PREFIGHT, LEDGER_UI, SOURCE_IDS, PORTRAIT_V };
  const root = typeof window !== 'undefined' ? window : globalThis;
  root.KarmaData = data;
  if (typeof module !== 'undefined' && module.exports) module.exports = data;
})();
