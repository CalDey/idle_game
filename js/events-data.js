// 挂机随机事件数据（来源：docs/worldbuilding/剧情事件.md 附录 JSON，由「世界观」撰写，用户批准落地）。
// cost / reward 保留文档建议值原样（唯一改动：删去蛟蜕结果文案里给策划看的「（装备为建议掉落）」）；实际发放量由 js/idle-events.js 按当前产出折算（见 scaleQuote）。
// pool：事件池（'idle' 挂机随机事件；后续「洞府机缘」可用 'home' 池复用同一套结算）。tags：境界段标签。
(function () {
  const EVENTS = [
    {
      "id": "evt_blood_debt",
      "pool": "idle",
      "tags": [
        "banxue"
      ],
      "name": "血债讨还",
      "minRealmStage": 0,
      "text": "路边跪着一个搬血失败的修士，精血将近枯干。他求你把他剩下的血带走，别留给随后就会赶到的山贼。",
      "options": [
        {
          "label": "吸走他的精血",
          "cost": {},
          "reward": {
            "qi": 120,
            "stone": 15
          },
          "resultText": "精血入体，他脸上露出释然，随后没了气息。你的搬血之功更进一步，嘴里却有铁锈味。"
        },
        {
          "label": "丢给他一袋灵石，让他走",
          "cost": {
            "stone": 20
          },
          "reward": {},
          "resultText": "他爬起来谢你，走了没多远，寨里的号子还是响了。灵石换不来一条已经破的命。"
        },
        {
          "label": "绕开，当没看见",
          "cost": {},
          "reward": {},
          "resultText": "夜里风向转过来，你听见寨子里有人在笑，像是得了一笔好货。"
        }
      ]
    },
    {
      "id": "evt_village_ash",
      "pool": "idle",
      "tags": [
        "banxue"
      ],
      "name": "焦村余烬",
      "minRealmStage": 0,
      "text": "一座刚被过路修士屠过的村子，残火还没熄。瓦砾下压着一只还温热的储物袋。这样的村子，和晴岚游侠的家乡很像。",
      "options": [
        {
          "label": "翻开储物袋就走",
          "cost": {},
          "reward": {
            "stone": 40,
            "qi": 60
          },
          "resultText": "袋里是人家的活命钱。走出村口时，你总觉得有人在林子里看着你。"
        },
        {
          "label": "先收葬，再取一点安葬余资",
          "cost": {
            "stone": 10
          },
          "reward": {
            "qi": 80
          },
          "resultText": "你用灵石买了薄棺的份，把人埋了。吐纳时心稍定，灵气走得稳一些。"
        },
        {
          "label": "什么都不动，离开",
          "cost": {},
          "reward": {},
          "resultText": "风把灰吹到你靴面上。你没有多看一眼。"
        }
      ]
    },
    {
      "id": "evt_peach_under_tree",
      "pool": ["idle", "home"],
      "tags": [
        "banxue"
      ],
      "name": "树下有人",
      "minRealmStage": 1,
      "text": "仙桃树下站着一个甜美的女仆，像是等了很久。她把一枚桃子递过来，说：「这是给主人的。」你分不清她口中的主人是谁。",
      "options": [
        {
          "label": "接过来，吃下",
          "cost": {},
          "reward": {
            "peach": 2
          },
          "resultText": "桃很甜。她把你的名字记在袖里的册子上，笑着说：「会再来的。」"
        },
        {
          "label": "追问她真正的主人是谁",
          "cost": {},
          "reward": {
            "peach": 3
          },
          "resultText": "她只是笑，又塞给你两枚。册子上多了一笔，写的不是疑问，是「已问」。"
        },
        {
          "label": "不吃，把桃子推回去",
          "cost": {},
          "reward": {},
          "resultText": "她收回桃子，轻声说：「不急。时候未到。」然后像从来没出现过。"
        }
      ]
    },
    {
      "id": "evt_dongtian_leak",
      "pool": ["idle", "home"],
      "tags": [
        "banxue"
      ],
      "name": "洞天漏风",
      "minRealmStage": 3,
      "text": "你新开的洞天在漏，神精往外涌。一个陌生修士愿意用自己的神精帮你堵上，条件是在你的洞天里留一席之地。",
      "options": [
        {
          "label": "答应，让他入住",
          "cost": {},
          "reward": {
            "qi": 800,
            "stone": 50
          },
          "resultText": "洞天一下子饱满了。可那人坐下之后就不怎么说话，像已经把自己算进了你的本源里。"
        },
        {
          "label": "自己硬撑，把裂口压上",
          "cost": {
            "qi": 400
          },
          "reward": {
            "stone": 30
          },
          "resultText": "裂口是堵住了，你吐出一口带血的气。洞天虽小，还是你自己的。"
        },
        {
          "label": "表面答应，反吞他的神精",
          "cost": {},
          "reward": {
            "qi": 1200
          },
          "resultText": "他来不及叫出声。洞天里留下一股腥味，堵是堵住了，夜里会有人在里面敲门。"
        }
      ]
    },
    {
      "id": "evt_canling_beg",
      "pool": ["idle", "home"],
      "tags": [
        "hualing"
      ],
      "name": "残灵乞光",
      "minRealmStage": 6,
      "text": "一缕化灵失败的残灵缠上你的袖口，声音细得像风：「别把我交给黑风寨，他们拿残灵喂刀。把我炼进你的洞天，求你。」",
      "options": [
        {
          "label": "收容进洞天",
          "cost": {
            "qi": 2000
          },
          "reward": {
            "stone": 80,
            "jade": 4
          },
          "resultText": "残灵沉进去，化成一点浑浊的光。你从渣里剔出几块灵玉，洞天里多了一个不敢出声的房客。"
        },
        {
          "label": "用仙桃超度它",
          "cost": {
            "peach": 1
          },
          "reward": {},
          "resultText": "桃香散开，残灵像是说了句谢，然后没了。你什么也没得到，只少了一枚桃。"
        },
        {
          "label": "把它卖给黑风寨的人",
          "cost": {},
          "reward": {
            "stone": 200
          },
          "resultText": "寨子给的价钱很爽快。走远之后，你听见那缕残灵被按进刀脊里的声音。"
        }
      ]
    },
    {
      "id": "evt_heifeng_tax",
      "pool": "idle",
      "tags": [
        "hualing"
      ],
      "name": "黑风过路税",
      "minRealmStage": 6,
      "text": "黑风寨的税官拦在路上，刀柄里嵌着游动的残灵：「化过灵的都要交血税。留一缕灵，或者留下一袋灵石。」",
      "options": [
        {
          "label": "交灵石，买路",
          "cost": {
            "stone": 80
          },
          "reward": {},
          "resultText": "税官点点头，放行。他在册子上写了你的名字，说寨主喜欢记得走路的人。"
        },
        {
          "label": "杀了税官，搜他的税箱",
          "cost": {},
          "reward": {
            "stone": 150,
            "qi": 1500
          },
          "resultText": "残灵刀断在地上。税箱里是别人交上来的血钱。刀脊上的残灵散了，像要把你的味道带回寨里。"
        },
        {
          "label": "留下一个活口，让他带话回去",
          "cost": {},
          "reward": {
            "qi": 400
          },
          "resultText": "你只废了他一只手。活口爬回去，路上的风安静了一阵，像寨子在重新打量你。"
        }
      ]
    },
    {
      "id": "evt_wrong_wen",
      "pool": "idle",
      "tags": [
        "hualing"
      ],
      "name": "错纹噬指",
      "minRealmStage": 9,
      "text": "铭纹时你走了片刻神，杀符爬上指骨，像要往心里钻。再不处理，就会噬主。",
      "options": [
        {
          "label": "砍去这截指骨，重铭",
          "cost": {
            "qi": 6000
          },
          "reward": {
            "jade": 8
          },
          "resultText": "剧痛里符火熄了。断指化成一捧符渣，里面竟凝出几块灵玉。"
        },
        {
          "label": "强行把错纹压回原位",
          "cost": {
            "qi": 12000
          },
          "reward": {
            "jade": 3
          },
          "resultText": "符被你按住了，暂时没有噬心。指骨里却多了一道不属于你的纹，阴天会痒。"
        },
        {
          "label": "把纹转到一个俘虏身上",
          "cost": {},
          "reward": {
            "qi": 8000
          },
          "resultText": "俘虏在地上抽搐，纹从你指上消失。你的铭纹功走得格外顺，耳边却多了一个人的呼吸。"
        }
      ]
    },
    {
      "id": "evt_array_eye",
      "pool": ["idle", "home"],
      "tags": [
        "hualing"
      ],
      "name": "阵眼要人",
      "minRealmStage": 12,
      "text": "身内杀阵铺到最后一环，缺一个阵眼。药园外有个采药的凡人，正把背上的篓子放下歇脚。",
      "options": [
        {
          "label": "把他当作阵眼",
          "cost": {},
          "reward": {
            "stone": 400,
            "qi": 20000
          },
          "resultText": "阵成了。凡人在原处坐下，再也没有起来。洞府的灵石像开了闸。"
        },
        {
          "label": "用自己当阵眼",
          "cost": {
            "qi": 25000
          },
          "reward": {
            "jade": 12
          },
          "resultText": "阵火从心口燎过一轮。你还活着，掌心里多了几块被阵力挤出来的灵玉。"
        },
        {
          "label": "拆掉未成的阵，放那人走",
          "cost": {},
          "reward": {},
          "resultText": "凡人谢也不知道谢谁，背着篓子走了。杀阵缺一角，今夜不会成。"
        }
      ]
    },
    {
      "id": "evt_blood_honor",
      "pool": "idle",
      "tags": [
        "zunzhe"
      ],
      "name": "称尊的代价",
      "minRealmStage": 15,
      "text": "山下几个村子的人来跪，求你做他们的尊者。他们要的其实是你的名号——拿去吓走妖兽，把灾运转到你身上。",
      "options": [
        {
          "label": "接受香火，做他们的尊",
          "cost": {},
          "reward": {
            "stone": 800,
            "qi": 40000
          },
          "resultText": "香火很旺，灵石成箱。你吐纳时闻到血味：有人已经在用你的名字杀人。"
        },
        {
          "label": "把他们赶走，不接这个尊字",
          "cost": {},
          "reward": {},
          "resultText": "村民散了。夜里妖嚎比往日更近，但那不是你的债。"
        },
        {
          "label": "连村子一并祭了，铸自己的尊位",
          "cost": {},
          "reward": {
            "qi": 120000,
            "stone": 200
          },
          "resultText": "《尊者血祭大道》走得极顺。寸草不生的范围，刚好覆盖那些跪过的地方。"
        }
      ]
    },
    {
      "id": "evt_jiao_scale",
      "pool": "idle",
      "tags": [
        "zunzhe"
      ],
      "name": "蛟蜕",
      "minRealmStage": 15,
      "text": "青冥潭边有一截还在跳的蛟鳞，像是青冥蛟后换鳞时落下的。鳞上隐约有被吞掉的尊号。",
      "options": [
        {
          "label": "把蛟鳞炼了",
          "cost": {},
          "reward": {
            "qi": 80000,
            "jade": 20,
            "equip": {
              "quality": "di",
              "qualityName": "地品"
            }
          },
          "resultText": "鳞火入体，你摸到许多失败者的名字。炉里落下一块地品残兵。"
        },
        {
          "label": "把鳞送还潭中",
          "cost": {},
          "reward": {
            "peach": 2
          },
          "resultText": "潭水接住那截鳞，翻了翻，吐出两枚不知谁祭过的桃。蛟后暂记一笔，不算恩，也不算债。"
        },
        {
          "label": "卖给绛华楼的人",
          "cost": {},
          "reward": {
            "stone": 1500
          },
          "resultText": "楼里的人出价干脆，不问来历。临走时说：「蛟后的东西，楼主会感兴趣。」"
        }
      ]
    },
    {
      "id": "evt_borrow_fire",
      "pool": "idle",
      "tags": [
        "zunzhe"
      ],
      "name": "借火过夜",
      "minRealmStage": 18,
      "text": "赤炎荒原的夜里又冷又烫。一团没有人添柴的火主动凑过来，像在等人走进去。火里隐约有旧祭品的轮廓。",
      "options": [
        {
          "label": "借火过夜",
          "cost": {
            "peach": 2
          },
          "reward": {
            "qi": 200000
          },
          "resultText": "一夜无寒。醒来时怀里少了两枚仙桃，像是火的过夜钱。你的神火跳得更亮，也更像别人的。"
        },
        {
          "label": "留下灵石当香火，自己熬夜",
          "cost": {
            "stone": 400
          },
          "reward": {},
          "resultText": "火退开一点。你一夜没睡，但没有把寿元送进去。"
        },
        {
          "label": "试图把这团火吞掉",
          "cost": {
            "qi": 80000
          },
          "reward": {
            "qi": 350000
          },
          "resultText": "火先咬了你一口，再被你按进神火里。多出来的力量里，夹着别人的声音。"
        }
      ]
    },
    {
      "id": "evt_sakura_altar",
      "pool": "idle",
      "tags": [
        "zunzhe"
      ],
      "name": "樱祠残祭",
      "minRealmStage": 18,
      "text": "一座空了的樱祠，巫女不在，祭台还热。台上有没念完的祝词，和一枚烧黑的桃核。",
      "options": [
        {
          "label": "把祝词念完",
          "cost": {},
          "reward": {
            "qi": 150000,
            "peach": 1
          },
          "resultText": "樱火跳了一下。你得了一枚桃，同时忘记了一件小事——你想不起来是哪一件。"
        },
        {
          "label": "只带走桃核",
          "cost": {},
          "reward": {
            "peach": 3
          },
          "resultText": "桃核在手里重新有了香气。祭台的火低了一寸，像少喂了一口。"
        },
        {
          "label": "浇灭祭火",
          "cost": {},
          "reward": {
            "jade": 10
          },
          "resultText": "火灭时，祭灰里滚出几块灵玉。有个念祝词的人会记得这件事。"
        }
      ]
    },
    {
      "id": "evt_false_god",
      "pool": "idle",
      "tags": [
        "zhenyi"
      ],
      "name": "假神香案",
      "minRealmStage": 21,
      "text": "有人在荒原上立了你的牌位，当神来拜。香火很旺，跪着的人脸色蜡黄，像是寿元正在往香里走。",
      "options": [
        {
          "label": "收下香火",
          "cost": {},
          "reward": {
            "stone": 3000,
            "qi": 400000
          },
          "resultText": "灵石和灵气都来得容易。你看见自己的神形稳了一分，也脏了一分。"
        },
        {
          "label": "推倒牌位，散了香火",
          "cost": {},
          "reward": {
            "jade": 15
          },
          "resultText": "牌碎成渣，里面嵌着拜神的人偷偷塞进去的灵玉。他们看着你，像看着一座塌了的庙。"
        },
        {
          "label": "把香案留给后来的审判者",
          "cost": {},
          "reward": {},
          "resultText": "你没有动手。牌位还在，香还在烧。这件事会传到真正会审判的人耳朵里。"
        }
      ]
    },
    {
      "id": "evt_shengji_altar",
      "pool": "idle",
      "tags": [
        "zhenyi"
      ],
      "name": "祭台空位",
      "minRealmStage": 24,
      "text": "圣祭在即，你梦见自己躺在祭台上。旁边还有一个空位，写过一个名字，又被划掉。那字迹很熟，又不敢认。",
      "options": [
        {
          "label": "醒来后去查那个被划掉的名字",
          "cost": {
            "stone": 800
          },
          "reward": {
            "jade": 20,
            "qi": 200000
          },
          "resultText": "绛华楼一类的渠道愿意卖消息：有人在圣祭失败后逃向更北的冰海。你买到一块冰屑似的灵玉。"
        },
        {
          "label": "在梦里把自己的名字也划掉",
          "cost": {
            "qi": 500000
          },
          "reward": {},
          "resultText": "祭台空了一息。你冒了一身冷汗醒来，灵气散了大半，像是有人暂时找不到你。"
        },
        {
          "label": "不管这个梦",
          "cost": {},
          "reward": {},
          "resultText": "空位还在那里。你出关时，风里有一点霜味。"
        }
      ]
    },
    {
      "id": "evt_chiyan_tribute",
      "pool": "idle",
      "tags": [
        "zhenyi"
      ],
      "name": "赤炎贡品",
      "minRealmStage": 24,
      "text": "几个魔修把一笼还活着的人送到你面前，说是给「下一任祭品」的见面礼，让你带去见赤炎魔君。",
      "options": [
        {
          "label": "收下，炼了",
          "cost": {},
          "reward": {
            "qi": 800000,
            "stone": 2000
          },
          "resultText": "笼里很快没了声音。神火吃得很饱，像已经预演过一次圣祭。"
        },
        {
          "label": "放人，把魔修赶走",
          "cost": {},
          "reward": {
            "peach": 4
          },
          "resultText": "被放走的人把偷藏的几枚桃塞到你手里，不敢道谢，散进了荒原。"
        },
        {
          "label": "连魔修一并烧了",
          "cost": {},
          "reward": {
            "jade": 25,
            "stone": 500
          },
          "resultText": "火起得很快。灰烬里有魔修私藏的灵玉。赤炎一侧会记下这笔。"
        }
      ]
    },
    {
      "id": "evt_ice_shard",
      "pool": "idle",
      "tags": [
        "zhenyi"
      ],
      "name": "未燃的霜",
      "minRealmStage": 24,
      "text": "荒原边缘漂来一块不化的冰。冰里封着半枚还在跳的神火，像是某个圣祭失败者逃走时落下的。冰面映出一张很淡的脸。",
      "options": [
        {
          "label": "敲开冰，吞那半枚神火",
          "cost": {},
          "reward": {
            "qi": 600000,
            "jade": 18
          },
          "resultText": "火入体时极冷。你得了力量，也得了一段不属于你的困倦，像是想再睡三百年。"
        },
        {
          "label": "把冰送往更北的海",
          "cost": {
            "stone": 600
          },
          "reward": {
            "peach": 2
          },
          "resultText": "你雇人把冰往更北的海送。回礼是两枚冻得发硬的桃，来路不明。"
        },
        {
          "label": "原样埋回沙里",
          "cost": {},
          "reward": {},
          "resultText": "冰沉下去，荒原又热起来。有人会来找它，但不是今天。"
        }
      ]
    },
    {
      "id": "evt_reincarnate_tea",
      "pool": ["idle", "home"],
      "tags": [
        "tianshen"
      ],
      "name": "送行的茶",
      "minRealmStage": 27,
      "text": "轮回当前，甜心女仆端来一杯茶，放在你案上，说：「这一世的账，该结了。」茶香很甜，甜得像仙桃。",
      "options": [
        {
          "label": "喝下",
          "cost": {},
          "reward": {
            "daoguo": 1
          },
          "resultText": "茶入喉，这一世的轮廓淡了一层。她在册子上记了一笔。你得了一点道果，像是被准许再种一轮。"
        },
        {
          "label": "追问收款方是谁",
          "cost": {},
          "reward": {
            "daoguo": 1,
            "peach": 1
          },
          "resultText": "她不答，只是又斟了半杯，补给你一枚桃。册子比刚才更完整，你仍不知道那一栏写的是什么。"
        },
        {
          "label": "把茶泼掉",
          "cost": {},
          "reward": {},
          "resultText": "茶浇在地上，很快渗尽。她轻轻说：「时候未到。」然后把杯子洗干净，当这杯茶没存在过。"
        }
      ]
    },
    {
      "id": "evt_ledger_name",
      "pool": ["idle", "home"],
      "tags": [
        "tianshen"
      ],
      "name": "不敢念的名",
      "minRealmStage": 27,
      "text": "墨兰执事把账本摔在你案上。收款方那一栏空着，却有被反复描过、又被擦掉的痕迹。她说：「我不敢念。你自己看。」",
      "options": [
        {
          "label": "逼她把那一行说出来",
          "cost": {
            "stone": 2000
          },
          "reward": {
            "daoguo": 1
          },
          "resultText": "她的嘴唇动了动，那个字还是没说完整。你只看见收款方那一栏的擦痕指向更高处。你因此看清了一点轮回的底，她把自己的名字又往账上按深了一分。"
        },
        {
          "label": "让她把这一页烧掉",
          "cost": {},
          "reward": {
            "jade": 30
          },
          "resultText": "纸灰里滚出几块压在账本夹层里的灵玉。线索断了，她松了一口气，也更不敢看你。"
        },
        {
          "label": "自己默读那一行",
          "cost": {
            "qi": 1000000
          },
          "reward": {
            "daoguo": 1,
            "jade": 10
          },
          "resultText": "名号压下来，灵气散去一大截。你没把那几个字读出声，却已经记住了。"
        }
      ]
    },
    {
      "id": "evt_xudao_name",
      "pool": "idle",
      "tags": [
        "tianshen"
      ],
      "name": "名字淡了",
      "minRealmStage": 30,
      "text": "有一天你叫不出自己的名字。虚空里有个没有面孔的声音说，可以替你保管这个名字，让你继续往前走。",
      "options": [
        {
          "label": "把名字交出去",
          "cost": {},
          "reward": {
            "qi": 5000000
          },
          "resultText": "路一下子宽了。灵气如潮，可你在铜镜里看自己时，要先想一想该叫什么。"
        },
        {
          "label": "用一枚道果把名字钉回去",
          "cost": {
            "daoguo": 1
          },
          "reward": {
            "jade": 40
          },
          "resultText": "道果燃尽，名字回到舌尖。你少了一枚道果，多了一点还属于自己的东西。"
        },
        {
          "label": "去问一个吞过光的人该怎么记",
          "cost": {},
          "reward": {
            "qi": 800000,
            "peach": 2
          },
          "resultText": "有人教你吞一口残光来记住自己。名字暂时回来了。远处似乎有剑意停了一停。"
        }
      ]
    },
    {
      "id": "evt_tianshen_kneel",
      "pool": "idle",
      "tags": [
        "tianshen"
      ],
      "name": "下境跪潮",
      "minRealmStage": 27,
      "text": "你的威压扫过一座下境的城。修士和凡人一起跪了，有人把库房的钥匙送上来，手在抖。",
      "options": [
        {
          "label": "收下库房",
          "cost": {},
          "reward": {
            "stone": 20000,
            "jade": 80
          },
          "resultText": "灵石和灵玉堆到你面前。城还在，只是以后会用你的年号记账。"
        },
        {
          "label": "收势，让他们起来",
          "cost": {},
          "reward": {
            "qi": 1500000
          },
          "resultText": "跪潮散了。你把威压收回骨里，吐纳反而清了一点。"
        },
        {
          "label": "把整座城划进自己的洞天",
          "cost": {},
          "reward": {
            "stone": 50000,
            "qi": 3000000
          },
          "resultText": "三十六洞天福地又多了一角。城里的灯火在你体内亮着，像一串不会灭的账。"
        }
      ]
    },
    {
      "id": "evt_sever_heart",
      "pool": "idle",
      "tags": [
        "zhanwo"
      ],
      "name": "该斩的那一刀",
      "minRealmStage": 33,
      "text": "斩我在即，你看见自己最重的执念站在对面，长得像某个你不愿失去的同伴。它张开手，等你下刀。",
      "options": [
        {
          "label": "斩下去",
          "cost": {},
          "reward": {
            "qi": 20000000,
            "daoguo": 1
          },
          "resultText": "刀过之后，路极明。你得了道果与海量灵气，也有一块地方再也热不起来。"
        },
        {
          "label": "改斩一段不那么疼的记忆",
          "cost": {
            "qi": 8000000
          },
          "reward": {
            "qi": 5000000
          },
          "resultText": "你斩偏了。执念还在，只是换了一张更模糊的脸。此关不会因为这一刀而结束。"
        },
        {
          "label": "先去九幽，问鬼后这一刀该怎么斩",
          "cost": {},
          "reward": {
            "peach": 5,
            "jade": 40
          },
          "resultText": "她说：「斩了就回不来。」然后给你一盏没有点火的冷灯，和几枚从冥路上捡来的桃。"
        }
      ]
    },
    {
      "id": "evt_ghost_lamp",
      "pool": "idle",
      "tags": [
        "zhanwo"
      ],
      "name": "冥灯问路",
      "minRealmStage": 33,
      "text": "九幽里唯一的光是幽冥鬼后的冥灯。灯里传来孩子的哭声，求你把他们放走。灯外很静，像有人在听你怎么选。",
      "options": [
        {
          "label": "伸手去摘灯",
          "cost": {
            "qi": 15000000
          },
          "reward": {
            "daoguo": 1
          },
          "resultText": "冥灯摄了你一眼，灵气大损。你因此看见灯里都是谁，也得了一点不该得的道果。手缩回来时是空的。"
        },
        {
          "label": "假装没听见，走过",
          "cost": {},
          "reward": {},
          "resultText": "哭声在身后停了一停，又继续。路是通的，灯也还在原处。"
        },
        {
          "label": "滴一滴自己的血进去",
          "cost": {
            "qi": 5000000
          },
          "reward": {
            "jade": 50
          },
          "resultText": "灯亮了一寸。哭声小了。你掌心里多了几块魂霜凝成的灵玉。有人记住了你的血味。"
        }
      ]
    },
    {
      "id": "evt_sword_ask",
      "pool": "idle",
      "tags": [
        "zhanwo"
      ],
      "name": "执剑来问",
      "minRealmStage": 36,
      "minChapter": 26,
      "text": "天外的碎星之间，清冷剑仙拦在你面前。她不问你从哪来，只问：「你是否听过『果子』二字。」剑里有许多残魂，像在等一个答案。",
      "options": [
        {
          "label": "承认，并追问那是什么意思",
          "cost": {
            "qi": 20000000
          },
          "reward": {
            "daoguo": 1,
            "jade": 60
          },
          "resultText": "她没有回答，剑意擦过你的肩。残魂的低语里，你听清了一点更高处的事，也丢了一大截灵气。"
        },
        {
          "label": "否认，请她让路",
          "cost": {},
          "reward": {},
          "resultText": "她看了你一眼，侧身让开。碎星重新开始落。你安全，也什么都没问到。"
        },
        {
          "label": "把一个叛仙的行踪告诉她",
          "cost": {},
          "reward": {
            "stone": 80000
          },
          "resultText": "她收下这个名字，留下一笔天外才用得上的灵石。远处有一件黑氅似乎抖了一下。"
        }
      ]
    },
    {
      "id": "evt_ripe_fruit",
      "pool": "idle",
      "tags": [
        "zhanwo"
      ],
      "name": "果香",
      "minRealmStage": 39,
      "text": "至尊境上，你第一次闻到自己身上的果香。很甜，甜得不像修来的东西。远方有什么在吸气，像已经坐下开席。",
      "options": [
        {
          "label": "把香气藏进洞天",
          "cost": {
            "qi": 80000000,
            "stone": 30000
          },
          "reward": {
            "jade": 100
          },
          "resultText": "你用灵气和灵石把香气按进祖脉深处。席还在远处，只是暂时闻不到你。压香的渣凝成灵玉。"
        },
        {
          "label": "顺着香气走向上方",
          "cost": {},
          "reward": {
            "daoguo": 2,
            "peach": 8
          },
          "resultText": "路很短。你得了道果和几枚极甜的桃，也走得离那席更近。甜心女仆若在场，会为你整理衣领。"
        },
        {
          "label": "去找一件能吞光的黑氅遮住香气",
          "cost": {
            "peach": 6
          },
          "reward": {
            "qi": 40000000
          },
          "resultText": "有人借你遮一遮，代价是几枚桃里的光。香淡了。她说：「熟了就会被摘。你最好还生着。」"
        }
      ]
    }
  ];
  window.GameEventsData = { version: 1, events: EVENTS };
})();
