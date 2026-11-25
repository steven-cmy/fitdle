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
    description: '三神裔船体评估。对照残骸装配单，确认受损舰船的真实型号。',
    kicker: '三神裔 // 残骸评估',
    helpIntro: 'FITDLE 是三神裔的残骸评估终端。损失报告会附带残骸装配单；您的任务是确认船体，并判断申报是否与残骸一致。',
    sourceBody: '舰船数据：EVE 静态数据导出。损失、装配与 ISK 记录：zKillboard。三神裔是 EVE Online 的 NPC 势力。FITDLE 是非官方粉丝模拟项目，不隶属于 Fenris Creations。',
    tagline: '三神裔船体评估',
    disclaimer: '三神裔是 EVE Online 的 NPC 势力。FITDLE 是非官方、非商业粉丝模拟项目，不隶属于 Fenris Creations 或 CCP。',
    scc: '三神避世会 // 评估协议',
  },
  de: {
    description: 'Eine Rumpfbewertung des Triglavia-Kollektivs. Prüfen Sie das Wrack anhand seines Manifests.',
    kicker: 'TRIGLAVIA-KOLLEKTIV // WRACKBEWERTUNG',
    helpIntro: 'FITDLE ist das Wrackbewertungsterminal des Triglavia-Kollektivs. Ein Verlustbericht kommt mit Wrack-Manifest; identifizieren Sie den Rumpf und entscheiden Sie, ob der Anspruch zum Wrack passt.',
    sourceBody: 'Schiffsdaten: EVE Static Data Export. Verlust-, Ausrüstungs- und ISK-Daten: zKillboard. Das Triglavia-Kollektiv ist eine NPC-Fraktion in EVE Online. FITDLE ist eine inoffizielle Fan-Simulation und nicht mit Fenris Creations verbunden.',
    tagline: 'Wrackbewertung des Triglavia-Kollektivs',
    disclaimer: 'Das Triglavia-Kollektiv ist eine NPC-Fraktion in EVE Online. FITDLE ist eine inoffizielle, nicht kommerzielle Fan-Simulation und nicht mit Fenris Creations oder CCP verbunden.',
    scc: 'VERSAMMLUNG // BEWERTUNGSPROTOKOLL',
  },
  es: {
    description: 'Evaluación de cascos del Colectivo Triglaviano. Verifica los restos con su manifiesto.',
    kicker: 'COLECTIVO TRIGLAVIANO // EVALUACIÓN DE RESTOS',
    helpIntro: 'FITDLE es el terminal de evaluación de restos del Colectivo Triglaviano. Llega un informe de pérdida con un manifiesto de los restos; identifica el casco y decide si la reclamación concuerda con los restos.',
    sourceBody: 'Datos de naves: EVE Static Data Export. Pérdidas, equipamiento e ISK: zKillboard. El Colectivo Triglaviano es una facción NPC de EVE Online. FITDLE es una simulación de fans no oficial y no está afiliada a Fenris Creations.',
    tagline: 'Evaluación de restos del Colectivo Triglaviano',
    disclaimer: 'El Colectivo Triglaviano es una facción NPC de EVE Online. FITDLE es una simulación de fans no oficial y no comercial, no afiliada a Fenris Creations ni a CCP.',
    scc: 'ASAMBLEA // PROTOCOLO DE EVALUACIÓN',
  },
  fr: {
    description: 'Évaluation de coque du Collectif Triglavian. Vérifiez l’épave avec son manifeste.',
    kicker: 'COLLECTIF TRIGLAVIAN // ÉVALUATION D’ÉPAVE',
    helpIntro: 'FITDLE est le terminal d’évaluation d’épaves du Collectif Triglavian. Un rapport de perte arrive avec un manifeste d’épave ; identifiez la coque et décidez si la demande concorde avec l’épave.',
    sourceBody: 'Données des vaisseaux : EVE Static Data Export. Pertes, équipement et ISK : zKillboard. Le Collectif Triglavian est une faction PNJ d’EVE Online. FITDLE est une simulation de fans non officielle, non affiliée à Fenris Creations.',
    tagline: 'Évaluation d’épaves du Collectif Triglavian',
    disclaimer: 'Le Collectif Triglavian est une faction PNJ d’EVE Online. FITDLE est une simulation de fans non officielle et non commerciale, non affiliée à Fenris Creations ni à CCP.',
    scc: 'CONVOCATION // PROTOCOLE D’ÉVALUATION',
  },
  ja: {
    description: 'トリグラビアンコレクティブの船体査定。残骸をマニフェストと照合します。',
    kicker: 'トリグラビアンコレクティブ // 残骸査定',
    helpIntro: 'FITDLE はトリグラビアンコレクティブの残骸査定端末です。損失報告と残骸マニフェストが届きます。船体を特定し、請求が残骸と一致するか判断してください。',
    sourceBody: '艦船データ：EVE Static Data Export。損失・装備・ISK 記録：zKillboard。トリグラビアンコレクティブは EVE Online の NPC 勢力です。FITDLE は非公式ファンシミュレーションであり、Fenris Creations とは無関係です。',
    tagline: 'トリグラビアンコレクティブ 残骸査定',
    disclaimer: 'トリグラビアンコレクティブは EVE Online の NPC 勢力です。FITDLE は非公式・非商業のファンシミュレーションであり、Fenris Creations や CCP とは無関係です。',
    scc: 'トリグラビアンの招集 // 査定プロトコル',
  },
  ko: {
    description: '트리글라비안 컬렉티브의 선체 평가. 잔해를 목록과 대조합니다.',
    kicker: '트리글라비안 컬렉티브 // 잔해 평가',
    helpIntro: 'FITDLE은 트리글라비안 컬렉티브의 잔해 평가 단말입니다. 손실 보고서와 잔해 목록이 도착하면 선체를 식별하고 청구가 잔해와 일치하는지 판단하십시오.',
    sourceBody: '함선 데이터: EVE Static Data Export. 손실·피팅·ISK 기록: zKillboard. 트리글라비안 컬렉티브는 EVE Online의 NPC 팩션입니다. FITDLE은 비공식 팬 시뮬레이션이며 Fenris Creations와 무관합니다.',
    tagline: '트리글라비안 컬렉티브 잔해 평가',
    disclaimer: '트리글라비안 컬렉티브는 EVE Online의 NPC 팩션입니다. FITDLE은 비공식·비상업 팬 시뮬레이션이며 Fenris Creations 또는 CCP와 무관합니다.',
    scc: '트리글라브 집회 // 평가 프로토콜',
  },
  ru: {
    description: 'Оценка корпусов Сообщества Триглава. Сверьте обломки с манифестом.',
    kicker: 'СООБЩЕСТВО ТРИГЛАВА // ОЦЕНКА ОБЛОМКОВ',
    helpIntro: 'FITDLE — терминал оценки обломков Сообщества Триглава. Отчёт о потере приходит с манифестом обломков; определите корпус и решите, соответствует ли заявка обломкам.',
    sourceBody: 'Данные кораблей: EVE Static Data Export. Потери, оснащение и ISK: zKillboard. Сообщество Триглава — NPC-фракция EVE Online. FITDLE — неофициальная фанатская симуляция, не связанная с Fenris Creations.',
    tagline: 'Оценка обломков Сообщества Триглава',
    disclaimer: 'Сообщество Триглава — NPC-фракция EVE Online. FITDLE — неофициальная некоммерческая фанатская симуляция, не связанная с Fenris Creations или CCP.',
    scc: 'СОБОР // ПРОТОКОЛ ОЦЕНКИ',
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
      '三支演化枝都同意船体存在。至于在哪一个现实里，尚未同意。',
    ],
    perun: [
      '雷电裔演化枝以四维测量残骸。申请少了一个维度。',
      '时空间隔有效。文书无效。',
    ],
    svarog: [
      '熔火裔演化枝建议使用暴力。打捞报告建议耐心。',
      '生化适应船体完好。申请人不是。',
    ],
    veles: [
      '暗泽裔演化枝把残骸归入重工业。残骸把自己归入失踪。',
      '通信清晰。信息不清晰。',
    ],
    navka: [
      '纳夫卡主宰的无人机找到了残骸。它们希望拿回去。',
      '蜂群数过碎片，也数过申请人。',
    ],
  },
  de: {
    convocation: [
      'Die Versammlung hat das Wrack geprüft. Den Prüfer hat sie ebenfalls geprüft.',
      'Alle drei Kladen halten den Rumpf für real. Über die Realität sind sie sich uneinig.',
    ],
    perun: [
      'Perun vermisst das Wrack in vier Dimensionen. Dem Anspruch fehlt eine.',
      'Das Raumzeit-Intervall ist gültig. Die Unterlagen sind es nicht.',
    ],
    svarog: [
      'Svarog empfiehlt Gewalt. Der Bergungsbericht empfiehlt Geduld.',
      'Der bioadaptive Rumpf ist intakt. Der Antragsteller ist es nicht.',
    ],
    veles: [
      'Veles hat das Wrack unter Schwerindustrie abgelegt. Das Wrack hat sich unter vermisst abgelegt.',
      'Die Kommunikation ist klar. Die Nachricht ist es nicht.',
    ],
    navka: [
      'Die Drohnen der Navka haben das Wrack gefunden. Die Drohnen der Navka hätten es gern zurück.',
      'Der Schwarm hat die Fragmente gezählt. Der Schwarm hat auch den Antragsteller gezählt.',
    ],
  },
  es: {
    convocation: [
      'La Asamblea ha revisado los restos. La Asamblea también ha revisado al revisor.',
      'Los tres clados coinciden en que el casco es real. No coinciden en qué realidad.',
    ],
    perun: [
      'Perun mide los restos en cuatro dimensiones. A la reclamación le falta una.',
      'El intervalo de espacio-tiempo es válido. El papeleo, no.',
    ],
    svarog: [
      'Svarog recomienda violencia. El informe de salvamento recomienda paciencia.',
      'El casco bioadaptativo está intacto. El solicitante, no.',
    ],
    veles: [
      'Veles archivó los restos en industria pesada. Los restos se archivaron en desaparecidos.',
      'Las comunicaciones son claras. El mensaje, no.',
    ],
    navka: [
      'Los drones de Navka encontraron los restos. Los drones de Navka querrían recuperarlos.',
      'El enjambre ha contado los fragmentos. El enjambre también ha contado al solicitante.',
    ],
  },
  fr: {
    convocation: [
      'La Convocation a examiné l’épave. La Convocation a aussi examiné l’examinateur.',
      'Les trois clades s’accordent : la coque est réelle. Reste à savoir dans quelle réalité.',
    ],
    perun: [
      'Perun mesure l’épave en quatre dimensions. Il en manque une à la demande.',
      'L’intervalle d’espace-temps est valide. Le formulaire ne l’est pas.',
    ],
    svarog: [
      'Svarog recommande la violence. Le rapport de récupération recommande la patience.',
      'La coque bioadaptative est intacte. Le demandeur ne l’est pas.',
    ],
    veles: [
      'Veles a classé l’épave dans l’industrie lourde. L’épave s’est classée disparue.',
      'Les communications sont claires. Le message ne l’est pas.',
    ],
    navka: [
      'Les drones de Navka ont trouvé l’épave. Les drones de Navka aimeraient la récupérer.',
      'L’essaim a compté les fragments. L’essaim a aussi compté le demandeur.',
    ],
  },
  ja: {
    convocation: [
      '招集は残骸を審査した。審査官も審査した。',
      '三つのクレードは船体が実在すると認めた。どの現実かは認めていない。',
    ],
    perun: [
      'ペルンは残骸を四次元で測る。請求は一次元足りない。',
      '時空間隔は有効。書類は無効。',
    ],
    svarog: [
      'スヴァログは暴力を推奨。サルベージ報告は忍耐を推奨。',
      '生物適応の船体は無傷。申請者は無傷ではない。',
    ],
    veles: [
      'ヴェレスは残骸を重工業に分類した。残骸は自らを行方不明に分類した。',
      '通信は明瞭。内容は不明瞭。',
    ],
    navka: [
      'ナフカのドローンが残骸を発見した。ナフカのドローンは返却を希望している。',
      '群れは破片を数えた。申請者も数えた。',
    ],
  },
  ko: {
    convocation: [
      '집회가 잔해를 검토했습니다. 검토관도 검토했습니다.',
      '세 클레이드는 선체가 실재한다는 데 동의합니다. 어느 현실인지에는 동의하지 않습니다.',
    ],
    perun: [
      '페룬은 잔해를 4차원으로 측정합니다. 청구에는 하나가 모자랍니다.',
      '시공 간격은 유효합니다. 서류는 유효하지 않습니다.',
    ],
    svarog: [
      '스바로그는 폭력을 권합니다. 샐비지 보고서는 인내를 권합니다.',
      '바이오적응형 선체는 온전합니다. 신청자는 그렇지 않습니다.',
    ],
    veles: [
      '벨레스는 잔해를 중공업으로 분류했습니다. 잔해는 스스로를 실종으로 분류했습니다.',
      '통신은 명확합니다. 내용은 그렇지 않습니다.',
    ],
    navka: [
      '나브카의 드론이 잔해를 찾았습니다. 나브카의 드론은 돌려받기를 원합니다.',
      '무리가 파편을 세었습니다. 신청자도 세었습니다.',
    ],
  },
  ru: {
    convocation: [
      'Собор проверил обломки. Проверяющего собор проверил тоже.',
      'Все три клады согласны, что корпус реален. О какой реальности речь — не согласны.',
    ],
    perun: [
      'Перунова клада измеряет обломки в четырёх измерениях. Заявке одного не хватает.',
      'Пространственно-временной интервал действителен. Документы — нет.',
    ],
    svarog: [
      'Сварогова клада рекомендует насилие. Отчёт о демонтаже рекомендует терпение.',
      'Биоадаптивный корпус цел. Заявитель — нет.',
    ],
    veles: [
      'Велесова клада отнесла обломки к тяжёлой промышленности. Обломки отнесли себя к пропавшим.',
      'Связь чёткая. Сообщение — нет.',
    ],
    navka: [
      'Дроны Навки нашли обломки. Дроны Навки хотели бы получить их обратно.',
      'Рой пересчитал фрагменты. Заявителя рой пересчитал тоже.',
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
