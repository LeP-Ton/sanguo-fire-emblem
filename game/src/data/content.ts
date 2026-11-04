/** 原创首关对白；只表达当前已实现的章节与教学规则。 */
export interface DialogueLine {
  speaker: string;
  portraitId: string;
  text: string;
}
export type ContentStatus = 'planned' | 'draft' | 'playable';

export const openingDialogue: DialogueLine[] = [
  {
    speaker: '刘备',
    portraitId: 'liu_bei_early_calm',
    text: '桃花又开了，村外却尽是流离之人。备虽无长物，愿以此身，护得一方安宁。',
  },
  {
    speaker: '关羽',
    portraitId: 'guan_yu_early_calm',
    text: '云长愿与兄同往。今日结义，不求富贵，但求无愧于心。',
  },
  {
    speaker: '张飞',
    portraitId: 'zhang_fei_early_calm',
    text: '算俺一个！三人同心，还怕救不了乡亲？门外那伙黄巾散兵，正好试试俺的蛇矛。',
  },
  {
    speaker: '刘备',
    portraitId: 'liu_bei_early_calm',
    text: '莫急。敌兵持剑，翼德的长枪可占先机；云长持刀，遇剑须慎。咱们照应着走，谁也不能落下。',
  },
  {
    speaker: '关羽',
    portraitId: 'guan_yu_early_calm',
    text: '村口道路开阔，林地可借势避敌。兄长居中接应，翼德随我迎战。',
  },
];

export const victoryDialogue: DialogueLine[] = [
  {
    speaker: '刘备',
    portraitId: 'liu_bei_early_calm',
    text: '敌人已退。先照看受伤的乡亲，粮食一粒也不可取。今日之胜，是你我同心之功。',
  },
  {
    speaker: '张飞',
    portraitId: 'zhang_fei_early_calm',
    text: '痛快！不过俺记住了：枪长有枪长的好处，冲得太远，也得吃亏。',
  },
  {
    speaker: '简雍',
    portraitId: 'jian_yong_standard_calm',
    text: '玄德，你守住了村子，我也不能只站在一旁说话。简雍愿随你们同行，跑腿传信，总能出一分力。',
  },
  {
    speaker: '刘备',
    portraitId: 'liu_bei_early_calm',
    text: '宪和相助，求之不得。今日桃园有约，往后风雨同路。待安顿好乡亲，便启程从军。',
  },
];

export interface CharacterPlan {
  id: string;
  name: string;
  route: string;
  classes: [string, string, string | null];
  skillName: string;
  status: ContentStatus;
  availability: string;
}

