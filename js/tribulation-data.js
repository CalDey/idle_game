// 大境界渡劫演出文案与闪电折线预设。纯数据，可供 UI 与测试读取。
// 第 1、2 道天雷永远用通用句；第 3 道按目标大境界取专属句，缺则回退通用第 3 句。
// 成功标语主句用 {realm} 占位，代入新境界全名；境界描述从修行页现有 stage.desc 读取，不写在本表。
(function (root) {
  const GENERIC_STRIKES = [
    '天在看你。',
    '它记下了你的名字。',
    '熬过去，你欠它的就更多。'
  ];

  // key 必须是 GameConfig.MAJOR_REALMS 里的 name（目标大境界，不含搬血——搬血不是渡劫进入的）。
  const STRIKE3_BY_REALM = {
    '洞天': '体内开了一口天，从此有东西能住进来。',
    '化灵': '血肉学会了说话，先学会的是饿。',
    '铭纹': '纹刻进骨里，疼是它的落款。',
    '列阵': '你把自己排成阵，阵眼空着一个位置。',
    '尊者': '被人跪拜的滋味，比雷还烫。',
    '神火': '火是你点的，柴是你剩下的人性。',
    '真一': '万般归一，归掉的那些不会再回来。',
    '圣祭': '祭坛已经摆好，这回的祭品是谁，你心里清楚。',
    '天神': '你成了天的一角，天也在你身上占了一角。',
    '虚道': '道是虚的，代价是实的。',
    '斩我': '这道雷劈的不是你，是你舍不得的那个你。',
    '遁一': '天地间只剩一道缝，你得把自己挤进去。',
    '至尊': '再无人在你之上。至少你看得见的，没有。'
  };

  const SUCCESS_MAIN = '渡劫成功，此身已入{realm}';
  const SUCCESS_SUB = '天雷散了，账还在。';

  // 3–4 组预设折线（viewBox 0 0 100 100，百分比坐标），演出时随机取用，不生成新形状。
  const BOLT_PRESETS = [
    [[48, -6], [41, 14], [57, 22], [38, 38], [60, 48], [44, 63], [55, 78], [47, 108]],
    [[52, -8], [62, 12], [40, 24], [58, 36], [35, 52], [54, 66], [42, 84], [51, 108]],
    [[46, -5], [55, 16], [33, 28], [61, 40], [42, 55], [64, 70], [39, 86], [50, 108]],
    [[51, -7], [36, 15], [59, 26], [45, 41], [66, 54], [40, 69], [58, 85], [49, 108]]
  ];

  function strikeCaptions(majorName) {
    const third = STRIKE3_BY_REALM[majorName] || GENERIC_STRIKES[2];
    return [GENERIC_STRIKES[0], GENERIC_STRIKES[1], third];
  }

  function successMain(realmFullName) {
    return SUCCESS_MAIN.replace('{realm}', realmFullName || '');
  }

  const TribulationData = {
    GENERIC_STRIKES,
    STRIKE3_BY_REALM,
    SUCCESS_MAIN,
    SUCCESS_SUB,
    BOLT_PRESETS,
    strikeCaptions,
    successMain
  };

  root.TribulationData = TribulationData;
  if (typeof module !== 'undefined' && module.exports) module.exports = TribulationData;
})(typeof window !== 'undefined' ? window : globalThis);
