/**
 * Triglavian fiction layer. Corporation/faction names are the official SDE
 * localized names for the IDs below; do not replace them with fan translations.
 */
export const TRIGLAVIAN_FACTION_ID = 500026;
export const TRIGLAVIAN_CONVOCATION_ID = 1000298;

const NAMES = {
  en: {
    faction: 'Triglavian Collective',
    convocation: 'The Convocation of Triglav',
    perun: 'Perun Clade',
    svarog: 'Svarog Clade',
    veles: 'Veles Clade',
    navka: 'Navka Overminds',
  },
  zh: {
    faction: '三神裔',
    convocation: '三神避世会',
    perun: '雷电裔演化枝',
    svarog: '熔火裔演化枝',
    veles: '暗泽裔演化枝',
    navka: '纳夫卡主宰',
  },
  de: {
    faction: 'Triglavia-Kollektiv',
    convocation: 'Die Versammlung von Triglavia',
    perun: 'Perun-Klade',
    svarog: 'Svarog-Klade',
    veles: 'Veles-Klade',
    navka: 'Navka Overminds',
  },
  es: {
    faction: 'Colectivo Triglaviano',
    convocation: 'La Asamblea de Triglav',
    perun: 'Clado Perun',
    svarog: 'Clado Svarog',
    veles: 'Clado Veles',
    navka: 'Overminds navka',
  },
  fr: {
    faction: 'Collectif Triglavian',
    convocation: 'La convocation des Triglav',
    perun: 'Clade Perun',
    svarog: 'Clade Svarog',
    veles: 'Clade Veles',
    navka: 'Suresprits Navka',
  },
  ja: {
    faction: 'トリグラビアンコレクティブ',
    convocation: 'トリグラビアンの招集',
    perun: 'ペルン・クレード',
    svarog: 'スヴァログ・クレード',
    veles: 'ヴェレス・クレード',
    navka: 'ナフカ・オーバーマインド',
  },
  ko: {
    faction: '트리글라비안 컬렉티브',
    convocation: '트리글라브 집회',
    perun: '페룬 클레이드',
    svarog: '스바로그 클레이드',
    veles: '벨레스 클레이드',
    navka: '나브카 오버마인드',
  },
  ru: {
    faction: 'Сообщество Триглава',
    convocation: 'Невоенный собор Триглава',
    perun: 'Перунова клада',
    svarog: 'Сварогова клада',
    veles: 'Велесова клада',
    navka: 'Сверхразумы Навки',
  },
};

const COPY = {
  en: {
    description: 'A Triglavian Collective hull assessment. Verify the wreck against its fitting manifest.',
    kicker: 'TRIGLAVIAN COLLECTIVE // WRECK ASSESSMENT',
    helpIntro: 'FITDLE is the Triglavian Collective wreck-assessment terminal. A loss report arrives with a salvage manifest; identify the hull and decide whether the claim agrees with the wreck.',
    sourceBody: 'Ship data: EVE Static Data Export. Loss, fitting and ISK records: zKillboard. The Triglavian Collective is an EVE Online NPC faction. FITDLE is an unofficial fan simulation, not affiliated with Fenris Creations.',
    tagline: 'Triglavian Collective wreck assessment',
    disclaimer: 'The Triglavian Collective is an EVE Online NPC faction. FITDLE is an unofficial, non-commercial fan simulation and is not affiliated with Fenris Creations or CCP.',
    scc: 'CONVOCATION // ASSESSMENT PROTOCOL',
  },
  zh: {
    description: '三神裔舰体评估。对照残骸装配单，确认受损舰船的真实型号。',
    kicker: '三神裔 // 残骸评估',
    helpIntro: 'FITDLE 是三神裔的残骸评估终端。损失报告会附带残骸装配单；您的任务是确认舰体，并判断申报是否与残骸一致。',
    sourceBody: '舰船数据：EVE 静态数据导出。损失、装配与 ISK 记录：zKillboard。三神裔是 EVE Online 的 NPC 势力。FITDLE 是非官方粉丝模拟项目，不隶属于 Fenris Creations。',
    tagline: '三神裔舰体评估',
    disclaimer: '三神裔是 EVE Online 的 NPC 势力。FITDLE 是非官方、非商业粉丝模拟项目，不隶属于 Fenris Creations 或 CCP。',
    scc: '三神避世会 // 评估协议',
  },
};

const MEMOS = {
  en: {
    convocation: [
      'The Convocation has reviewed the wreck. The Convocation has also reviewed the reviewer.',
      'All three clades agree the hull is real. They disagree on which reality.',
    ],
    perun: [
      'Perun measures the wreck in four dimensions. The claim is short by one.',
      'The space-time interval is valid. The paperwork is not.',
    ],
    svarog: [
      'Svarog recommends violence. The salvage report recommends patience.',
      'The bioadaptive hull is intact. The claimant is not.',
    ],
    veles: [
      'Veles has filed the wreck under heavy industry. The wreck has filed under missing.',
      'Communications are clear. The message is not.',
    ],
    navka: [
      "Navka's drones found the wreck. Navka's drones would like it back.",
      'The swarm has counted the fragments. The swarm has also counted the claimant.',
    ],
  },
  zh: {
    convocation: [
      '三神避世会已复核残骸。也复核了复核员。',
      '三支演化枝都同意舰体存在。至于哪一个现实，尚未同意。',
    ],
    perun: [
      '雷电裔演化枝以四维测量残骸。申请少了一个维度。',
      '时空间隔有效。文书无效。',
    ],
    svarog: [
      '熔火裔演化枝建议使用暴力。打捞报告建议耐心。',
      '生化适应舰体完好。申请人不是。',
    ],
    veles: [
      '暗泽裔演化枝把残骸归入重工业。残骸把自己归入失踪。',
      '通信清晰。信息不清晰。',
    ],
    navka: [
      '纳夫卡主宰的无人机找到了残骸。它们希望把残骸还给自己。',
      '集群数过碎片，也数过申请人。',
    ],
  },
};

const DEPARTMENT_IDS = ['convocation', 'perun', 'svarog', 'veles', 'navka'];

export function triglavianBrand(locale) {
  const names = NAMES[locale] || NAMES.en;
  const copy = COPY[locale] || COPY.en;
  return {
    ...names,
    ...copy,
    subtitle: `${names.faction} // ${names.convocation}`,
  };
}

export function triglavianDepartments(locale) {
  const names = NAMES[locale] || NAMES.en;
  const memos = MEMOS[locale] || MEMOS.en;
  return DEPARTMENT_IDS.map((id) => ({
    id,
    name: names[id],
    memos: memos[id] || MEMOS.en[id] || [],
  }));
}