// 同名转职阶段保留数组位置；高顺三阶明确为空，后续规则不从显示名推导。
export const characters: CharacterPlan[] = [
  {
    id: 'liu_bei',
    name: '刘备',
    route: '两线',
    classes: ['步兵（剑）', '主公', '昭烈'],
    skillName: '仁德',
    status: 'playable',
    availability: '第1关可操作',
  },
  {
    id: 'guan_yu',
    name: '关羽',
    route: '两线',
    classes: ['步兵（刀斧）', '勇士', '武圣'],
    skillName: '威震华夏',
    status: 'playable',
    availability: '第1关可操作',
  },
  {
    id: 'zhang_fei',
    name: '张飞',
    route: '两线',
    classes: ['步兵（枪）', '枪斗士', '虎威'],
    skillName: '当阳怒吼',
    status: 'playable',
    availability: '第1关可操作',
  },
  {
    id: 'jian_yong',
    name: '简雍',
    route: '两线',
    classes: ['儒生', '名士', '大儒'],
    skillName: '舌灿莲花',
    status: 'draft',
    availability: '第1关胜利剧情后入队；首关不可操作',
  },
  {
    id: 'zhang_zheng',
    name: '张徵',
    route: '两线',
    classes: ['术士', '道师', '天师'],
    skillName: '驱邪破妄',
    status: 'planned',
    availability: '第3关战后',
  },
  {
    id: 'gao_sheng',
    name: '高升',
    route: '两线',
    classes: ['弓兵', '狙击手', '神射手'],
    skillName: '强弓硬弩',
    status: 'planned',
    availability: '第4关归降；现有持刀立绘待返修',
  },
  {
    id: 'zhao_yun',
    name: '赵云',
    route: '两线',
    classes: ['轻骑', '骠骑将军', '龙骧'],
    skillName: '七进七出',
    status: 'planned',
    availability: '第5关临时、联军离散离队、外传2正式',
  },
  {
    id: 'mi_zhu',
    name: '糜竺',
    route: '两线',
    classes: ['商贾', '后勤官', '安汉将军'],
    skillName: '富甲一方',
    status: 'planned',
    availability: '外传1暂时参战、第7关正式',
  },
  {
    id: 'zhuge_liang',
    name: '诸葛亮',
    route: '两线',
    classes: ['策士', '军师', '汉丞相'],
    skillName: '卧龙出山',
    status: 'planned',
    availability: '第12关',
  },
  {
    id: 'ma_liang',
    name: '马良',
    route: '两线',
    classes: ['策士', '谋士', '白眉'],
    skillName: '白眉最良',
    status: 'planned',
    availability: '第11关',
  },
  {
    id: 'yi_ji',
    name: '伊籍',
    route: '两线',
    classes: ['策士', '谋士', '外交家'],
    skillName: '机伯巧辩',
    status: 'planned',
    availability: '第11关',
  },
  {
    id: 'sun_shang_xiang',
    name: '孙尚香',
    route: '两线',
    classes: ['弓兵', '游侠', '巾帼'],
    skillName: '弓腰姬',
    status: 'planned',
    availability: '第16关',
  },
  {
    id: 'huang_zhong',
    name: '黄忠',
    route: '两线',
    classes: ['弓兵', '弓骑兵', '后将军'],
    skillName: '老当益壮',
    status: 'planned',
    availability: '第18关',
  },
  {
    id: 'wei_yan',
    name: '魏延',
    route: '两线',
    classes: ['步兵', '勇士', '汉中侯'],
    skillName: '奇谋险计',
    status: 'planned',
    availability: '第18关',
  },
  {
    id: 'pang_tong',
    name: '庞统',
    route: '正史阵亡 / IF存活',
    classes: ['策士', '军师', '军师中郎将'],
    skillName: '凤雏奇谋',
    status: 'planned',
    availability: '第18关；落凤坡分歧',
  },
  {
    id: 'fa_zheng',
    name: '法正',
    route: '两线',
    classes: ['策士', '谋士', '翼侯'],
    skillName: '睚眦必报',
    status: 'planned',
    availability: '第19关',
  },
  {
    id: 'liu_feng',
    name: '刘封',
    route: '两线',
    classes: ['步兵（枪）', '卫士', '副军将军'],
    skillName: '骁勇少谋',
    status: 'planned',
    availability: '招募节点待定',
  },
  {
    id: 'li_yan',
    name: '李严',
    route: '两线',
    classes: ['步兵', '卫士', '辅汉将军'],
    skillName: '坚壁清野',
    status: 'planned',
    availability: '第22关',
  },
  {
    id: 'ma_chao',
    name: '马超',
    route: '两线',
    classes: ['轻骑', '骠骑将军', '神威天将军'],
    skillName: '神威天马',
    status: 'planned',
    availability: '第22关',
  },
  {
    id: 'yan_yan',
    name: '严颜',
    route: '仅正史',
    classes: ['步兵', '重装将军', '宿将'],
    skillName: '断头不屈',
    status: 'planned',
    availability: '第21关',
  },
  {
    id: 'jiang_wei',
    name: '姜维',
    route: '两线',
    classes: ['轻骑', '卫士', '麒麟儿'],
    skillName: '幼麟文武',
    status: 'planned',
    availability: '正史第26关；IF节点待定',
  },
  {
    id: 'chen_deng',
    name: '陈登',
    route: '隐藏，两线',
    classes: ['策士', '谋士', '伏波将军'],
    skillName: '伏波定波',
    status: 'planned',
    availability: '第9关隐藏',
  },
  {
    id: 'gao_shun',
    name: '高顺',
    route: '隐藏，两线',
    classes: ['重装步兵', '重装将军', null],
    skillName: '陷阵营',
    status: 'planned',
    availability: '第9关隐藏；二阶封顶',
  },
  {
    id: 'diao_chan',
    name: '貂蝉',
    route: '隐藏，两线',
    classes: ['舞娘', '舞娘', '绝世舞姬'],
    skillName: '闭月之貌',
    status: 'planned',
    availability: '外传3',
  },
  {
    id: 'ma_dai',
    name: '马岱',
    route: '仅IF',
    classes: ['轻骑', '骠骑将军', '平北将军'],
    skillName: '西凉断后',
    status: 'planned',
    availability: 'IF招募节点待定',
  },
  {
    id: 'wu_yi',
    name: '吴懿',
    route: '仅IF',
    classes: ['步兵', '重装将军', '车骑将军'],
    skillName: '皇亲国戚',
    status: 'planned',
    availability: 'IF招募节点待定',
  },
  {
    id: 'guan_ping',
    name: '关平',
    route: '仅IF',
    classes: ['步兵', '勇士', '少将军'],
    skillName: '忠勇承父',
    status: 'planned',
    availability: 'IF招募节点待定',
  },
  {
    id: 'liao_hua',
    name: '廖化',
    route: '仅IF',
    classes: ['步兵', '卫士', '先锋大将'],
    skillName: '蜀汉基石',
    status: 'planned',
    availability: 'IF招募节点待定',
  },
  {
    id: 'zhou_cang',
    name: '周仓',
    route: '仅IF',
    classes: ['重装步兵', '重装将军', '忠勇护将'],
    skillName: '扛刀力士',
    status: 'planned',
    availability: 'IF招募节点待定',
  },
  {
    id: 'meng_huo',
    name: '孟获',
    route: 'IF南蛮与正史外传5冲突，待确认',
    classes: ['御象兵', '御象兵', '南中王'],
    skillName: '蛮王巨力',
    status: 'planned',
    availability: '保留路线冲突，不自动择一路线',
  },
  {
    id: 'zhu_rong',
    name: '祝融',
    route: 'IF南蛮',
    classes: ['术士', '巫祝', '火神'],
    skillName: '飞刀烈火',
    status: 'planned',
    availability: 'IF招募节点待定；飞刀视觉与计策分开',
  },
  {
    id: 'sha_mo_ke',
    name: '沙摩柯',
    route: 'IF南蛮',
    classes: ['弓兵', '狙击手', '蛮王'],
    skillName: '五溪铁骨',
    status: 'planned',
    availability: 'IF招募节点待定；现有持锤立绘待返修',
  },
];

export interface ChapterPlan {
  id: string;
  number: number | null;
  name: string;
  arc: string;
  summary: string;
  unlocks: string;
  status: ContentStatus;
}

const mainChapter = (
  number: number,
  name: string,
  arc: string,
  summary: string,
  unlocks: string,
): ChapterPlan => ({
  id: number === 1 ? 'taoyuan-01' : `chapter-${String(number).padStart(2, '0')}`,
  number,
  name,
  arc,
  summary,
  unlocks,
  status: number === 1 ? 'playable' : 'planned',
});
const extraChapter = (
  id: string,
  name: string,
  arc: string,
  summary: string,
  unlocks: string,
): ChapterPlan => ({ id, number: null, name, arc, summary, unlocks, status: 'planned' });

// 这些记录只用于内容规划；未制作章节没有可进入的战场或隐式解锁入口。
export const chapters: ChapterPlan[] = [
  mainChapter(1, '桃园结义', '黄巾', '歼灭村外黄巾散兵；武器相克、互相照应教学。', '简雍战后入队'),
  mainChapter(2, '从军', '黄巾', '协同卢植军守广宗外围、击破妖术阵；战后卢植被押走。', '邹靖临时NPC'),
  mainChapter(3, '长社火攻', '黄巾', '曹操友军登场；火攻后截击波才残部。', '张徵入队'),
  mainChapter(4, '曲阳', '黄巾', '张角重伤、妖术全开；三兄弟Boss，需破祭坛。', '高升以弓兵归降'),
  mainChapter(5, '汜水关', '讨董', '华雄压制诸侯；温酒事件后关羽交战。', '赵云临时入队'),
  mainChapter(
    6,
    '虎牢关',
    '讨董',
    '清兵、吕布出击、吕布爆气三阶段；三英战吕布。',
    '公孙瓒Guest；刘关张临时爆气',
  ),
  extraChapter('interlude-coalition', '联军离散', '讨董', '诸侯联军解散。', '赵云随公孙瓒离队'),
  extraChapter('extra-1', '外传1 北海救孔融', '徐州', '保护孔融与太史慈；糜竺参战。', '糜竺暂时参战'),
  mainChapter(7, '徐州牧', '徐州', '击退曹军；赵云借调、陈登埋线、陶谦让徐州。', '糜竺正式入队'),
  mainChapter(8, '徐州—小沛', '徐州', '醉酒张飞逃出下邳，再于小沛突围；高顺交战埋线。', '无新增明确招募'),
  mainChapter(9, '白门楼', '徐州', '水淹下邳、陈登内应、吕布Boss与死亡剧情。', '高顺、陈登可隐藏加入'),
  mainChapter(10, '小沛溃败', '徐州', '守城、曹操压境、护送刘备与家眷撤退。', '关羽降曹，队伍状态改变'),
  extraChapter('extra-2', '外传2 千里走单骑', '间章', '关羽单视角过五关斩六将，古城会张飞。', '赵云正式入队'),
  mainChapter(11, '走马荐诸葛', '赤壁', '徐庶临时高光后离去，触发貂蝉外传。', '马良、伊籍入队'),
  extraChapter('extra-3', '外传3 貂蝉行踪', '赤壁', '隐藏寻访关卡。', '貂蝉入队'),
  mainChapter(12, '博望坡', '赤壁', '诸葛亮初阵火攻。', '诸葛亮入队'),
  mainChapter(13, '长坂坡', '赤壁', '护送平民与阿斗。', '赵云、张飞解锁稳定爆气'),
  mainChapter(14, '火烧赤壁', '赤壁', '水战保护火船、借东风连锁火攻、追击溃败曹军。', '三阶段关卡状态'),
  mainChapter(15, '南郡争夺', '荆州', '趁周瑜与曹仁相持，偷取南郡。', '无新增明确招募'),
  mainChapter(16, '刘备招亲', '荆州', '甘露寺伏击，护送逃离。', '孙尚香以弓兵入队'),
  mainChapter(17, '三气周瑜', '荆州', '识破假途灭虢，周瑜病亡。', '剧情状态变化'),
  mainChapter(18, '收长沙', '荆州', '关羽战黄忠。', '黄忠、魏延、庞统入队'),
  mainChapter(19, '葭萌关', '入蜀', '击退张鲁军；马超为敌、夜战张飞，关尾与刘璋翻脸。', '法正入队'),
  mainChapter(20, '雒城', '入蜀', '落凤坡；庞统存活走IF，否则阵亡走正史。', '正史 / IF分叉'),
  mainChapter(21, '江州', '入蜀', '仅正史：诸葛亮、张飞入川，义释严颜；IF跳过。', '严颜入队'),
  mainChapter(
    22,
    '成都',
    '入蜀',
    '围城，马超威慑刘璋投降；战后按GDD安排称帝剧情。',
    '马超、李严入队；除高顺外全员三阶资格',
  ),
  mainChapter(23, '荆州之失', '正史', '关羽北伐、水淹七军；东吴白衣渡江，关羽败死。', '关羽剧情死亡离队'),
  mainChapter(24, '夷陵之战', '正史', '陆逊火烧连营，刘备撤离；战后托孤。', '剧情状态变化'),
  extraChapter(
    'extra-5',
    '外传5 南蛮入侵',
    '正史（路线待确认）',
    '隐藏南征，与职业表IF限定冲突；外传4编号缺口保留。',
    '原流程要求收孟获，路线待确认',
  ),
  mainChapter(25, '街亭', '正史', '马谡失街亭，具体关卡结果待细化。', '待设计'),
  mainChapter(26, '收姜维', '正史', '天水关收服姜维。', '姜维入队'),
  mainChapter(27, '五丈原', '正史', '诸葛亮病逝。', '诸葛亮剧情死亡离队'),
  mainChapter(28, '蜀汉收尾', '正史', '姜维剑阁高光，刘禅投降，蜀汉落幕。', '正史结局；IF后续待设计'),
];
