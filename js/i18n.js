/**
 * Fitdle localization. Interface strings plus official-language formatting.
 * Ship, module, group and description text comes from CCP's SDE data files.
 */

export const LOCALES = ['en', 'de', 'es', 'fr', 'ja', 'ko', 'ru', 'zh'];
import { MP_MESSAGES } from './mp/messages.js';

export const LOCALE_META = {
  en: { label: 'English', intl: 'en-US' },
  de: { label: 'Deutsch', intl: 'de-DE' },
  es: { label: 'Español', intl: 'es-ES' },
  fr: { label: 'Français', intl: 'fr-FR' },
  ja: { label: '日本語', intl: 'ja-JP' },
  ko: { label: '한국어', intl: 'ko-KR' },
  ru: { label: 'Русский', intl: 'ru-RU' },
  zh: { label: '简体中文', intl: 'zh-CN' },
};

const en = {
  'app.name': 'FITDLE',
  'app.subtitle': 'DAILY KILLBOARD',
  'app.description': 'A daily EVE Online killboard puzzle. Read the fittings, destroy the hull.',
  'header.reset': 'NEXT TARGET IN',
  'header.archive': 'ARCHIVE',
  'header.playToday': 'PLAY TODAY',
  'header.language': 'LANGUAGE',
  'header.help': 'FIELD MANUAL',
  'header.newTarget': 'A NEW TARGET IS AVAILABLE',
  'header.snapshot': 'INTEL SNAPSHOT',
  'hero.kicker': 'TQ // DAILY INTELLIGENCE',
  'hero.title': 'DESTROY THE HULL',
  'hero.body': 'Six attempts. One ship. Its fittings and vital statistics are sealed behind progressively declassified intelligence. Read the killmails. Destroy the hull.',
  'hero.attempts': 'ATTEMPTS',
  'hero.fragments': 'FRAGMENTS',
  'hero.target': 'UNKNOWN HULL',
  'hero.targetSub': 'SIGNAL UNRESOLVED',
  'hero.status': 'RECON STATUS',
  'hero.statusValue': 'ACTIVE INTERCEPT',
  'board.title': 'TARGET ACQUISITION',
  'board.subtitle': 'Submit a hull to compare its profile and pull the next intel package.',
  'board.attempt': 'ATTEMPT {n}',
  'board.awaiting': 'AWAITING TARGET',
  'board.mismatch': 'PROFILE MISMATCH',
  'board.confirmed': 'TARGET CONFIRMED',
  'board.match': 'PROFILE MATCH',
  'board.intel': 'INTEL +{n}',
  'board.placeholder': 'Type a ship name…',
  'board.inputLabel': 'Ship name',
  'board.submit': 'LOCK TARGET',
  'board.noResults': 'No matching hull in the database',
  'board.already': 'Hull already analyzed',
  'board.invalid': 'Select a hull from the database',
  'board.complete': 'TARGET CYCLE COMPLETE',
  'board.enterHint': 'Press Enter to lock',
  'board.typeAnyLanguage': 'Client languages supported',
  'dossier.title': 'INTELLIGENCE DOSSIER',
  'dossier.subtitle': 'Low-signal intelligence is declassified first. Hull-specific fittings carry the highest weight.',
  'dossier.progress': '{revealed} / {total} DECRYPTED',
  'dossier.sealed': '{n} UNPROBED',
  'dossier.encrypted': 'UNPROBED',
  'dossier.encryptedHint': 'Probe another profile',
  'dossier.signal': 'SIGNAL WEIGHT',
  'dossier.hullSpecific': 'HULL-SPECIFIC',
  'dossier.complete': 'DOSSIER COMPLETE',
  'dossier.answer': 'CONFIRMED HULL',
  'dossier.unit': 'UNIT',
  'dossier.basedOn': 'Based on {n} fitted losses',
  'dossier.slotHigh': 'HIGH SLOT',
  'dossier.slotMid': 'MID SLOT',
  'dossier.slotLow': 'LOW SLOT',
  'dossier.slotRig': 'RIG SLOT',
  'dossier.slotSubsystem': 'SUBSYSTEM',
  'dossier.slotDrone': 'DRONE BAY',
  'dossier.slotFighter': 'FIGHTER TUBES',
  'cat.identity': 'IDENTITY',
  'cat.hull': 'HULL',
  'cat.slots': 'SLOTS',
  'cat.nav': 'NAVIGATION',
  'cat.defense': 'DEFENSE',
  'cat.fitting': 'FITTING',
  'cat.equipment': 'EQUIPMENT',
  'cat.economy': 'ZKILLBOARD',
  'cat.traits': 'TRAITS',
  'clue.race': 'Race',
  'clue.faction': 'Faction',
  'clue.group': 'Hull class',
  'clue.tech': 'Tech level',
  'clue.meta': 'Meta group',
  'clue.slots': 'Slot layout',
  'clue.hardpoints': 'Hardpoints',
  'clue.drones': 'Drone bay',
  'clue.speed': 'Max velocity',
  'clue.sig': 'Signature radius',
  'clue.align': 'Align time',
  'clue.warp': 'Warp speed',
  'clue.mass': 'Mass',
  'clue.massTonnes': 'tonnes',
  'clue.massToggle': 'Toggle mass unit',
  'clue.cargo': 'Cargo capacity',
  'clue.shield': 'Shield HP',
  'clue.armor': 'Armor HP',
  'clue.structure': 'Structure HP',
  'clue.capacitor': 'Capacitor',
  'clue.pg': 'Powergrid output',
  'clue.cpu': 'CPU output',
  'clue.calibration': 'Calibration',
  'clue.targetRange': 'Targeting range',
  'clue.scanRes': 'Scan resolution',
  'clue.avgValue': 'Typical loss value',
  'clue.losses30': 'Losses · 90 days',
  'clue.iskLost30': 'ISK lost · 90 days',
  'clue.danger': 'Danger index',
  'clue.bonus': 'Hull bonuses',
  'clue.bonusRole': 'Role Bonus',
  'clue.bonusHull': '{name} bonuses (per skill level)',
  'clue.equipment': 'Fitted module',
  'clue.none': 'None',
  'clue.noDrones': 'No drone bay',
  'clue.slotsValue': '{hi}H / {med}M / {low}L / {rig}R',
  'clue.hardpointsValue': '{turret} turret · {launcher} launcher',
  'clue.dronesValue': '{bandwidth} Mbit/s · {capacity} m³',
  'clue.techValue': 'Tech {n}',
  'clue.percent': '{n}%',
  'clue.medianNote': 'zKillboard median of recent losses',
  'clue.zkbNote': 'zKillboard · 90-day window',
  'clue.count30': '{n} losses',
  'end.victoryKicker': 'SIGNAL LOCK ESTABLISHED',
  'end.victoryTitle': 'SHIP SIGNAL LOCKED',
  'end.defeatKicker': 'SIGNAL LOST',
  'end.defeatTitle': 'TARGET LOST',
  'end.victoryBody': 'Signal lock complete. Target identity resolved: {name}. Another hull on your KILLMARK.',
  'end.defeatBody': 'The signal went cold after six attempts. The target was {name}. Study the dossier — the next one will not get away.',
  'end.attempts': 'ATTEMPTS USED',
  'end.intel': 'FRAGMENTS DECRYPTED',
  'end.share': 'SHARE BRIEFING',
  'end.copied': 'BRIEFING LINK COPIED',
  'end.copyFailed': 'Copy failed — select the link below',
  'end.zkb': 'OPEN zKILLBOARD',
  'end.killmail': 'VIEW KILLMAIL',
  'end.killboard': 'VIEW KILLBOARD',
  'end.review': 'REVIEW DOSSIER',
  'end.next': 'NEXT TARGET',
  'end.played': 'PLAYED',
  'end.winRate': 'WIN RATE',
  'end.streak': 'STREAK',
  'end.distribution': 'ATTEMPT DISTRIBUTION',
  'end.shareScore': 'FITDLE {date} — {score}/6',
  'end.shareLoss': 'FITDLE {date} — X/6',
  'help.title': 'FIELD MANUAL',
  'help.intro': 'FITDLE is a daily killmail puzzle for EVE Online. The answer is always a specific killmail active on zKillboard.',
  'help.step1Title': '01 // READ THE DOSSIER',
  'help.step1': 'The target starts almost entirely classified. Every failed acquisition declassifies six more fragments.',
  'help.step2Title': '02 // LOCK THE TARGET',
  'help.step2': 'Search for any ship in the EVE database, in any supported client language. Six attempts. One target per UTC day.',
  'help.step3Title': '03 // TRACK INTEL',
  'help.step3': 'Intel is released progressively. Read the killmail dossier and compare the clues your guess shares with the target.',
  'help.step4Title': '04 // SHARE THE BRIEFING',
  'help.step4': 'When the cycle ends, share a spoiler-free link. Everyone who opens the same UTC date gets the same target, in every language.',
  'help.weightTitle': 'SIGNAL WEIGHT',
  'help.weightBody': 'Weight estimates how much a fragment narrows the target field, calculated across the active hull pool. Low weight means many hulls fit. High weight means few do.',
  'help.langTitle': 'LANGUAGES',
  'help.langBody': 'Interface, hull names, modules and descriptions use EVE official localizations for EN, DE, ES, FR, JA, KO, RU and ZH. The daily target is language-independent, so switching language never changes the answer.',
  'help.sourceTitle': 'SOURCES',
  'help.sourceBody': 'Ship data: CCP EVE Static Data Export. Kill, fitting and ISK intelligence: zKillboard. EVE Online is a trademark of CCP hf. This is an unaffiliated fan project.',
  'help.cycle': 'UTC cycle',
  'help.pool': 'Answer hull pool',
  'help.statsTitle': 'TOTAL STATS',
  'help.statsEmpty': 'No completed cycles yet.',
  'help.statPlayed': 'Played',
  'help.statWon': 'Kills',
  'help.statStreak': 'Current streak',
  'help.statBest': 'Best streak',
  'help.resetRecord': 'Reset all progress',
  'help.resetConfirm': 'Reset all local progress, stats, streaks and settings? This cannot be undone.',
  'error.title': 'UPLINK FAILED',
  'error.body': 'Could not load the intelligence package. Check the connection and try again.',
  'error.retry': 'RETRY UPLINK',
  'error.unknownHullCode': 'SIGNAL UNCLASSIFIED',
  'error.unknownHullTitle': 'Target outside hull registry',
  'error.unknownHullBody': 'The killmail is valid, but the victim is not a registered ship hull. It may be a structure, container, or another non-ship target. The intelligence link cannot be established.',
  'error.back': 'RETURN TO PREVIOUS',
  'error.noTargetCode': 'NO TARGET LOCK',
  'error.noTargetTitle': 'No legal target found',
  'error.noTargetBody': 'No valid daily killmail could be selected. Open Free mode and choose a target manually.',
  'error.freeMode': 'OPEN FREE MODE',
  'error.date': 'Invalid date — using today’s target.',
  'error.oldState': 'Puzzle data changed — local attempt reset.',
  'error.noAnswer': 'Target data unavailable.',
  'toast.langChanged': 'LANGUAGE UPLINK: {lang}',
  'toast.newPuzzle': 'New UTC target available',
  'toast.intel': 'INTEL PACKAGE DECRYPTED',
  'toast.clue': '+{n} fragments',
  'toast.copied': 'BRIEFING LINK COPIED',
  'toast.copyFailed': 'Could not copy — the link is shown in the debrief',
  'toast.duplicate': 'Hull already analyzed',
  'toast.invalid': 'Select a hull from the database',
  'common.close': 'CLOSE',
  'common.today': 'TODAY',
  'common.utc': 'UTC',
  'common.loading': 'ESTABLISHING UPLINK',
  'common.loadingSub': 'Decrypting daily intelligence package',
  'common.footer': 'A fan-made daily puzzle · Not affiliated with Fenris Creations (formerly CCP hf. / CCP Games)',
  'common.copyLink': 'COPY LINK',
  'common.none': 'None',
  'common.attempts': '{n} attempts',
};

const zh = {
  'app.name': 'FITDLE',
  'app.subtitle': '每日击杀挑战',
  'app.description': 'EVE Online 每日击杀谜题。读取装配与击杀情报，锁定并击杀目标。',
  'header.reset': '距离下一个目标',
  'header.archive': '档案模式',
  'header.playToday': '返回今日',
  'header.language': '语言',
  'header.help': '战地手册',
  'header.newTarget': '新的每日目标已就绪',
  'header.snapshot': '情报快照',
  'hero.kicker': 'TQ // 每日情报',
  'hero.title': '击杀目标',
  'hero.body': '六次尝试，一艘目标。它的装备与关键属性被封存在逐步解密的情报中。读取击杀记录，完成击杀。',
  'hero.attempts': '尝试次数',
  'hero.fragments': '情报碎片',
  'hero.target': '未知舰船',
  'hero.targetSub': '信号尚未解析',
  'hero.status': '侦察状态',
  'hero.statusValue': '主动截获中',
  'board.title': '目标捕获',
  'board.subtitle': '提交一艘船，比对轮廓并拉取下一组情报。',
  'board.attempt': '第 {n} 次尝试',
  'board.awaiting': '等待目标',
  'board.mismatch': '轮廓不匹配',
  'board.confirmed': '目标确认',
  'board.match': '轮廓匹配度',
  'board.intel': '情报 +{n}',
  'board.placeholder': '输入舰船名称…',
  'board.inputLabel': '舰船名称',
  'board.submit': '锁定目标',
  'board.noResults': '数据库中无匹配舰船',
  'board.already': '该舰船已分析过',
  'board.invalid': '请从数据库中选择一艘船',
  'board.complete': '目标周期结束',
  'board.enterHint': '按回车锁定',
  'board.typeAnyLanguage': '支持官方客户端语言',
  'dossier.title': '情报档案',
  'dossier.subtitle': '低辨识度情报优先解密。舰船专属装备权重最高。',
  'dossier.progress': '已解密 {revealed} / {total}',
  'dossier.sealed': '{n} 份未探测',
  'dossier.encrypted': '未探测',
  'dossier.encryptedHint': '再探测一个轮廓',
  'dossier.signal': '信号权重',
  'dossier.hullSpecific': '舰船专属',
  'dossier.complete': '档案完整',
  'dossier.answer': '确认舰船',
  'dossier.unit': '单位',
  'dossier.basedOn': '基于 {n} 条带装备损失记录',
  'dossier.slotHigh': '高能量槽',
  'dossier.slotMid': '中能量槽',
  'dossier.slotLow': '低能量槽',
  'dossier.slotRig': '改装件槽',
  'dossier.slotSubsystem': '子系统',
  'dossier.slotDrone': '无人机舱',
  'dossier.slotFighter': '舰载机发射管',
  'cat.identity': '身份',
  'cat.hull': '船体',
  'cat.slots': '槽位',
  'cat.nav': '导航',
  'cat.defense': '防御',
  'cat.fitting': '装配',
  'cat.equipment': '装备',
  'cat.economy': 'ZKILLBOARD',
  'cat.traits': '特性',
  'clue.race': '种族',
  'clue.faction': '势力',
  'clue.group': '舰船类别',
  'clue.tech': '科技等级',
  'clue.meta': '科技层级',
  'clue.slots': '槽位配置',
  'clue.hardpoints': '武器安装座',
  'clue.drones': '无人机舱',
  'clue.speed': '最大速度',
  'clue.sig': '信号半径',
  'clue.align': '起跳时间',
  'clue.warp': '跃迁速度',
  'clue.mass': '质量',
  'clue.massTonnes': '吨',
  'clue.massToggle': '切换质量单位',
  'clue.cargo': '货舱容量',
  'clue.shield': '护盾值',
  'clue.armor': '装甲值',
  'clue.structure': '结构值',
  'clue.capacitor': '电容容量',
  'clue.pg': '能量栅格输出',
  'clue.cpu': 'CPU 输出',
  'clue.calibration': '校准值',
  'clue.targetRange': '锁定范围上限',
  'clue.scanRes': '扫描分辨率',
  'clue.avgValue': '典型损失价值',
  'clue.losses30': '90 天损失数',
  'clue.iskLost30': '90 天损失 ISK',
  'clue.danger': '危险指数',
  'clue.bonus': '舰船加成',
  'clue.bonusRole': '角色加成',
  'clue.bonusHull': '{name}加成（每级技能）',
  'clue.equipment': '装配装备',
  'clue.none': '无',
  'clue.noDrones': '无无人机舱',
  'clue.slotsValue': '{hi}高 / {med}中 / {low}低 / {rig}改装',
  'clue.hardpointsValue': '{turret} 炮台 · {launcher} 发射器',
  'clue.dronesValue': '{bandwidth} Mbit/s · {capacity} m³',
  'clue.techValue': '科技 {n} 级',
  'clue.percent': '{n}%',
  'clue.medianNote': 'zKillboard 近期损失中位数',
  'clue.zkbNote': 'zKillboard · 90 天窗口',
  'clue.count30': '{n} 次损失',
  'end.victoryKicker': '信号锁定完成',
  'end.victoryTitle': '舰船信号已锁定',
  'end.defeatKicker': '信号丢失',
  'end.defeatTitle': '目标逃脱',
  'end.victoryBody': '信号锁定完成，目标身份已解析：{name}。你的击杀标记上又多了一艘船。',
  'end.defeatBody': '六次尝试后信号中断。目标是 {name}。复盘情报档案，下一次别让它溜走。',
  'end.attempts': '使用次数',
  'end.intel': '解密碎片',
  'end.share': '分享简报',
  'end.copied': '简报链接已复制',
  'end.copyFailed': '复制失败——请手动选择下方链接',
  'end.zkb': '打开 zKillboard',
  'end.killmail': '查看对应击杀',
  'end.killboard': '查看击杀板',
  'end.review': '查看档案',
  'end.next': '下一个目标',
  'end.played': '已游玩',
  'end.winRate': '胜率',
  'end.streak': '连胜',
  'end.distribution': '尝试次数分布',
  'end.shareScore': 'FITDLE {date} — {score}/6',
  'end.shareLoss': 'FITDLE {date} — X/6',
  'help.title': '战地手册',
  'help.intro': 'FITDLE 是 EVE Online 的每日击杀谜题。答案总是一张在 zKillboard 上有活跃记录的击杀记录。',
  'help.step1Title': '01 // 读取档案',
  'help.step1': '目标初始几乎完全保密。每次提交错误舰船，都会解密六份新碎片。',
  'help.step2Title': '02 // 锁定目标',
  'help.step2': '在 EVE 数据库中搜索任意舰船，支持所有官方客户端语言。六次尝试，每个 UTC 日一个目标。',
  'help.step3Title': '03 // 追踪情报',
  'help.step3': '情报会逐步释放。读取击杀档案，并比对当前猜测与目标相同的线索。',
  'help.step4Title': '04 // 分享简报',
  'help.step4': '周期结束后，分享无剧透链接。所有人在同一 UTC 日期、任何语言下看到的都是同一个目标。',
  'help.weightTitle': '信号权重',
  'help.weightBody': '权重估算该碎片能在多大程度上缩小目标范围，基于活跃船池计算。权重越低，符合的船越多；权重越高，符合的船越少。',
  'help.langTitle': '语言',
  'help.langBody': '界面、船名、装备与描述使用 EVE 官方对英语、德语、西班牙语、法语、日语、韩语、俄语和简体中文的官方本地化。每日目标与语言无关，切换语言不会改变答案。',
  'help.sourceTitle': '数据来源',
  'help.sourceBody': '舰船数据：CCP EVE 静态数据导出。击杀、装配与 ISK 情报：zKillboard。EVE Online 是 CCP hf 的商标。本项目为非官方粉丝作品。',
  'help.cycle': 'UTC 周期',
  'help.pool': '答案舰船池',
  'help.statsTitle': '总数据统计',
  'help.statsEmpty': '尚无已完成的周期。',
  'help.statPlayed': '已游玩',
  'help.statWon': '击杀数',
  'help.statStreak': '当前连胜',
  'help.statBest': '最佳连胜',
  'help.resetRecord': '重置所有进度',
  'help.resetConfirm': '确定重置所有本地进度、统计、连胜和设置？此操作不可撤销。',
  'error.title': '上行链路失败',
  'error.body': '无法加载情报包。请检查连接后重试。',
  'error.retry': '重试连接',
  'error.unknownHullCode': '信号无法归类',
  'error.unknownHullTitle': '目标不在舰船档案中',
  'error.unknownHullBody': '该击杀记录有效，但目标不属于可识别的舰船档案。它可能是一座建筑、货柜，或其他非舰船目标。情报链路无法建立。',
  'error.back': '返回上一步',
  'error.noTargetCode': '无法锁定目标',
  'error.noTargetTitle': '暂无可用的每日目标',
  'error.noTargetBody': '当前没有符合条件的每日击杀记录。请打开自由模式手动选择目标。',
  'error.freeMode': '打开自由模式',
  'error.date': '日期无效——已使用今日目标。',
  'error.oldState': '谜题数据已更新——本地尝试已重置。',
  'error.noAnswer': '目标数据不可用。',
  'toast.langChanged': '语言链路：{lang}',
  'toast.newPuzzle': '新的 UTC 目标已就绪',
  'toast.intel': '情报包已解密',
  'toast.clue': '+{n} 份碎片',
  'toast.copied': '简报链接已复制',
  'toast.copyFailed': '复制失败——链接已显示在结算页',
  'toast.duplicate': '该舰船已分析过',
  'toast.invalid': '请从数据库中选择一艘船',
  'common.close': '关闭',
  'common.today': '今日',
  'common.utc': 'UTC',
  'common.loading': '正在建立上行链路',
  'common.loadingSub': '正在解密每日情报包',
  'common.footer': '粉丝制作的每日谜题 · 与 Fenris Creations（原 CCP hf. / CCP Games）无关',
  'common.copyLink': '复制链接',
  'common.none': '无',
  'common.attempts': '{n} 次尝试',
};

const de = {
  'app.name': 'FITDLE',
  'app.subtitle': 'TÄGLICHES KILLBOARD',
  'app.description': 'Ein tägliches EVE-Online-Killboard-Rätsel. Lies die Fittings, zerstöre die Hülle.',
  'header.reset': 'NÄCHSTES ZIEL IN',
  'header.archive': 'ARCHIV',
  'header.playToday': 'HEUTE SPIELEN',
  'header.language': 'SPRACHE',
  'header.help': 'HANDBUCH',
  'header.newTarget': 'EIN NEUES ZIEL IST VERFÜGBAR',
  'header.snapshot': 'INTEL-SNAPSHOT',
  'hero.kicker': 'TQ // TÄGLICHE AUFKLÄRUNG',
  'hero.title': 'ZERSTÖRE DIE HÜLLE',
  'hero.body': 'Sechs Versuche. Ein Schiff. Seine Fittings und Kennzahlen liegen hinter schrittweise freigegebener Aufklärung. Lies die Killmails. Zerstöre die Hülle.',
  'hero.attempts': 'VERSUCHE',
  'hero.fragments': 'FRAGMENTE',
  'hero.target': 'UNBEKANNTE HÜLLE',
  'hero.targetSub': 'SIGNAL UNGEKLÄRT',
  'hero.status': 'AUFKLÄRUNGSSTATUS',
  'hero.statusValue': 'AKTIVE ABFANGUNG',
  'board.title': 'ZIELERFASSUNG',
  'board.subtitle': 'Reiche eine Hülle ein, vergleiche ihr Profil und hole das nächste Intel-Paket.',
  'board.attempt': 'VERSUCH {n}',
  'board.awaiting': 'WARTE AUF ZIEL',
  'board.mismatch': 'PROFIL PASST NICHT',
  'board.confirmed': 'ZIEL BESTÄTIGT',
  'board.match': 'PROFIL-ÜBEREINSTIMMUNG',
  'board.intel': 'INTEL +{n}',
  'board.placeholder': 'Schiffsnamen eingeben…',
  'board.inputLabel': 'Schiffsname',
  'board.submit': 'ZIEL ERFASSEN',
  'board.noResults': 'Keine passende Hülle in der Datenbank',
  'board.already': 'Hülle bereits analysiert',
  'board.invalid': 'Wähle eine Hülle aus der Datenbank',
  'board.complete': 'ZIELZYKLUS ABGESCHLOSSEN',
  'board.enterHint': 'Enter zum Erfassen',
  'board.typeAnyLanguage': 'Alle Client-Sprachen unterstützt',
  'dossier.title': 'AUFKLÄRUNGS-DOSSIER',
  'dossier.subtitle': 'Schwache Signale werden zuerst freigegeben. Hüllenspezifische Fittings wiegen am schwersten.',
  'dossier.progress': '{revealed} / {total} ENTSCHLÜSSELT',
  'dossier.sealed': '{n} UNGEPRÜFT',
  'dossier.encrypted': 'UNGEPRÜFT',
  'dossier.encryptedHint': 'Prüfe ein weiteres Profil',
  'dossier.signal': 'SIGNALGEWICHT',
  'dossier.hullSpecific': 'HÜLLENSPEZIFISCH',
  'dossier.complete': 'DOSSIER VOLLSTÄNDIG',
  'dossier.answer': 'BESTÄTIGTE HÜLLE',
  'dossier.unit': 'EINHEIT',
  'dossier.basedOn': 'Basierend auf {n} bestückten Verlusten',
  'dossier.slotHigh': 'HOCHSLOT',
  'dossier.slotMid': 'MEDSLOT',
  'dossier.slotLow': 'LOWSLOT',
  'dossier.slotRig': 'RIGSLOT',
  'dossier.slotSubsystem': 'SUBSYSTEM',
  'dossier.slotDrone': 'DROHNENBAY',
  'dossier.slotFighter': 'JÄGERSTARTROHRE',
  'cat.identity': 'IDENTITÄT',
  'cat.hull': 'HÜLLE',
  'cat.slots': 'SLOTS',
  'cat.nav': 'NAVIGATION',
  'cat.defense': 'VERTEIDIGUNG',
  'cat.fitting': 'FITTING',
  'cat.equipment': 'AUSRÜSTUNG',
  'cat.economy': 'ZKILLBOARD',
  'cat.traits': 'EIGENSCHAFTEN',
  'clue.race': 'Rasse',
  'clue.faction': 'Fraktion',
  'clue.group': 'Hüllenklasse',
  'clue.tech': 'Tech-Stufe',
  'clue.meta': 'Meta-Gruppe',
  'clue.slots': 'Slot-Layout',
  'clue.hardpoints': 'Hardpoints',
  'clue.drones': 'Drohnenbay',
  'clue.speed': 'Max. Geschwindigkeit',
  'clue.sig': 'Signaturradius',
  'clue.align': 'Ausrichtungszeit',
  'clue.warp': 'Warpgeschwindigkeit',
  'clue.mass': 'Masse',
  'clue.massTonnes': 'Tonnen',
  'clue.massToggle': 'Masseneinheit umschalten',
  'clue.cargo': 'Frachtraum',
  'clue.shield': 'Schild-HP',
  'clue.armor': 'Panzerungs-HP',
  'clue.structure': 'Struktur-HP',
  'clue.capacitor': 'Capacitor',
  'clue.pg': 'Powergrid-Leistung',
  'clue.cpu': 'CPU-Leistung',
  'clue.calibration': 'Kalibrierung',
  'clue.targetRange': 'Zielerfassungsreichweite',
  'clue.scanRes': 'Scanauflösung',
  'clue.avgValue': 'Typischer Verlustwert',
  'clue.losses30': 'Verluste · 90 Tage',
  'clue.iskLost30': 'ISK verloren · 90 Tage',
  'clue.danger': 'Gefahrenindex',
  'clue.bonus': 'Hüllen-Boni',
  'clue.bonusRole': 'Rollenbonus',
  'clue.bonusHull': '{name}-Boni (pro Stufe)',
  'clue.equipment': 'Montiertes Modul',
  'clue.none': 'Keine',
  'clue.noDrones': 'Kein Drohnenbay',
  'clue.slotsValue': '{hi}H / {med}M / {low}L / {rig}R',
  'clue.hardpointsValue': '{turret} Turret · {launcher} Launcher',
  'clue.dronesValue': '{bandwidth} Mbit/s · {capacity} m³',
  'clue.techValue': 'Tech {n}',
  'clue.percent': '{n}%',
  'clue.medianNote': 'zKillboard-Median aktueller Verluste',
  'clue.zkbNote': 'zKillboard · 90-Tage-Fenster',
  'clue.count30': '{n} Verluste',
  'end.victoryKicker': 'SIGNALSPERRE BESTÄTIGT',
  'end.victoryTitle': 'SCHIFFSSIGNAL GESPERRT',
  'end.defeatKicker': 'SIGNAL VERLOREN',
  'end.defeatTitle': 'ZIEL VERLOREN',
  'end.victoryBody': 'Signalsperre abgeschlossen. Ziel identifiziert: {name}. Eine weitere Hülle auf deinem KILLMARK.',
  'end.defeatBody': 'Das Signal ist nach sechs Versuchen erkaltet. Das Ziel war {name}. Studiere das Dossier — die nächste Hülle entkommt dir nicht.',
  'end.attempts': 'VERSUCHE',
  'end.intel': 'ENTSCHLÜSSELTE FRAGMENTE',
  'end.share': 'BRIEFING TEILEN',
  'end.copied': 'BRIEFING-LINK KOPIERT',
  'end.copyFailed': 'Kopieren fehlgeschlagen — Link unten auswählen',
  'end.zkb': 'zKILLBOARD ÖFFNEN',
  'end.killmail': 'KILLMAIL ANSEHEN',
  'end.killboard': 'KILLBOARD ANSEHEN',
  'end.review': 'DOSSIER ANSEHEN',
  'end.next': 'NÄCHSTES ZIEL',
  'end.played': 'GESPIELT',
  'end.winRate': 'SIEGQUOTE',
  'end.streak': 'SERIE',
  'end.distribution': 'VERSUCHSVERTEILUNG',
  'end.shareScore': 'FITDLE {date} — {score}/6',
  'end.shareLoss': 'FITDLE {date} — X/6',
  'help.title': 'HANDBUCH',
  'help.intro': 'FITDLE ist ein tägliches Killmail-Rätsel für EVE Online. Die Antwort ist immer eine konkrete Killmail, die auf zKillboard aktiv ist.',
  'help.step1Title': '01 // DOSSIER LESEN',
  'help.step1': 'Das Ziel beginnt fast vollständig klassifiziert. Jede falsche Erfassung gibt sechs weitere Fragmente frei.',
  'help.step2Title': '02 // ZIEL ERFASSEN',
  'help.step2': 'Suche jedes Schiff der EVE-Datenbank in jeder unterstützten Client-Sprache. Sechs Versuche. Ein Ziel pro UTC-Tag.',
  'help.step3Title': '03 // INTEL VERFOLGEN',
  'help.step3': 'Intel wird schrittweise freigegeben. Lies das Killmail-Dossier und vergleiche die Hinweise, die dein Tipp mit dem Ziel teilt.',
  'help.step4Title': '04 // BRIEFING TEILEN',
  'help.step4': 'Teile nach Zyklusende einen spoilerfreien Link. Alle mit demselben UTC-Datum erhalten dasselbe Ziel, in jeder Sprache.',
  'help.weightTitle': 'SIGNALGEWICHT',
  'help.weightBody': 'Das Gewicht schätzt, wie stark ein Fragment das Zielfeld eingrenzt, berechnet über den aktiven Hüllenpool. Niedriges Gewicht = viele Hüllen passen. Hohes Gewicht = wenige.',
  'help.langTitle': 'SPRACHEN',
  'help.langBody': 'Oberfläche, Hüllennamen, Module und Beschreibungen nutzen die offiziellen EVE-Lokalisierungen für EN, DE, ES, FR, JA, KO, RU und ZH. Das Tagesziel ist sprachunabhängig; die Sprache ändert die Antwort nie.',
  'help.sourceTitle': 'QUELLEN',
  'help.sourceBody': 'Schiffsdaten: CCP EVE Static Data Export. Kill-, Fitting- und ISK-Daten: zKillboard. EVE Online ist eine Marke von CCP hf. Dies ist ein unabhängiges Fanprojekt.',
  'help.cycle': 'UTC-Zyklus',
  'help.pool': 'Antwort-Hüllenpool',
  'help.statsTitle': 'GESAMTSTATISTIK',
  'help.statsEmpty': 'Noch keine abgeschlossenen Zyklen.',
  'help.statPlayed': 'Gespielt',
  'help.statWon': 'Kills',
  'help.statStreak': 'Aktuelle Serie',
  'help.statBest': 'Beste Serie',
  'help.resetRecord': 'Allen Fortschritt zurücksetzen',
  'help.resetConfirm': 'Allen lokalen Fortschritt, Statistiken, Serien und Einstellungen zurücksetzen? Nicht umkehrbar.',
  'error.title': 'VERBINDUNG FEHLGESCHLAGEN',
  'error.body': 'Das Intel-Paket konnte nicht geladen werden. Prüfe die Verbindung und versuche es erneut.',
  'error.retry': 'ERNEUT VERBINDEN',
  'error.unknownHullCode': 'SIGNAL NICHT ZUGEORDNET',
  'error.unknownHullTitle': 'Ziel außerhalb des Schiffsregisters',
  'error.unknownHullBody': 'Der Killmail ist gültig, aber das Ziel ist kein registrierter Schiffsrumpf. Es könnte eine Struktur, ein Container oder ein anderes Nicht-Schiffsziel sein. Die Geheimdienstverbindung kann nicht aufgebaut werden.',
  'error.back': 'ZURÜCK',
  'error.noTargetCode': 'KEIN ZIEL',
  'error.noTargetTitle': 'Kein gültiges Ziel gefunden',
  'error.noTargetBody': 'Für den täglichen Killmail konnte kein gültiges Ziel ausgewählt werden. Öffne den Freien Modus und wähle ein Ziel manuell.',
  'error.freeMode': 'FREIEN MODUS ÖFFNEN',
  'error.date': 'Ungültiges Datum — heutiges Ziel wird verwendet.',
  'error.oldState': 'Puzzledaten geändert — lokaler Versuch zurückgesetzt.',
  'error.noAnswer': 'Zieldaten nicht verfügbar.',
  'toast.langChanged': 'SPRACHE: {lang}',
  'toast.newPuzzle': 'Neues UTC-Ziel verfügbar',
  'toast.intel': 'INTEL-PAKET ENTSCHLÜSSELT',
  'toast.clue': '+{n} Fragmente',
  'toast.copied': 'BRIEFING-LINK KOPIERT',
  'toast.copyFailed': 'Kopieren fehlgeschlagen — Link im Debriefing',
  'toast.duplicate': 'Hülle bereits analysiert',
  'toast.invalid': 'Wähle eine Hülle aus der Datenbank',
  'common.close': 'SCHLIESSEN',
  'common.today': 'HEUTE',
  'common.utc': 'UTC',
  'common.loading': 'VERBINDUNG WIRD AUFGEBAUT',
  'common.loadingSub': 'Tägliches Intel-Paket wird entschlüsselt',
  'common.footer': 'Ein Fan-Puzzle · Nicht mit Fenris Creations (früher CCP hf. / CCP Games) verbunden',
  'common.copyLink': 'LINK KOPIEREN',
  'common.none': 'Keine',
  'common.attempts': '{n} Versuche',
};

const es = {
  'app.name': 'FITDLE',
  'app.subtitle': 'KILLBOARD DIARIO',
  'app.description': 'Un puzzle diario de killboard de EVE Online. Lee los ajustes, destruye el casco.',
  'header.reset': 'PRÓXIMO OBJETIVO EN',
  'header.archive': 'ARCHIVO',
  'header.playToday': 'JUGAR HOY',
  'header.language': 'IDIOMA',
  'header.help': 'MANUAL DE CAMPO',
  'header.newTarget': 'HAY UN NUEVO OBJETIVO DISPONIBLE',
  'header.snapshot': 'CAPTURA DE INTELIGENCIA',
  'hero.kicker': 'TQ // INTELIGENCIA DIARIA',
  'hero.title': 'DESTRUYE EL CASCO',
  'hero.body': 'Seis intentos. Una nave. Sus ajustes y estadísticas vitales están sellados tras inteligencia que se desclasifica por etapas. Lee los killmails. Destruye el casco.',
  'hero.attempts': 'INTENTOS',
  'hero.fragments': 'FRAGMENTOS',
  'hero.target': 'CASCO DESCONOCIDO',
  'hero.targetSub': 'SEÑAL SIN RESOLVER',
  'hero.status': 'ESTADO DE RECONOCIMIENTO',
  'hero.statusValue': 'INTERCEPCIÓN ACTIVA',
  'board.title': 'ADQUISICIÓN DE OBJETIVO',
  'board.subtitle': 'Envía un casco, compara su perfil y obtén el siguiente paquete de inteligencia.',
  'board.attempt': 'INTENTO {n}',
  'board.awaiting': 'ESPERANDO OBJETIVO',
  'board.mismatch': 'PERFIL NO COINCIDE',
  'board.confirmed': 'OBJETIVO CONFIRMADO',
  'board.match': 'COINCIDENCIA DE PERFIL',
  'board.intel': 'INTELIGENCIA +{n}',
  'board.placeholder': 'Escribe el nombre de una nave…',
  'board.inputLabel': 'Nombre de la nave',
  'board.submit': 'FIJAR OBJETIVO',
  'board.noResults': 'No hay ningún casco coincidente en la base de datos',
  'board.already': 'Casco ya analizado',
  'board.invalid': 'Selecciona un casco de la base de datos',
  'board.complete': 'CICLO DE OBJETIVO COMPLETADO',
  'board.enterHint': 'Pulsa Intro para fijar',
  'board.typeAnyLanguage': 'Idiomas de cliente compatibles',
  'dossier.title': 'DOSSIER DE INTELIGENCIA',
  'dossier.subtitle': 'La inteligencia de baja señal se desclasifica primero. Los ajustes exclusivos del casco pesan más.',
  'dossier.progress': '{revealed} / {total} DESCLASIFICADOS',
  'dossier.sealed': '{n} SIN SONDEAR',
  'dossier.encrypted': 'SIN SONDEAR',
  'dossier.encryptedHint': 'Sondea otro perfil',
  'dossier.signal': 'PESO DE SEÑAL',
  'dossier.hullSpecific': 'EXCLUSIVO DEL CASCO',
  'dossier.complete': 'DOSSIER COMPLETO',
  'dossier.answer': 'CASCO CONFIRMADO',
  'dossier.unit': 'UNIDAD',
  'dossier.basedOn': 'Basado en {n} pérdidas equipadas',
  'dossier.slotHigh': 'RANURA ALTA',
  'dossier.slotMid': 'RANURA MEDIA',
  'dossier.slotLow': 'RANURA BAJA',
  'dossier.slotRig': 'RANURA DE RIG',
  'dossier.slotSubsystem': 'SUBSISTEMA',
  'dossier.slotDrone': 'BAHÍA DE DRONES',
  'dossier.slotFighter': 'TUBOS DE CAZAS',
  'cat.identity': 'IDENTIDAD',
  'cat.hull': 'CASCO',
  'cat.slots': 'RANURAS',
  'cat.nav': 'NAVEGACIÓN',
  'cat.defense': 'DEFENSA',
  'cat.fitting': 'AJUSTE',
  'cat.equipment': 'EQUIPO',
  'cat.economy': 'ZKILLBOARD',
  'cat.traits': 'RASGOS',
  'clue.race': 'Raza',
  'clue.faction': 'Facción',
  'clue.group': 'Clase de casco',
  'clue.tech': 'Nivel tecnológico',
  'clue.meta': 'Grupo meta',
  'clue.slots': 'Distribución de ranuras',
  'clue.hardpoints': 'Puntos de anclaje',
  'clue.drones': 'Bahía de drones',
  'clue.speed': 'Velocidad máxima',
  'clue.sig': 'Radio de firma',
  'clue.align': 'Tiempo de alineación',
  'clue.warp': 'Velocidad de warp',
  'clue.mass': 'Masa',
  'clue.massTonnes': 'toneladas',
  'clue.massToggle': 'Cambiar unidad de masa',
  'clue.cargo': 'Capacidad de carga',
  'clue.shield': 'HP de escudo',
  'clue.armor': 'HP de blindaje',
  'clue.structure': 'HP de estructura',
  'clue.capacitor': 'Capacitor',
  'clue.pg': 'Salida de powergrid',
  'clue.cpu': 'Salida de CPU',
  'clue.calibration': 'Calibración',
  'clue.targetRange': 'Alcance de objetivo',
  'clue.scanRes': 'Resolución de escaneo',
  'clue.avgValue': 'Valor de pérdida típico',
  'clue.losses30': 'Pérdidas · 90 días',
  'clue.iskLost30': 'ISK perdidos · 90 días',
  'clue.danger': 'Índice de peligro',
  'clue.bonus': 'Bonificaciones de casco',
  'clue.bonusRole': 'Bonificación de rol',
  'clue.bonusHull': 'Bonificaciones de {name} (por nivel)',
  'clue.equipment': 'Módulo equipado',
  'clue.none': 'Ninguno',
  'clue.noDrones': 'Sin bahía de drones',
  'clue.slotsValue': '{hi}H / {med}M / {low}L / {rig}R',
  'clue.hardpointsValue': '{turret} torreta · {launcher} lanzador',
  'clue.dronesValue': '{bandwidth} Mbit/s · {capacity} m³',
  'clue.techValue': 'Tecnología {n}',
  'clue.percent': '{n}%',
  'clue.medianNote': 'Mediana de pérdidas recientes de zKillboard',
  'clue.zkbNote': 'zKillboard · ventana de 90 días',
  'clue.count30': '{n} pérdidas',
  'end.victoryKicker': 'BLOQUEO DE SEÑAL CONFIRMADO',
  'end.victoryTitle': 'SEÑAL DE NAVE BLOQUEADA',
  'end.defeatKicker': 'SEÑAL PERDIDA',
  'end.defeatTitle': 'OBJETIVO PERDIDO',
  'end.victoryBody': 'Bloqueo de señal completado. Identidad del objetivo resuelta: {name}. Otro casco en tu KILLMARK.',
  'end.defeatBody': 'La señal se perdió tras seis intentos. El objetivo era {name}. Estudia el dossier; el siguiente no se escapará.',
  'end.attempts': 'INTENTOS USADOS',
  'end.intel': 'FRAGMENTOS DESCIFRADOS',
  'end.share': 'COMPARTIR INFORME',
  'end.copied': 'ENLACE DEL INFORME COPIADO',
  'end.copyFailed': 'No se pudo copiar; selecciona el enlace de abajo',
  'end.zkb': 'ABRIR zKILLBOARD',
  'end.killmail': 'VER KILLMAIL',
  'end.killboard': 'VER KILLBOARD',
  'end.review': 'VER DOSSIER',
  'end.next': 'PRÓXIMO OBJETIVO',
  'end.played': 'JUGADOS',
  'end.winRate': 'TASA DE VICTORIA',
  'end.streak': 'RACHA',
  'end.distribution': 'DISTRIBUCIÓN DE INTENTOS',
  'end.shareScore': 'FITDLE {date} — {score}/6',
  'end.shareLoss': 'FITDLE {date} — X/6',
  'help.title': 'MANUAL DE CAMPO',
  'help.intro': 'FITDLE es un puzzle diario de killmails para EVE Online. La respuesta siempre es un killmail concreto activo en zKillboard.',
  'help.step1Title': '01 // LEER EL DOSSIER',
  'help.step1': 'El objetivo empieza casi totalmente clasificado. Cada adquisición fallida desclasifica seis fragmentos más.',
  'help.step2Title': '02 // FIJAR EL OBJETIVO',
  'help.step2': 'Busca cualquier nave de la base de datos de EVE, en cualquier idioma de cliente compatible. Seis intentos. Un objetivo por día UTC.',
  'help.step3Title': '03 // SEGUIR INTEL',
  'help.step3': 'La intel se libera progresivamente. Lee el dossier de killmail y compara las pistas que tu nave comparte con el objetivo.',
  'help.step4Title': '04 // COMPARTIR EL INFORME',
  'help.step4': 'Al terminar el ciclo, comparte un enlace sin spoilers. Todos los que abran la misma fecha UTC verán el mismo objetivo, en cualquier idioma.',
  'help.weightTitle': 'PESO DE SEÑAL',
  'help.weightBody': 'El peso estima cuánto reduce el campo de objetivos un fragmento, calculado sobre el conjunto de cascos activos. Peso bajo = muchos cascos encajan. Peso alto = pocos.',
  'help.langTitle': 'IDIOMAS',
  'help.langBody': 'La interfaz, los nombres de cascos, los módulos y las descripciones usan las localizaciones oficiales de EVE para EN, DE, ES, FR, JA, KO, RU y ZH. El objetivo diario es independiente del idioma, así que nunca cambia la respuesta.',
  'help.sourceTitle': 'FUENTES',
  'help.sourceBody': 'Datos de naves: CCP EVE Static Data Export. Inteligencia de kills, ajustes e ISK: zKillboard. EVE Online es una marca de CCP hf. Este es un proyecto de fans no afiliado.',
  'help.cycle': 'Ciclo UTC',
  'help.pool': 'Conjunto de cascos de respuesta',
  'help.statsTitle': 'ESTADÍSTICAS TOTALES',
  'help.statsEmpty': 'Aún no hay ciclos completados.',
  'help.statPlayed': 'Jugados',
  'help.statWon': 'Kills',
  'help.statStreak': 'Racha actual',
  'help.statBest': 'Mejor racha',
  'help.resetRecord': 'Restablecer todo el progreso',
  'help.resetConfirm': '¿Restablecer todo el progreso, estadísticas, rachas y ajustes? No se puede deshacer.',
  'error.title': 'FALLO DE ENLACE',
  'error.body': 'No se pudo cargar el paquete de inteligencia. Comprueba la conexión e inténtalo de nuevo.',
  'error.retry': 'REINTENTAR',
  'error.unknownHullCode': 'SEÑAL SIN CLASIFICAR',
  'error.unknownHullTitle': 'Objetivo fuera del registro de cascos',
  'error.unknownHullBody': 'El killmail es válido, pero la víctima no es un casco de nave registrado. Puede ser una estructura, un contenedor u otro objetivo que no es una nave. No se puede establecer el enlace de inteligencia.',
  'error.back': 'VOLVER',
  'error.noTargetCode': 'SIN OBJETIVO',
  'error.noTargetTitle': 'No se encontró un objetivo válido',
  'error.noTargetBody': 'No se pudo seleccionar un killmail diario válido. Abre el modo libre y elige un objetivo manualmente.',
  'error.freeMode': 'ABRIR MODO LIBRE',
  'error.date': 'Fecha no válida: se usa el objetivo de hoy.',
  'error.oldState': 'Los datos del puzzle cambiaron: intento local reiniciado.',
  'error.noAnswer': 'Datos del objetivo no disponibles.',
  'toast.langChanged': 'IDIOMA: {lang}',
  'toast.newPuzzle': 'Nuevo objetivo UTC disponible',
  'toast.intel': 'PAQUETE DE INTELIGENCIA DESCIFRADO',
  'toast.clue': '+{n} fragmentos',
  'toast.copied': 'ENLACE DEL INFORME COPIADO',
  'toast.copyFailed': 'No se pudo copiar; el enlace aparece en el informe',
  'toast.duplicate': 'Casco ya analizado',
  'toast.invalid': 'Selecciona un casco de la base de datos',
  'common.close': 'CERRAR',
  'common.today': 'HOY',
  'common.utc': 'UTC',
  'common.loading': 'ESTABLECIENDO ENLACE',
  'common.loadingSub': 'Descifrando el paquete diario de inteligencia',
  'common.footer': 'Un puzzle de fans · No afiliado a Fenris Creations (antes CCP hf. / CCP Games)',
  'common.copyLink': 'COPIAR ENLACE',
  'common.none': 'Ninguno',
  'common.attempts': '{n} intentos',
};

const fr = {
  'app.name': 'FITDLE',
  'app.subtitle': 'KILLBOARD QUOTIDIEN',
  'app.description': 'Un puzzle quotidien de killboard EVE Online. Lisez les fittings, détruisez la coque.',
  'header.reset': 'PROCHAINE CIBLE DANS',
  'header.archive': 'ARCHIVES',
  'header.playToday': 'JOUER AUJOURD’HUI',
  'header.language': 'LANGUE',
  'header.help': 'MANUEL DE TERRAIN',
  'header.newTarget': 'UNE NOUVELLE CIBLE EST DISPONIBLE',
  'header.snapshot': 'SNAPSHOT RENSEIGNEMENT',
  'hero.kicker': 'TQ // RENSEIGNEMENT QUOTIDIEN',
  'hero.title': 'DÉTRUISEZ LA COQUE',
  'hero.body': 'Six tentatives. Un vaisseau. Ses fittings et statistiques vitales sont scellés derrière des renseignements déclassifiés par étapes. Lisez les killmails. Détruisez la coque.',
  'hero.attempts': 'TENTATIVES',
  'hero.fragments': 'FRAGMENTS',
  'hero.target': 'COQUE INCONNUE',
  'hero.targetSub': 'SIGNAL NON RÉSOLU',
  'hero.status': 'ÉTAT DE RECONNAISSANCE',
  'hero.statusValue': 'INTERCEPTION ACTIVE',
  'board.title': 'ACQUISITION DE CIBLE',
  'board.subtitle': 'Soumettez une coque, comparez son profil et extrayez le prochain paquet de renseignements.',
  'board.attempt': 'TENTATIVE {n}',
  'board.awaiting': 'EN ATTENTE DE CIBLE',
  'board.mismatch': 'PROFIL INCOMPATIBLE',
  'board.confirmed': 'CIBLE CONFIRMÉE',
  'board.match': 'CORRESPONDANCE DU PROFIL',
  'board.intel': 'RENSEIGNEMENT +{n}',
  'board.placeholder': 'Saisissez le nom d’un vaisseau…',
  'board.inputLabel': 'Nom du vaisseau',
  'board.submit': 'VERROUILLER LA CIBLE',
  'board.noResults': 'Aucune coque correspondante dans la base',
  'board.already': 'Coque déjà analysée',
  'board.invalid': 'Sélectionnez une coque dans la base de données',
  'board.complete': 'CYCLE DE CIBLE TERMINÉ',
  'board.enterHint': 'Entrée pour verrouiller',
  'board.typeAnyLanguage': 'Langues client prises en charge',
  'dossier.title': 'DOSSIER DE RENSEIGNEMENT',
  'dossier.subtitle': 'Les renseignements à faible signal sont déclassifiés en premier. Les fittings propres à la coque pèsent le plus lourd.',
  'dossier.progress': '{revealed} / {total} DÉCLASSIFIÉS',
  'dossier.sealed': '{n} NON SONDÉS',
  'dossier.encrypted': 'NON SONDÉ',
  'dossier.encryptedHint': 'Sondez un autre profil',
  'dossier.signal': 'POIDS DU SIGNAL',
  'dossier.hullSpecific': 'PROPRE À LA COQUE',
  'dossier.complete': 'DOSSIER COMPLET',
  'dossier.answer': 'COQUE CONFIRMÉE',
  'dossier.unit': 'UNITÉ',
  'dossier.basedOn': 'Basé sur {n} pertes équipées',
  'dossier.slotHigh': 'EMPLACEMENT HAUT',
  'dossier.slotMid': 'EMPLACEMENT MOYEN',
  'dossier.slotLow': 'EMPLACEMENT BAS',
  'dossier.slotRig': 'EMPLACEMENT RIG',
  'dossier.slotSubsystem': 'SOUS-SYSTÈME',
  'dossier.slotDrone': 'BAIE DE DRONES',
  'dossier.slotFighter': 'TUBES DE CHASSEURS',
  'cat.identity': 'IDENTITÉ',
  'cat.hull': 'COQUE',
  'cat.slots': 'EMPLACEMENTS',
  'cat.nav': 'NAVIGATION',
  'cat.defense': 'DÉFENSE',
  'cat.fitting': 'FITTING',
  'cat.equipment': 'ÉQUIPEMENT',
  'cat.economy': 'ZKILLBOARD',
  'cat.traits': 'TRAITS',
  'clue.race': 'Race',
  'clue.faction': 'Faction',
  'clue.group': 'Classe de coque',
  'clue.tech': 'Niveau tech',
  'clue.meta': 'Groupe méta',
  'clue.slots': 'Disposition des emplacements',
  'clue.hardpoints': 'Points de fixation',
  'clue.drones': 'Baie de drones',
  'clue.speed': 'Vitesse maximale',
  'clue.sig': 'Rayon de signature',
  'clue.align': 'Temps d’alignement',
  'clue.warp': 'Vitesse de warp',
  'clue.mass': 'Masse',
  'clue.massTonnes': 'tonnes',
  'clue.massToggle': "Changer l'unité de masse",
  'clue.cargo': 'Capacité de soute',
  'clue.shield': 'PV de bouclier',
  'clue.armor': 'PV de blindage',
  'clue.structure': 'PV de structure',
  'clue.capacitor': 'Capaciteur',
  'clue.pg': 'Puissance réseau',
  'clue.cpu': 'Puissance CPU',
  'clue.calibration': 'Calibration',
  'clue.targetRange': 'Portée de ciblage',
  'clue.scanRes': 'Résolution de scan',
  'clue.avgValue': 'Valeur de perte typique',
  'clue.losses30': 'Pertes · 90 jours',
  'clue.iskLost30': 'ISK perdus · 90 jours',
  'clue.danger': 'Indice de danger',
  'clue.bonus': 'Bonus de coque',
  'clue.bonusRole': 'Bonus de rôle',
  'clue.bonusHull': 'Bonus de {name} (par niveau)',
  'clue.equipment': 'Module équipé',
  'clue.none': 'Aucun',
  'clue.noDrones': 'Pas de baie de drones',
  'clue.slotsValue': '{hi}H / {med}M / {low}B / {rig}R',
  'clue.hardpointsValue': '{turret} tourelle · {launcher} lanceur',
  'clue.dronesValue': '{bandwidth} Mbit/s · {capacity} m³',
  'clue.techValue': 'Tech {n}',
  'clue.percent': '{n}%',
  'clue.medianNote': 'Médiane des pertes récentes zKillboard',
  'clue.zkbNote': 'zKillboard · fenêtre de 90 jours',
  'clue.count30': '{n} pertes',
  'end.victoryKicker': 'VERROUILLAGE SIGNAL CONFIRMÉ',
  'end.victoryTitle': 'SIGNAL DU VAISSEAU VERROUILLÉ',
  'end.defeatKicker': 'SIGNAL PERDU',
  'end.defeatTitle': 'CIBLE PERDUE',
  'end.victoryBody': 'Verrouillage du signal terminé. Identité de la cible résolue : {name}. Une coque de plus sur votre KILLMARK.',
  'end.defeatBody': 'Le signal s’est éteint après six tentatives. La cible était {name}. Étudiez le dossier — la prochaine ne vous échappera pas.',
  'end.attempts': 'TENTATIVES UTILISÉES',
  'end.intel': 'FRAGMENTS DÉCHIFFRÉS',
  'end.share': 'PARTAGER LE RAPPORT',
  'end.copied': 'LIEN DU RAPPORT COPIÉ',
  'end.copyFailed': 'Copie impossible — sélectionnez le lien ci-dessous',
  'end.zkb': 'OUVRIR zKILLBOARD',
  'end.killmail': 'VOIR LE KILLMAIL',
  'end.killboard': 'VOIR LE KILLBOARD',
  'end.review': 'VOIR LE DOSSIER',
  'end.next': 'PROCHAINE CIBLE',
  'end.played': 'JOUÉS',
  'end.winRate': 'TAUX DE VICTOIRE',
  'end.streak': 'SÉRIE',
  'end.distribution': 'RÉPARTITION DES TENTATIVES',
  'end.shareScore': 'FITDLE {date} — {score}/6',
  'end.shareLoss': 'FITDLE {date} — X/6',
  'help.title': 'MANUEL DE TERRAIN',
  'help.intro': 'FITDLE est un puzzle quotidien de killmails pour EVE Online. La réponse est toujours un killmail précis actif sur zKillboard.',
  'help.step1Title': '01 // LIRE LE DOSSIER',
  'help.step1': 'La cible commence presque entièrement classifiée. Chaque acquisition ratée déclassifie six fragments supplémentaires.',
  'help.step2Title': '02 // VERROUILLER LA CIBLE',
  'help.step2': 'Recherchez n’importe quel vaisseau de la base EVE, dans toute langue client prise en charge. Six tentatives. Une cible par jour UTC.',
  'help.step3Title': '03 // SUIVRE L’INTEL',
  'help.step3': 'Les infos sont révélées progressivement. Lisez le dossier killmail et comparez les indices partagés avec la cible.',
  'help.step4Title': '04 // PARTAGER LE RAPPORT',
  'help.step4': 'À la fin du cycle, partagez un lien sans spoiler. Toute personne ouvrant la même date UTC obtient la même cible, dans toutes les langues.',
  'help.weightTitle': 'POIDS DU SIGNAL',
  'help.weightBody': 'Le poids estime à quel point un fragment réduit le champ des cibles, calculé sur le pool de coques actives. Poids faible = beaucoup de coques correspondent. Poids élevé = peu.',
  'help.langTitle': 'LANGUES',
  'help.langBody': 'L’interface, les noms de coques, les modules et les descriptions utilisent les localisations officielles EVE pour EN, DE, ES, FR, JA, KO, RU et ZH. La cible quotidienne est indépendante de la langue ; elle ne change jamais la réponse.',
  'help.sourceTitle': 'SOURCES',
  'help.sourceBody': 'Données des vaisseaux : CCP EVE Static Data Export. Renseignements kills, fittings et ISK : zKillboard. EVE Online est une marque de CCP hf. Projet de fans non affilié.',
  'help.cycle': 'Cycle UTC',
  'help.pool': 'Pool de coques de réponse',
  'help.statsTitle': 'STATISTIQUES TOTALES',
  'help.statsEmpty': 'Aucun cycle terminé pour l’instant.',
  'help.statPlayed': 'Joués',
  'help.statWon': 'Kills',
  'help.statStreak': 'Série actuelle',
  'help.statBest': 'Meilleure série',
  'help.resetRecord': 'Réinitialiser toute la progression',
  'help.resetConfirm': 'Réinitialiser toute la progression, les statistiques, les séries et les réglages ? Irréversible.',
  'error.title': 'ÉCHEC DE LA LIAISON',
  'error.body': 'Impossible de charger le paquet de renseignements. Vérifiez la connexion et réessayez.',
  'error.retry': 'RÉESSAYER',
  'error.unknownHullCode': 'SIGNAL NON CLASSÉ',
  'error.unknownHullTitle': 'Cible hors du registre des coques',
  'error.unknownHullBody': "Le killmail est valide, mais la victime n'est pas une coque de vaisseau enregistrée. Il peut s'agir d'une structure, d'un conteneur ou d'une autre cible non-vaisseau. La liaison de renseignement ne peut pas être établie.",
  'error.back': 'REVENIR',
  'error.noTargetCode': 'AUCUNE CIBLE',
  'error.noTargetTitle': 'Aucune cible valide trouvée',
  'error.noTargetBody': 'Aucun killmail quotidien valide n’a pu être sélectionné. Ouvrez le mode libre et choisissez une cible manuellement.',
  'error.freeMode': 'OUVRIR LE MODE LIBRE',
  'error.date': 'Date invalide — cible du jour utilisée.',
  'error.oldState': 'Données du puzzle modifiées — tentative locale réinitialisée.',
  'error.noAnswer': 'Données de la cible indisponibles.',
  'toast.langChanged': 'LANGUE : {lang}',
  'toast.newPuzzle': 'Nouvelle cible UTC disponible',
  'toast.intel': 'PAQUET DE RENSEIGNEMENTS DÉCHIFFRÉ',
  'toast.clue': '+{n} fragments',
  'toast.copied': 'LIEN DU RAPPORT COPIÉ',
  'toast.copyFailed': 'Copie impossible — lien affiché dans le rapport',
  'toast.duplicate': 'Coque déjà analysée',
  'toast.invalid': 'Sélectionnez une coque dans la base de données',
  'common.close': 'FERMER',
  'common.today': 'AUJOURD’HUI',
  'common.utc': 'UTC',
  'common.loading': 'ÉTABLISSEMENT DE LA LIAISON',
  'common.loadingSub': 'Déchiffrement du paquet quotidien',
  'common.footer': 'Un puzzle de fans · Non affilié à Fenris Creations (anciennement CCP hf. / CCP Games)',
  'common.copyLink': 'COPIER LE LIEN',
  'common.none': 'Aucun',
  'common.attempts': '{n} tentatives',
};

const ja = {
  'app.name': 'FITDLE',
  'app.subtitle': '毎日のキルボード',
  'app.description': 'EVE Online の毎日キルボードパズル。装備を読み、船体を撃破しよう。',
  'header.reset': '次のターゲットまで',
  'header.archive': 'アーカイブ',
  'header.playToday': '今日をプレイ',
  'header.language': '言語',
  'header.help': 'フィールドマニュアル',
  'header.newTarget': '新しいターゲットが公開されました',
  'header.snapshot': 'インテル・スナップショット',
  'hero.kicker': 'TQ // デイリー・インテリジェンス',
  'hero.title': '船体を撃破せよ',
  'hero.body': '試行は6回、ターゲットは1隻。装備と主要諸元は段階的に機密解除されるインテルの中に封じられている。キルメールを読み、船体を撃破せよ。',
  'hero.attempts': '試行回数',
  'hero.fragments': '断片',
  'hero.target': '不明な船体',
  'hero.targetSub': 'シグナル未解決',
  'hero.status': '偵察状況',
  'hero.statusValue': '傍受中',
  'board.title': 'ターゲット捕捉',
  'board.subtitle': '船体を送信してプロファイルを比較し、次のインテルを引き出そう。',
  'board.attempt': '試行 {n}',
  'board.awaiting': 'ターゲット待機中',
  'board.mismatch': 'プロファイル不一致',
  'board.confirmed': 'ターゲット確認',
  'board.match': 'プロファイル一致度',
  'board.intel': 'インテル +{n}',
  'board.placeholder': '船名を入力…',
  'board.inputLabel': '船名',
  'board.submit': 'ターゲットをロック',
  'board.noResults': 'データベースに一致する船体がありません',
  'board.already': 'その船体は分析済みです',
  'board.invalid': 'データベースから船体を選択してください',
  'board.complete': 'ターゲット・サイクル終了',
  'board.enterHint': 'Enter でロック',
  'board.typeAnyLanguage': '対応クライアント言語',
  'dossier.title': 'インテリジェンス・ドシエ',
  'dossier.subtitle': '低シグナルの情報から機密解除されます。船体専用装備の重みが最大です。',
  'dossier.progress': '{revealed} / {total} 解読済み',
  'dossier.sealed': '{n} 件未探査',
  'dossier.encrypted': '未探査',
  'dossier.encryptedHint': '別のプロファイルを探査',
  'dossier.signal': 'シグナル重量',
  'dossier.hullSpecific': '船体専用',
  'dossier.complete': 'ドシエ完成',
  'dossier.answer': '確認された船体',
  'dossier.unit': '単位',
  'dossier.basedOn': '{n} 件の装備付き損失に基づく',
  'dossier.slotHigh': 'ハイスロット',
  'dossier.slotMid': 'ミディアムスロット',
  'dossier.slotLow': 'ロースロット',
  'dossier.slotRig': 'リグスロット',
  'dossier.slotSubsystem': 'サブシステム',
  'dossier.slotDrone': 'ドローン・ベイ',
  'dossier.slotFighter': 'ファイター発射管',
  'cat.identity': '身元',
  'cat.hull': '船体',
  'cat.slots': 'スロット',
  'cat.nav': '航行',
  'cat.defense': '防御',
  'cat.fitting': 'フィッティング',
  'cat.equipment': '装備',
  'cat.economy': 'ZKILLBOARD',
  'cat.traits': '特性',
  'clue.race': '種族',
  'clue.faction': '勢力',
  'clue.group': '船体クラス',
  'clue.tech': 'テックレベル',
  'clue.meta': 'メタグループ',
  'clue.slots': 'スロット構成',
  'clue.hardpoints': 'ハードポイント',
  'clue.drones': 'ドローン・ベイ',
  'clue.speed': '最大速度',
  'clue.sig': 'シグネチャ半径',
  'clue.align': 'アライメント時間',
  'clue.warp': 'ワープ速度',
  'clue.mass': '質量',
  'clue.massTonnes': 'トン',
  'clue.massToggle': '質量単位を切り替え',
  'clue.cargo': 'カーゴ容量',
  'clue.shield': 'シールド HP',
  'clue.armor': 'アーマー HP',
  'clue.structure': 'ストラクチャ HP',
  'clue.capacitor': 'キャパシタ',
  'clue.pg': 'パワーグリッド出力',
  'clue.cpu': 'CPU 出力',
  'clue.calibration': 'キャリブレーション',
  'clue.targetRange': 'ターゲット範囲',
  'clue.scanRes': 'スキャン分解能',
  'clue.avgValue': '典型的な損失額',
  'clue.losses30': '損失 · 90日',
  'clue.iskLost30': 'ISK 損失 · 90日',
  'clue.danger': '危険度',
  'clue.bonus': '船体ボーナス',
  'clue.bonusRole': 'ロールボーナス',
  'clue.bonusHull': '{name}のボーナス（スキルレベルごと）',
  'clue.equipment': '搭載モジュール',
  'clue.none': 'なし',
  'clue.noDrones': 'ドローン・ベイなし',
  'clue.slotsValue': '{hi}H / {med}M / {low}L / {rig}R',
  'clue.hardpointsValue': '{turret} タレット · {launcher} ランチャー',
  'clue.dronesValue': '{bandwidth} Mbit/s · {capacity} m³',
  'clue.techValue': 'テック {n}',
  'clue.percent': '{n}%',
  'clue.medianNote': 'zKillboard 最近の損失中央値',
  'clue.zkbNote': 'zKillboard · 90日間',
  'clue.count30': '{n} 件の損失',
  'end.victoryKicker': 'シップ・シグナル・ロック完了',
  'end.victoryTitle': '艦船信号ロック完了',
  'end.defeatKicker': 'シグナル喪失',
  'end.defeatTitle': 'ターゲット喪失',
  'end.victoryBody': '信号ロック完了。目標の識別が完了しました：{name}。KILLMARK にまた一つ。',
  'end.defeatBody': '6回の試行の末、信号は途絶えました。目標は {name} でした。ドシエを見直して、次こそ逃がさないように。',
  'end.attempts': '使用試行',
  'end.intel': '解読した断片',
  'end.share': 'ブリーフィングを共有',
  'end.copied': 'ブリーフィングリンクをコピーしました',
  'end.copyFailed': 'コピー失敗 — 下のリンクを選択してください',
  'end.zkb': 'zKILLBOARD を開く',
  'end.killmail': 'キルメールを見る',
  'end.killboard': 'キルボードを見る',
  'end.review': 'ドシエを見る',
  'end.next': '次のターゲット',
  'end.played': 'プレイ数',
  'end.winRate': '勝率',
  'end.streak': '連勝',
  'end.distribution': '試行回数分布',
  'end.shareScore': 'FITDLE {date} — {score}/6',
  'end.shareLoss': 'FITDLE {date} — X/6',
  'help.title': 'フィールドマニュアル',
  'help.intro': 'FITDLE は EVE Online の毎日キルメールパズルです。答えは常に zKillboard で活動中の特定のキルメールです。',
  'help.step1Title': '01 // ドシエを読む',
  'help.step1': 'ターゲットはほぼ完全に機密扱いです。捕捉に失敗するたび、6つの断片が機密解除されます。',
  'help.step2Title': '02 // 目標をロック',
  'help.step2': 'EVE データベースの任意の船を、対応するクライアント言語で検索できます。試行は6回、UTC ごとに1日1ターゲット。',
  'help.step3Title': '03 // 情報を追う',
  'help.step3': '情報は段階的に公開されます。キルメール・ドシエを読み、推測船と目標の共通ヒントを比較してください。',
  'help.step4Title': '04 // ブリーフィングを共有',
  'help.step4': 'サイクル終了後、ネタバレなしのリンクを共有しましょう。同じ UTC 日付を開けば、言語を問わず同じ目標が出ます。',
  'help.weightTitle': 'シグナル重量',
  'help.weightBody': '重量は、その断片がターゲット候補をどれだけ絞り込むかの推定値で、活動中の船体プール全体から算出します。低重量＝多くの船が該当。高重量＝少数。',
  'help.langTitle': '言語',
  'help.langBody': 'UI、船名、モジュール、説明は EVE 公式の EN / DE / ES / FR / JA / KO / RU / ZH ローカライズを使用します。毎日のターゲットは言語に依存しないため、言語を変えても答えは変わりません。',
  'help.sourceTitle': '出典',
  'help.sourceBody': '船体データ：CCP EVE Static Data Export。キル、フィッティング、ISK 情報：zKillboard。EVE Online は CCP hf の商標です。本作は非公式のファンプロジェクトです。',
  'help.cycle': 'UTC サイクル',
  'help.pool': '回答船体プール',
  'help.statsTitle': '総合統計',
  'help.statsEmpty': '完了したサイクルはまだありません。',
  'help.statPlayed': 'プレイ',
  'help.statWon': 'キル数',
  'help.statStreak': '現在の連勝',
  'help.statBest': '最高連勝',
  'help.resetRecord': 'すべての進行状況をリセット',
  'help.resetConfirm': 'すべての進行状況、統計、連勝、設定をリセットしますか？元に戻せません。',
  'error.title': 'アップリンク失敗',
  'error.body': 'インテル・パッケージを読み込めませんでした。接続を確認して再試行してください。',
  'error.retry': '再試行',
  'error.unknownHullCode': '信号分類不能',
  'error.unknownHullTitle': '艦船登録外の目標',
  'error.unknownHullBody': 'キルメールは有効ですが、対象は登録された船体ではありません。ストラクチャ、コンテナ、その他の非艦船目標の可能性があります。情報リンクを確立できません。',
  'error.back': '前の画面に戻る',
  'error.noTargetCode': '目標なし',
  'error.noTargetTitle': '有効な目標が見つかりません',
  'error.noTargetBody': '毎日のキルメールを選定できませんでした。フリーモードを開き、手動で目標を選んでください。',
  'error.freeMode': 'フリーモードを開く',
  'error.date': '無効な日付 — 今日のターゲットを使用します。',
  'error.oldState': 'パズルデータが更新されました — ローカル試行をリセットしました。',
  'error.noAnswer': 'ターゲットデータを利用できません。',
  'toast.langChanged': '言語：{lang}',
  'toast.newPuzzle': '新しい UTC ターゲットが利用可能です',
  'toast.intel': 'インテル・パッケージを解読しました',
  'toast.clue': '+{n} 断片',
  'toast.copied': 'ブリーフィングリンクをコピーしました',
  'toast.copyFailed': 'コピーできません — デブリーフにリンクを表示します',
  'toast.duplicate': 'その船体は分析済みです',
  'toast.invalid': 'データベースから船体を選択してください',
  'common.close': '閉じる',
  'common.today': '今日',
  'common.utc': 'UTC',
  'common.loading': 'アップリンク確立中',
  'common.loadingSub': '毎日のインテル・パッケージを解読中',
  'common.footer': 'ファン制作の毎日パズル · Fenris Creations（旧 CCP hf. / CCP Games）非公認',
  'common.copyLink': 'リンクをコピー',
  'common.none': 'なし',
  'common.attempts': '{n} 回',
};

const ko = {
  'app.name': 'FITDLE',
  'app.subtitle': '매일 킬보드',
  'app.description': 'EVE Online 일일 킬보드 퍼즐. 장비를 읽고 선체를 격파하세요.',
  'header.reset': '다음 목표까지',
  'header.archive': '아카이브',
  'header.playToday': '오늘 플레이',
  'header.language': '언어',
  'header.help': '필드 매뉴얼',
  'header.newTarget': '새 목표가 준비되었습니다',
  'header.snapshot': '정보 스냅샷',
  'hero.kicker': 'TQ // 일일 정보',
  'hero.title': '선체를 격파하라',
  'hero.body': '여섯 번의 시도, 단 하나의 함선. 장비와 주요 제원은 단계적으로 해제되는 정보 속에 봉인되어 있습니다. 킬메일을 읽고 선체를 격파하세요.',
  'hero.attempts': '시도',
  'hero.fragments': '조각',
  'hero.target': '미확인 선체',
  'hero.targetSub': '신호 미해결',
  'hero.status': '정찰 상태',
  'hero.statusValue': '능동 요격 중',
  'board.title': '목표 확보',
  'board.subtitle': '선체를 제출해 프로필을 비교하고 다음 정보 패키지를 확보하세요.',
  'board.attempt': '시도 {n}',
  'board.awaiting': '목표 대기 중',
  'board.mismatch': '프로필 불일치',
  'board.confirmed': '목표 확인',
  'board.match': '프로필 일치도',
  'board.intel': '정보 +{n}',
  'board.placeholder': '함선 이름 입력…',
  'board.inputLabel': '함선 이름',
  'board.submit': '목표 고정',
  'board.noResults': '데이터베이스에 일치하는 선체가 없습니다',
  'board.already': '이미 분석한 선체입니다',
  'board.invalid': '데이터베이스에서 선체를 선택하세요',
  'board.complete': '목표 주기 종료',
  'board.enterHint': 'Enter로 고정',
  'board.typeAnyLanguage': '지원 클라이언트 언어',
  'dossier.title': '정보 문서',
  'dossier.subtitle': '낮은 신호 정보부터 해제됩니다. 선체 전용 장비의 가중치가 가장 높습니다.',
  'dossier.progress': '{revealed} / {total} 해독',
  'dossier.sealed': '{n} 미탐사',
  'dossier.encrypted': '미탐사',
  'dossier.encryptedHint': '다른 프로필을 탐사하세요',
  'dossier.signal': '신호 가중치',
  'dossier.hullSpecific': '선체 전용',
  'dossier.complete': '문서 완성',
  'dossier.answer': '확인된 선체',
  'dossier.unit': '단위',
  'dossier.basedOn': '장비가 있는 손실 {n}건 기준',
  'dossier.slotHigh': '하이 슬롯',
  'dossier.slotMid': '미디움 슬롯',
  'dossier.slotLow': '로우 슬롯',
  'dossier.slotRig': '리그 슬롯',
  'dossier.slotSubsystem': '서브시스템',
  'dossier.slotDrone': '드론 베이',
  'dossier.slotFighter': '파이터 발사관',
  'cat.identity': '정체',
  'cat.hull': '선체',
  'cat.slots': '슬롯',
  'cat.nav': '항행',
  'cat.defense': '방어',
  'cat.fitting': '피팅',
  'cat.equipment': '장비',
  'cat.economy': 'ZKILLBOARD',
  'cat.traits': '특성',
  'clue.race': '종족',
  'clue.faction': '팩션',
  'clue.group': '선체 클래스',
  'clue.tech': '테크 레벨',
  'clue.meta': '메타 그룹',
  'clue.slots': '슬롯 구성',
  'clue.hardpoints': '하드포인트',
  'clue.drones': '드론 베이',
  'clue.speed': '최대 속도',
  'clue.sig': '시그니처 반경',
  'clue.align': '정렬 시간',
  'clue.warp': '워프 속도',
  'clue.mass': '질량',
  'clue.massTonnes': '톤',
  'clue.massToggle': '질량 단위 전환',
  'clue.cargo': '화물칸 용량',
  'clue.shield': '실드 HP',
  'clue.armor': '장갑 HP',
  'clue.structure': '내구도',
  'clue.capacitor': '캐패시터',
  'clue.pg': '파워그리드 출력',
  'clue.cpu': 'CPU 출력',
  'clue.calibration': '교정치',
  'clue.targetRange': '타겟팅 거리',
  'clue.scanRes': '스캔 정밀도',
  'clue.avgValue': '일반 손실 가치',
  'clue.losses30': '손실 · 90일',
  'clue.iskLost30': 'ISK 손실 · 90일',
  'clue.danger': '위험 지수',
  'clue.bonus': '선체 보너스',
  'clue.bonusRole': '역할 보너스',
  'clue.bonusHull': '{name} 보너스 (스킬 레벨당)',
  'clue.equipment': '장착 모듈',
  'clue.none': '없음',
  'clue.noDrones': '드론 베이 없음',
  'clue.slotsValue': '{hi}H / {med}M / {low}L / {rig}R',
  'clue.hardpointsValue': '{turret} 터렛 · {launcher} 런처',
  'clue.dronesValue': '{bandwidth} Mbit/s · {capacity} m³',
  'clue.techValue': '테크 {n}',
  'clue.percent': '{n}%',
  'clue.medianNote': 'zKillboard 최근 손실 중앙값',
  'clue.zkbNote': 'zKillboard · 90일 기준',
  'clue.count30': '손실 {n}건',
  'end.victoryKicker': '함선 신호 락 완료',
  'end.victoryTitle': '함선 신호 락 완료',
  'end.defeatKicker': '신호 상실',
  'end.defeatTitle': '목표 놓침',
  'end.victoryBody': '신호 락 완료. 목표 신원 확인: {name}. KILLMARK에 함선 하나 추가.',
  'end.defeatBody': '6번의 시도 끝에 신호가 끊겼습니다. 목표는 {name}였습니다. 문서를 검토하고 다음 목표를 놓치지 마십시오.',
  'end.attempts': '사용한 시도',
  'end.intel': '해독한 조각',
  'end.share': '브리핑 공유',
  'end.copied': '브리핑 링크 복사됨',
  'end.copyFailed': '복사 실패 — 아래 링크를 선택하세요',
  'end.zkb': 'zKILLBOARD 열기',
  'end.killmail': '킬메일 보기',
  'end.killboard': '킬보드 보기',
  'end.review': '문서 보기',
  'end.next': '다음 목표',
  'end.played': '플레이',
  'end.winRate': '승률',
  'end.streak': '연속',
  'end.distribution': '시도 분포',
  'end.shareScore': 'FITDLE {date} — {score}/6',
  'end.shareLoss': 'FITDLE {date} — X/6',
  'help.title': '필드 매뉴얼',
  'help.intro': 'FITDLE은 EVE Online 일일 킬메일 퍼즐입니다. 정답은 항상 zKillboard에서 활동 중인 특정 킬메일입니다.',
  'help.step1Title': '01 // 문서 읽기',
  'help.step1': '목표는 거의 전부 기밀로 시작합니다. 확보에 실패할 때마다 여섯 개의 조각이 추가로 해제됩니다.',
  'help.step2Title': '02 // 목표 록온',
  'help.step2': 'EVE 데이터베이스의 모든 함선을 지원 클라이언트 언어로 검색하세요. 여섯 번의 시도, UTC 기준 하루에 하나의 목표.',
  'help.step3Title': '03 // 정보 추적',
  'help.step3': '정보는 단계적으로 공개됩니다. 킬메일 문서를 읽고 추측 선체와 목표의 공통 단서를 비교하세요.',
  'help.step4Title': '04 // 브리핑 공유',
  'help.step4': '주기가 끝나면 스포일러 없는 링크를 공유하세요. 같은 UTC 날짜를 연 사람은 언어와 관계없이 같은 목표를 보게 됩니다.',
  'help.weightTitle': '신호 가중치',
  'help.weightBody': '가중치는 해당 조각이 목표 범위를 얼마나 좁히는지 추정한 값이며, 활동 중인 선체 풀 전체를 기준으로 계산합니다. 낮은 가중치 = 많은 선체가 해당. 높은 가중치 = 소수만 해당.',
  'help.langTitle': '언어',
  'help.langBody': '인터페이스, 선체 이름, 모듈, 설명은 EVE 공식 EN, DE, ES, FR, JA, KO, RU, ZH 현지화를 사용합니다. 일일 목표는 언어와 무관하므로 언어를 바꿔도 정답은 같습니다.',
  'help.sourceTitle': '출처',
  'help.sourceBody': '함선 데이터: CCP EVE Static Data Export. 킬, 피팅, ISK 정보: zKillboard. EVE Online은 CCP hf의 상표입니다. 본 프로젝트는 비공식 팬 프로젝트입니다.',
  'help.cycle': 'UTC 주기',
  'help.pool': '정답 선체 풀',
  'help.statsTitle': '전체 통계',
  'help.statsEmpty': '아직 완료한 주기가 없습니다.',
  'help.statPlayed': '플레이',
  'help.statWon': '킬 수',
  'help.statStreak': '현재 연속',
  'help.statBest': '최고 연속',
  'help.resetRecord': '모든 진행 초기화',
  'help.resetConfirm': '모든 진행, 통계, 연속 기록, 설정을 초기화할까요? 되돌릴 수 없습니다.',
  'error.title': '업링크 실패',
  'error.body': '정보 패키지를 불러오지 못했습니다. 연결을 확인하고 다시 시도하세요.',
  'error.retry': '다시 시도',
  'error.unknownHullCode': '신호 분류 불가',
  'error.unknownHullTitle': '함선 등록부에 없는 목표',
  'error.unknownHullBody': '킬메일은 유효하지만 대상은 등록된 함선 선체가 아닙니다. 구조물, 컨테이너 또는 다른 비함선 목표일 수 있습니다. 정보 링크를 설정할 수 없습니다.',
  'error.back': '이전 화면으로',
  'error.noTargetCode': '목표 없음',
  'error.noTargetTitle': '유효한 목표를 찾을 수 없습니다',
  'error.noTargetBody': '일일 킬메일을 선택하지 못했습니다. 자유 모드에서 목표를 직접 선택하세요.',
  'error.freeMode': '자유 모드 열기',
  'error.date': '잘못된 날짜 — 오늘 목표를 사용합니다.',
  'error.oldState': '퍼즐 데이터가 변경되어 로컬 시도를 초기화했습니다.',
  'error.noAnswer': '목표 데이터를 사용할 수 없습니다.',
  'toast.langChanged': '언어: {lang}',
  'toast.newPuzzle': '새 UTC 목표가 준비되었습니다',
  'toast.intel': '정보 패키지 해독 완료',
  'toast.clue': '+{n} 조각',
  'toast.copied': '브리핑 링크 복사됨',
  'toast.copyFailed': '복사 실패 — 디브리핑에 링크를 표시합니다',
  'toast.duplicate': '이미 분석한 선체입니다',
  'toast.invalid': '데이터베이스에서 선체를 선택하세요',
  'common.close': '닫기',
  'common.today': '오늘',
  'common.utc': 'UTC',
  'common.loading': '업링크 설정 중',
  'common.loadingSub': '일일 정보 패키지 해독 중',
  'common.footer': '팬 제작 일일 퍼즐 · Fenris Creations(구 CCP hf. / CCP Games) 비공식',
  'common.copyLink': '링크 복사',
  'common.none': '없음',
  'common.attempts': '{n}회',
};

const ru = {
  'app.name': 'FITDLE',
  'app.subtitle': 'ЕЖЕДНЕВНЫЙ KILLBOARD',
  'app.description': 'Ежедневная killboard-головоломка EVE Online. Читайте фитинги, уничтожайте корпус.',
  'header.reset': 'СЛЕДУЮЩАЯ ЦЕЛЬ ЧЕРЕЗ',
  'header.archive': 'АРХИВ',
  'header.playToday': 'ИГРАТЬ СЕГОДНЯ',
  'header.language': 'ЯЗЫК',
  'header.help': 'ПОЛЕВОЕ РУКОВОДСТВО',
  'header.newTarget': 'ДОСТУПНА НОВАЯ ЦЕЛЬ',
  'header.snapshot': 'СНИМОК РАЗВЕДКИ',
  'hero.kicker': 'TQ // ЕЖЕДНЕВНАЯ РАЗВЕДКА',
  'hero.title': 'УНИЧТОЖЬТЕ КОРПУС',
  'hero.body': 'Шесть попыток. Один корабль. Его фитинг и ключевые характеристики скрыты за постепенно рассекречиваемой разведкой. Прочитайте килмейлы. Уничтожьте корпус.',
  'hero.attempts': 'ПОПЫТКИ',
  'hero.fragments': 'ФРАГМЕНТЫ',
  'hero.target': 'НЕИЗВЕСТНЫЙ КОРПУС',
  'hero.targetSub': 'СИГНАЛ НЕ РАСШИФРОВАН',
  'hero.status': 'СТАТУС РАЗВЕДКИ',
  'hero.statusValue': 'АКТИВНЫЙ ПЕРЕХВАТ',
  'board.title': 'ЗАХВАТ ЦЕЛИ',
  'board.subtitle': 'Отправьте корпус, сравните профиль и получите следующий пакет разведданных.',
  'board.attempt': 'ПОПЫТКА {n}',
  'board.awaiting': 'ОЖИДАНИЕ ЦЕЛИ',
  'board.mismatch': 'ПРОФИЛЬ НЕ СОВПАДАЕТ',
  'board.confirmed': 'ЦЕЛЬ ПОДТВЕРЖДЕНА',
  'board.match': 'СОВПАДЕНИЕ ПРОФИЛЯ',
  'board.intel': 'РАЗВЕДКА +{n}',
  'board.placeholder': 'Введите название корабля…',
  'board.inputLabel': 'Название корабля',
  'board.submit': 'ЗАХВАТИТЬ ЦЕЛЬ',
  'board.noResults': 'В базе нет подходящего корпуса',
  'board.already': 'Корпус уже проанализирован',
  'board.invalid': 'Выберите корпус из базы данных',
  'board.complete': 'ЦИКЛ ЦЕЛИ ЗАВЕРШЁН',
  'board.enterHint': 'Enter — захватить',
  'board.typeAnyLanguage': 'Поддерживаемые языки клиента',
  'dossier.title': 'РАЗВЕДЫВАТЕЛЬНОЕ ДОСЬЕ',
  'dossier.subtitle': 'Слабые сигналы рассекречиваются первыми. Уникальные модули корпуса имеют наибольший вес.',
  'dossier.progress': '{revealed} / {total} РАСШИФРОВАНО',
  'dossier.sealed': '{n} НЕ ОБСЛЕДОВАНО',
  'dossier.encrypted': 'НЕ ОБСЛЕДОВАНО',
  'dossier.encryptedHint': 'Обследуйте ещё один профиль',
  'dossier.signal': 'ВЕС СИГНАЛА',
  'dossier.hullSpecific': 'УНИКАЛЬНО ДЛЯ КОРПУСА',
  'dossier.complete': 'ДОСЬЕ ЗАВЕРШЕНО',
  'dossier.answer': 'ПОДТВЕРЖДЁННЫЙ КОРПУС',
  'dossier.unit': 'ЕДИНИЦА',
  'dossier.basedOn': 'На основе {n} оснащённых потерь',
  'dossier.slotHigh': 'ВЕРХНИЙ СЛОТ',
  'dossier.slotMid': 'СРЕДНИЙ СЛОТ',
  'dossier.slotLow': 'НИЖНИЙ СЛОТ',
  'dossier.slotRig': 'СЛОТ РИГА',
  'dossier.slotSubsystem': 'ПОДСИСТЕМА',
  'dossier.slotDrone': 'ОТСЕК ДРОНОВ',
  'dossier.slotFighter': 'ТРУБЫ ИСТРЕБИТЕЛЕЙ',
  'cat.identity': 'ИДЕНТИЧНОСТЬ',
  'cat.hull': 'КОРПУС',
  'cat.slots': 'СЛОТЫ',
  'cat.nav': 'НАВИГАЦИЯ',
  'cat.defense': 'ЗАЩИТА',
  'cat.fitting': 'ФИТИНГ',
  'cat.equipment': 'ОСНАЩЕНИЕ',
  'cat.economy': 'ZKILLBOARD',
  'cat.traits': 'ОСОБЕННОСТИ',
  'clue.race': 'Раса',
  'clue.faction': 'Фракция',
  'clue.group': 'Класс корпуса',
  'clue.tech': 'Техуровень',
  'clue.meta': 'Мета-группа',
  'clue.slots': 'Раскладка слотов',
  'clue.hardpoints': 'Точки подвески',
  'clue.drones': 'Отсек дронов',
  'clue.speed': 'Макс. скорость',
  'clue.sig': 'Радиус сигнатуры',
  'clue.align': 'Время выхода на курс',
  'clue.warp': 'Скорость варпа',
  'clue.mass': 'Масса',
  'clue.massTonnes': 'тонн',
  'clue.massToggle': 'Переключить единицу массы',
  'clue.cargo': 'Вместимость трюма',
  'clue.shield': 'HP щита',
  'clue.armor': 'HP брони',
  'clue.structure': 'HP структуры',
  'clue.capacitor': 'Капаситор',
  'clue.pg': 'Мощность реактора',
  'clue.cpu': 'Мощность CPU',
  'clue.calibration': 'Калибровка',
  'clue.targetRange': 'Дальность захвата',
  'clue.scanRes': 'Разрешение сканера',
  'clue.avgValue': 'Типичная стоимость потери',
  'clue.losses30': 'Потери · 90 дней',
  'clue.iskLost30': 'Потеряно ISK · 90 дней',
  'clue.danger': 'Индекс опасности',
  'clue.bonus': 'Бонусы корпуса',
  'clue.bonusRole': 'Ролевой бонус',
  'clue.bonusHull': 'Бонусы {name} (за уровень)',
  'clue.equipment': 'Установленный модуль',
  'clue.none': 'Нет',
  'clue.noDrones': 'Нет отсека дронов',
  'clue.slotsValue': '{hi}H / {med}M / {low}L / {rig}R',
  'clue.hardpointsValue': '{turret} турелей · {launcher} пусковых',
  'clue.dronesValue': '{bandwidth} Мбит/с · {capacity} м³',
  'clue.techValue': 'Тех {n}',
  'clue.percent': '{n}%',
  'clue.medianNote': 'Медиана недавних потерь zKillboard',
  'clue.zkbNote': 'zKillboard · окно 90 дней',
  'clue.count30': '{n} потерь',
  'end.victoryKicker': 'СИГНАЛ ЗАХВАЧЕН',
  'end.victoryTitle': 'СИГНАЛ КОРАБЛЯ ЗАХВАЧЕН',
  'end.defeatKicker': 'СИГНАЛ ПОТЕРЯН',
  'end.defeatTitle': 'ЦЕЛЬ УПУЩЕНА',
  'end.victoryBody': 'Захват сигнала завершён. Цель опознана: {name}. Ещё один корпус в вашем KILLMARK.',
  'end.defeatBody': 'Сигнал остыл после шести попыток. Целью был {name}. Изучи досье — следующий не уйдёт.',
  'end.attempts': 'ИСПОЛЬЗОВАНО ПОПЫТОК',
  'end.intel': 'РАСШИФРОВАНО ФРАГМЕНТОВ',
  'end.share': 'ПОДЕЛИТЬСЯ СВОДКОЙ',
  'end.copied': 'ССЫЛКА НА СВОДКУ СКОПИРОВАНА',
  'end.copyFailed': 'Не удалось скопировать — выберите ссылку ниже',
  'end.zkb': 'ОТКРЫТЬ zKILLBOARD',
  'end.killmail': 'ОТКРЫТЬ КИЛМЕЙЛ',
  'end.killboard': 'ОТКРЫТЬ KILLBOARD',
  'end.review': 'ОТКРЫТЬ ДОСЬЕ',
  'end.next': 'СЛЕДУЮЩАЯ ЦЕЛЬ',
  'end.played': 'СЫГРАНО',
  'end.winRate': 'ПРОЦЕНТ ПОБЕД',
  'end.streak': 'СЕРИЯ',
  'end.distribution': 'РАСПРЕДЕЛЕНИЕ ПОПЫТОК',
  'end.shareScore': 'FITDLE {date} — {score}/6',
  'end.shareLoss': 'FITDLE {date} — X/6',
  'help.title': 'ПОЛЕВОЕ РУКОВОДСТВО',
  'help.intro': 'FITDLE — ежедневная головоломка по килмейлам EVE Online. Ответ — всегда конкретный килмейл, активный на zKillboard.',
  'help.step1Title': '01 // ПРОЧТИТЕ ДОСЬЕ',
  'help.step1': 'Цель почти полностью засекречена. Каждый неудачный захват рассекречивает ещё шесть фрагментов.',
  'help.step2Title': '02 // ЗАХВАТИТЕ ЦЕЛЬ',
  'help.step2': 'Ищите любой корабль в базе EVE на любом поддерживаемом языке клиента. Шесть попыток. Одна цель на сутки UTC.',
  'help.step3Title': '03 // СЛЕДИТЬ ЗА ДАННЫМИ',
  'help.step3': 'Данные раскрываются постепенно. Читайте досье килмейла и сравнивайте общие подсказки.',
  'help.step4Title': '04 // ПОДЕЛИТЕСЬ СВОДКОЙ',
  'help.step4': 'Когда цикл завершён, поделитесь ссылкой без спойлеров. Все, кто откроет ту же дату UTC, получат ту же цель на любом языке.',
  'help.weightTitle': 'ВЕС СИГНАЛА',
  'help.weightBody': 'Вес оценивает, насколько фрагмент сужает поле целей, по всему пулу активных корпусов. Низкий вес — подходит много корпусов. Высокий — мало.',
  'help.langTitle': 'ЯЗЫКИ',
  'help.langBody': 'Интерфейс, названия корпусов, модулей и описания используют официальные локализации EVE для EN, DE, ES, FR, JA, KO, RU и ZH. Ежедневная цель не зависит от языка, поэтому язык не меняет ответ.',
  'help.sourceTitle': 'ИСТОЧНИКИ',
  'help.sourceBody': 'Данные кораблей: CCP EVE Static Data Export. Разведка по киллам, фитингам и ISK: zKillboard. EVE Online — торговая марка CCP hf. Это неофициальный фанатский проект.',
  'help.cycle': 'Цикл UTC',
  'help.pool': 'Пул корпусов-ответов',
  'help.statsTitle': 'ОБЩАЯ СТАТИСТИКА',
  'help.statsEmpty': 'Завершённых циклов пока нет.',
  'help.statPlayed': 'Сыграно',
  'help.statWon': 'Килы',
  'help.statStreak': 'Текущая серия',
  'help.statBest': 'Лучшая серия',
  'help.resetRecord': 'Сбросить весь прогресс',
  'help.resetConfirm': 'Сбросить весь прогресс, статистику, серии и настройки? Необратимо.',
  'error.title': 'СБОЙ КАНАЛА',
  'error.body': 'Не удалось загрузить пакет разведки. Проверьте соединение и повторите попытку.',
  'error.retry': 'ПОВТОРИТЬ',
  'error.unknownHullCode': 'СИГНАЛ НЕ КЛАССИФИЦИРОВАН',
  'error.unknownHullTitle': 'Цель вне реестра корпусов',
  'error.unknownHullBody': 'Киллмейл действителен, но цель не является зарегистрированным корпусом корабля. Это может быть структура, контейнер или другая не-корабельная цель. Канал разведки не может быть установлен.',
  'error.back': 'ВЕРНУТЬСЯ',
  'error.noTargetCode': 'НЕТ ЦЕЛИ',
  'error.noTargetTitle': 'Допустимая цель не найдена',
  'error.noTargetBody': 'Не удалось выбрать допустимый ежедневный киллмейл. Откройте свободный режим и выберите цель вручную.',
  'error.freeMode': 'ОТКРЫТЬ СВОБОДНЫЙ РЕЖИМ',
  'error.date': 'Неверная дата — используется сегодняшняя цель.',
  'error.oldState': 'Данные головоломки изменены — локальная попытка сброшена.',
  'error.noAnswer': 'Данные цели недоступны.',
  'toast.langChanged': 'ЯЗЫК: {lang}',
  'toast.newPuzzle': 'Доступна новая цель UTC',
  'toast.intel': 'ПАКЕТ РАЗВЕДКИ РАСШИФРОВАН',
  'toast.clue': '+{n} фрагментов',
  'toast.copied': 'ССЫЛКА НА СВОДКУ СКОПИРОВАНА',
  'toast.copyFailed': 'Не удалось скопировать — ссылка в сводке',
  'toast.duplicate': 'Корпус уже проанализирован',
  'toast.invalid': 'Выберите корпус из базы данных',
  'common.close': 'ЗАКРЫТЬ',
  'common.today': 'СЕГОДНЯ',
  'common.utc': 'UTC',
  'common.loading': 'УСТАНОВКА КАНАЛА',
  'common.loadingSub': 'Расшифровка ежедневного пакета разведки',
  'common.footer': 'Фанатская головоломка · Не связана с Fenris Creations (ранее CCP hf. / CCP Games)',
  'common.copyLink': 'КОПИРОВАТЬ ССЫЛКУ',
  'common.none': 'Нет',
  'common.attempts': '{n} попыток',
};

export const MESSAGES = { en, de, es, fr, ja, ko, ru, zh };

// Small additive labels kept outside the main blocks so the eight locale
// dictionaries above stay easy to audit against each other.
const EXTRAS = {
  'dossier.decrypted': {
    en: 'DECRYPTED', de: 'ENTSCHLÜSSELT', es: 'DESCLASIFICADOS', fr: 'DÉCLASSIFIÉS',
    ja: '解読済み', ko: '해독됨', ru: 'РАСШИФРОВАНО', zh: '已解密',
  },
  'error.time': {
    en: 'INTERNET TIME UNAVAILABLE — USING LOCAL CLOCK.',
    de: 'INTERNETZEIT NICHT VERFÜGBAR — LOKALE UHR VERWENDET.',
    es: 'HORA DE INTERNET NO DISPONIBLE — USANDO EL RELOJ LOCAL.',
    fr: 'HEURE INTERNET INDISPONIBLE — HORLOGE LOCALE UTILISÉE.',
    ja: 'インターネット時刻を取得できません — ローカル時計を使用します。',
    ko: '인터넷 시간을 사용할 수 없습니다 — 로컬 시계를 사용합니다.',
    ru: 'ВРЕМЯ ИНТЕРНЕТА НЕДОСТУПНО — ИСПОЛЬЗУЕТСЯ ЛОКАЛЬНОЕ ВРЕМЯ.',
    zh: '无法获取互联网时间 — 使用本机时钟。',
  },
  'error.zkb': {
    en: 'LIVE zKILLBOARD DATA UNAVAILABLE — SDE-ONLY CLUES.',
    de: 'LIVE-zKILLBOARD-DATEN NICHT VERFÜGBAR — NUR SDE-HINWEISE.',
    es: 'DATOS DE zKILLBOARD NO DISPONIBLES — PISTAS SOLO DE SDE.',
    fr: 'DONNÉES zKILLBOARD INDISPONIBLES — INDICES SDE UNIQUEMENT.',
    ja: 'zKillboard のライブデータを取得できません — SDE 情報のみ表示します。',
    ko: 'zKillboard 실시간 데이터를 사용할 수 없습니다 — SDE 정보만 표시합니다.',
    ru: 'ДАННЫЕ zKILLBOARD НЕДОСТУПНЫ — ТОЛЬКО ДАННЫЕ SDE.',
    zh: '无法获取 zKillboard 实时数据 — 仅显示 SDE 情报。',
  },
  'mode.label': {
    en: 'MODE', de: 'MODUS', es: 'MODO', fr: 'MODE', ja: 'モード', ko: '모드', ru: 'РЕЖИМ', zh: '模式',
  },
  'mode.ruleLabel': {
    en: 'RULES', de: 'REGELN', es: 'REGLAS', fr: 'RÈGLES', ja: 'ルール', ko: '규칙', ru: 'ПРАВИЛА', zh: '规则',
  },
  'mode.standard': {
    en: 'STANDARD', de: 'STANDARD', es: 'ESTÁNDAR', fr: 'STANDARD', ja: '標準', ko: '표준', ru: 'СТАНДАРТ', zh: '标准',
  },
  'mode.abyss': {
    en: 'ABYSS', de: 'ABYSS', es: 'ABISMO', fr: 'ABYSS', ja: 'アビス', ko: '어비설', ru: 'БЕЗДНА', zh: '深渊',
  },
  'mode.standardHint': {
    en: 'Base stats + live killmails. Misses release fittings; matches release shared clues.',
    de: 'Basiswerte + Live-Killmails. Fehlversuche geben Fittings frei; Treffer gemeinsame Hinweise.',
    es: 'Estadísticas base + killmails en vivo. Los fallos liberan ajustes; los aciertos, pistas compartidas.',
    fr: 'Stats de base + killmails en direct. Les erreurs libèrent des fittings ; les correspondances, des indices partagés.',
    ja: '基本値 + ライブ・キルメール。誤答で装備、一致で共通ヒントを公開。',
    ko: '기본 능력치 + 실시간 킬메일. 오답은 장비, 일치는 공통 단서를 공개.',
    ru: 'Базовые данные + живые килмейлы. Промах раскрывает модули, совпадение — общие подсказки.',
    zh: '基础属性 + 实时击杀。猜错揭示装备；相同线索才揭示。',
  },
  'mode.abyssHint': {
    en: 'ABYSSAL: simulated fittings, rarer hulls, +1..+5 equipment +1 intel.',
    de: 'ABYSS: simulierte Fittings, seltenere Hüllen, +1/+2/+3 Infos.',
    es: 'ABISMO: ajustes simulados, cascos más raros, +1/+2/+3 pistas.',
    fr: 'ABYSS : fittings simulés, coques plus rares, +1/+2/+3 indices.',
    ja: 'アビス: 装備シミュレーション、希少船体、+1/+2/+3情報。',
    ko: '어비설: 장비 시뮬레이션, 희귀 선체, +1/+2/+3 정보.',
    ru: 'БЕЗДНА: симуляция фитинга, редкие корпуса, +1/+2/+3 данных.',
    zh: '深渊：装备模拟、稀有船体，+1~+5 装备线索 +1 其他线索。',
  },
  'clue.kbValue': { en: 'KILLMAIL VALUE', de: 'KILLMAIL-WERT', es: 'VALOR DEL KILLMAIL', fr: 'VALEUR DU KILLMAIL', ja: 'キルメール価値', ko: '킬메일 가치', ru: 'СТОИМОСТЬ КИЛМЕЙЛА', zh: '击杀总价值' },
  'clue.sensorStrength': {
    en: 'SENSOR STRENGTH', de: 'SENSORSTÄRKE', es: 'INTENSIDAD DE SENSORES',
    fr: 'INTENSITÉ DES CAPTEURS', ja: 'センサー強度', ko: '센서 강도',
    ru: 'СИЛА СЕНСОРОВ', zh: '传感器强度',
  },
  'clue.shieldRecharge': {
    en: 'SHIELD RECHARGE', de: 'SCHILD-AUFLADUNG', es: 'RECARGA DE ESCUDO',
    fr: 'RECHARGE DU BOUCLIER', ja: 'シールド再充電', ko: '실드 재충전',
    ru: 'ПЕРЕЗАРЯДКА ЩИТА', zh: '护盾回充时间',
  },
  'sensor.radar': {
    en: 'RADAR', de: 'RADAR', es: 'RADAR', fr: 'RADAR',
    ja: 'レーダー', ko: '레이더', ru: 'РАДАР', zh: '雷达',
  },
  'sensor.ladar': {
    en: 'LADAR', de: 'LADAR', es: 'LÁDAR', fr: 'LADAR',
    ja: 'ライダー', ko: '라이다', ru: 'ЛИДАР', zh: '光雷达',
  },
  'sensor.magnetometric': {
    en: 'MAGNETOMETRIC', de: 'MAGNETOMETRISCH', es: 'MAGNETOMÉTRICO',
    fr: 'MAGNÉTOMÉTRIQUE', ja: 'マグネトメトリック', ko: '자기장',
    ru: 'МАГНИТОМЕТРИЧЕСКИЙ', zh: '磁力',
  },
  'sensor.gravimetric': {
    en: 'GRAVIMETRIC', de: 'GRAVIMETRISCH', es: 'GRAVIMÉTRICO',
    fr: 'GRAVIMÉTRIQUE', ja: 'グラビメトリック', ko: '중력',
    ru: 'ГРАВИМЕТРИЧЕСКИЙ', zh: '引力',
  },
  'cat.targeting': { en: 'TARGETING', de: 'ZIELERFASSUNG', es: 'FIJACIÓN', fr: 'CIBLAGE', ja: 'ターゲティング', ko: '타게팅', ru: 'НАВЕДЕНИЕ', zh: '目标锁定' },
  'clue.maxLockedTargets': { en: 'MAX LOCKED TARGETS', de: 'MAX. GESPERRTE ZIELE', es: 'OBJETIVOS FIJADOS MÁX.', fr: 'CIBLES VERROUILLÉES MAX.', ja: '最大ロック数', ko: '최대 록 수', ru: 'МАКС. ЗАХВАЧЕННЫХ ЦЕЛЕЙ', zh: '最大锁定数量' },
  'clue.resists': { en: 'RESISTS', de: 'RESISTENZEN', es: 'RESISTENCIAS', fr: 'RÉSISTANCES', ja: '耐性', ko: '저항', ru: 'СОПРОТИВЛЕНИЕ', zh: '抗性' },
  'clue.shieldResists': { en: 'SHIELD RESISTS', de: 'SCHILD-RESISTENZEN', es: 'RESISTENCIAS DE ESCUDO', fr: 'RÉSISTANCES BOUCLIER', ja: 'シールド耐性', ko: '실드 저항', ru: 'СОПРОТИВЛЕНИЕ ЩИТА', zh: '护盾抗性' },
  'clue.armorResists': { en: 'ARMOR RESISTS', de: 'PANZERUNGS-RESISTENZEN', es: 'RESISTENCIAS DE ARMADURA', fr: 'RÉSISTANCES BLINDAGE', ja: 'アーマー耐性', ko: '장갑 저항', ru: 'СОПРОТИВЛЕНИЕ БРОНИ', zh: '装甲抗性' },
  'clue.structureResists': { en: 'STRUCTURE RESISTS', de: 'STRUKTUR-RESISTENZEN', es: 'RESISTENCIAS DE ESTRUCTURA', fr: 'RÉSISTANCES STRUCTURE', ja: 'ストラクチャ耐性', ko: '구조 저항', ru: 'СОПРОТИВЛЕНИЕ КОРПУСА', zh: '结构抗性' },
  'damage.em': { en: 'EM', de: 'EM', es: 'EM', fr: 'EM', ja: 'EM', ko: 'EM', ru: 'ЭМ', zh: '电磁' },
  'damage.thermal': { en: 'Thermal', de: 'Thermisch', es: 'Térmico', fr: 'Thermique', ja: 'サーマル', ko: '열', ru: 'Тепло', zh: '热能' },
  'damage.kinetic': { en: 'Kinetic', de: 'Kinetisch', es: 'Cinético', fr: 'Cinétique', ja: 'キネティック', ko: '운동', ru: 'Кинетика', zh: '动能' },
  'damage.explosive': { en: 'Explosive', de: 'Explosiv', es: 'Explosivo', fr: 'Explosif', ja: 'エクスプローシブ', ko: '폭발', ru: 'Взрыв', zh: '爆炸' },
  'resist.shield': { en: 'SHIELD', de: 'SCHILD', es: 'ESCUDO', fr: 'BOUCLIER', ja: 'シールド', ko: '실드', ru: 'ЩИТ', zh: '护盾' },
  'resist.armor': { en: 'ARMOR', de: 'PANZERUNG', es: 'ARMADURA', fr: 'BLINDAGE', ja: 'アーマー', ko: '장갑', ru: 'БРОНЯ', zh: '装甲' },
  'resist.structure': { en: 'STRUCTURE', de: 'STRUKTUR', es: 'ESTRUCTURA', fr: 'STRUCTURE', ja: 'ストラクチャ', ko: '구조', ru: 'КОРПУС', zh: '结构' },
  'free.badge': { en: 'FREE PLAY', de: 'FREIES SPIEL', es: 'JUEGO LIBRE', fr: 'JEU LIBRE', ja: 'フリープレイ', ko: '자유 플레이', ru: 'СВОБОДНАЯ ИГРА', zh: '自由模式' },
  'free.kicker': { en: 'FREE PLAY // UNRANKED', de: 'FREIES SPIEL // UNGEWERTET', es: 'JUEGO LIBRE // SIN CLASIFICAR', fr: 'JEU LIBRE // NON CLASSÉ', ja: 'フリープレイ // ランキング外', ko: '자유 플레이 // 비집계', ru: 'СВОБОДНАЯ ИГРА // БЕЗ РЕЙТИНГА', zh: '自由模式 // 不计入数据' },
  'free.unscored': { en: 'UNSCORED', de: 'UNGEWERTET', es: 'SIN PUNTUACIÓN', fr: 'NON COMPTÉ', ja: '記録対象外', ko: '미집계', ru: 'БЕЗ ЗАЧЁТА', zh: '不计分' },
  'free.title': { en: 'FREE TARGET', de: 'FREIES ZIEL', es: 'OBJETIVO LIBRE', fr: 'CIBLE LIBRE', ja: 'フリー目標', ko: '자유 목표', ru: 'СВОБОДНАЯ ЦЕЛЬ', zh: '自由目标' },
  'free.noStats': { en: 'Free play does not count toward stats or leaderboards.', de: 'Freies Spiel zählt nicht zu Statistiken oder Ranglisten.', es: 'El juego libre no cuenta para estadísticas ni clasificaciones.', fr: 'Le jeu libre ne compte pas dans les statistiques ni les classements.', ja: 'フリープレイは統計やランキングに反映されません。', ko: '자유 플레이는 통계나 순위에 반영되지 않습니다.', ru: 'Свободная игра не учитывается в статистике и рейтингах.', zh: '自由模式不计入统计，也不会写入本地进度。' },
  'free.refresh': {
    en: 'REFRESH', de: 'NEU LADEN', es: 'RECARGAR', fr: 'RAFRAÎCHIR',
    ja: '更新', ko: '새로고침', ru: 'ОБНОВИТЬ', zh: '刷新',
  },
  'free.input': {
    en: 'SELECT KB', de: 'KB WÄHLEN', es: 'ELEGIR KB', fr: 'CHOISIR KB',
    ja: 'KB指定', ko: 'KB 지정', ru: 'УКАЗАТЬ KB', zh: '指定KB',
  },
  'free.share': {
    en: 'SHARE', de: 'TEILEN', es: 'COMPARTIR', fr: 'PARTAGER',
    ja: '共有', ko: '공유', ru: 'ПОДЕЛИТЬСЯ', zh: '分享',
  },
  'free.randomFailed': {
    en: 'Could not find a free target. Try again.', de: 'Kein freies Ziel gefunden. Versuche es erneut.',
    es: 'No se encontró un objetivo libre. Inténtalo de nuevo.', fr: 'Aucune cible libre trouvée. Réessayez.',
    ja: 'フリー目標が見つかりません。再試行してください。', ko: '자유 목표를 찾지 못했습니다. 다시 시도하세요.',
    ru: 'Не удалось найти свободную цель. Попробуйте снова.', zh: '没有找到自由目标，请重试。',
  },
  'free.kb': { en: 'KB #{id}', de: 'KB #{id}', es: 'KB #{id}', fr: 'KB #{id}', ja: 'KB #{id}', ko: 'KB #{id}', ru: 'KB #{id}', zh: 'KB #{id}' },
  'free.reset': { en: 'FREE PLAY', de: 'FREIES SPIEL', es: 'JUEGO LIBRE', fr: 'JEU LIBRE', ja: 'フリープレイ', ko: '자유 플레이', ru: 'СВОБОДНАЯ ИГРА', zh: '自由模式' },
  'free.next': { en: 'Free play has no daily reset.', de: 'Freies Spiel hat keinen täglichen Reset.', es: 'El juego libre no tiene reinicio diario.', fr: 'Le jeu libre n’a pas de réinitialisation quotidienne.', ja: 'フリープレイに毎日のリセットはありません。', ko: '자유 플레이에는 일일 초기화가 없습니다.', ru: 'В свободной игре нет ежедневного сброса.', zh: '自由模式没有每日重置。' },
  'free.streak': { en: 'STREAK', de: 'SERIE', es: 'RACHA', fr: 'SÉRIE', ja: '連続', ko: '연속', ru: 'СЕРИЯ', zh: '连杀' },
  'share.winTitle': { en: '{score}/6 — Target destroyed 🎯', de: '{score}/6 — Ziel zerstört 🎯', es: '{score}/6 — Objetivo destruido 🎯', fr: '{score}/6 — Cible détruite 🎯', ja: '{score}/6 — 目標撃破 🎯', ko: '{score}/6 — 목표 격파 🎯', ru: '{score}/6 — Цель уничтожена 🎯', zh: '{score}/6 — 目标已击毁 🎯' },
  'share.winBody': { en: 'I cracked the hull in {score} attempts. Can you beat my score? 🛰️', de: 'Ich habe die Hülle in {score} Versuchen geknackt. Schaffst du mehr? 🛰️', es: 'He reventado el casco en {score} intentos. ¿Puedes superarme? 🛰️', fr: 'J’ai percé la coque en {score} tentatives. Peux-tu faire mieux ? 🛰️', ja: '{score}回で船体を撃破。スコアを超えられる？🛰️', ko: '{score}번 만에 선체를 격파했습니다. 내 점수를 넘을 수 있나요? 🛰️', ru: 'Я уничтожил корпус за {score} попыток. Сможешь лучше? 🛰️', zh: '我用了 {score} 次尝试锁定目标。你能超过我吗？🛰️' },
  'share.oneTitle': { en: '1/6 — First-shot kill 💥', de: '1/6 — Treffer beim ersten Schuss 💥', es: '1/6 — Muerte al primer disparo 💥', fr: '1/6 — Élimination au premier tir 💥', ja: '1/6 — 初弾撃破 💥', ko: '1/6 — 첫 발에 격파 💥', ru: '1/6 — Убийство с первого выстрела 💥', zh: '1/6 — 首发命中 💥' },
  'share.oneBody': { en: 'One attempt. One kill. Can you match it?', de: 'Ein Versuch. Ein Kill. Schaffst du das auch?', es: 'Un intento. Una muerte. ¿Puedes igualarlo?', fr: 'Une tentative. Une élimination. Peux-tu égaler ça ?', ja: '1回の挑戦で1キル。同じことができる？', ko: '한 번의 시도, 한 번의 격파. 따라올 수 있나요?', ru: 'Одна попытка. Одно убийство. Повторишь?', zh: '一次尝试，一次击杀。你能做到吗？' },
  'share.lostTitle': { en: 'Target escaped 🛰️', de: 'Ziel entkommen 🛰️', es: 'El objetivo escapó 🛰️', fr: 'Cible échappée 🛰️', ja: '目標逃げられました 🛰️', ko: '목표가 도주했습니다 🛰️', ru: 'Цель ушла 🛰️', zh: '目标逃逸 🛰️' },
  'share.lostBody': { en: 'Six attempts, no kill. The target escaped. Can you do better?', de: 'Sechs Versuche, kein Kill. Das Ziel ist entkommen. Geht es besser?', es: 'Seis intentos, sin muerte. El objetivo escapó. ¿Puedes hacerlo mejor?', fr: 'Six tentatives, aucune élimination. La cible s’est échappée. Peux-tu faire mieux ?', ja: '6回挑戦しても撃破できず。目標に逃げられました。あなたは？', ko: '6번 시도에도 격파 실패. 목표가 도주했습니다. 더 잘할 수 있나요?', ru: 'Шесть попыток, цели нет. Цель ушла. Сможешь лучше?', zh: '六次尝试仍未击毁，目标逃逸了。你能做到吗？' },
  'share.open': { en: 'Play FITDLE', de: 'FITDLE spielen', es: 'Jugar a FITDLE', fr: 'Jouer à FITDLE', ja: 'FITDLEをプレイ', ko: 'FITDLE 플레이', ru: 'Играть в FITDLE', zh: '开始游戏' },
  'share.tagline': { en: 'Daily EVE Online killboard puzzle', de: 'Tägliches EVE-Online-Killboard-Rätsel', es: 'Puzle diario de killboard de EVE Online', fr: 'Puzzle quotidien de killboard EVE Online', ja: 'EVE Online 毎日キルボードパズル', ko: 'EVE Online 일일 킬보드 퍼즐', ru: 'Ежедневная головоломка по киллборду EVE Online', zh: 'EVE Online 每日击杀谜题' },
  'clue.turretHardpoints': { en: 'TURRET HARDPOINTS', de: 'TURRET-HARDPOINTS', es: 'PUNTOS DE TORRETA', fr: 'POINTS DE TOURELLE', ja: 'タレットハードポイント', ko: '터렛 하드포인트', ru: 'ТОЧКИ ТУРЕЛЕЙ', zh: '炮台安装座' },
  'clue.launcherHardpoints': { en: 'LAUNCHER HARDPOINTS', de: 'LAUNCHER-HARDPOINTS', es: 'PUNTOS DE LANZADOR', fr: 'POINTS DE LANCEUR', ja: 'ランチャーハードポイント', ko: '런처 하드포인트', ru: 'ТОЧКИ ПУСКОВЫХ', zh: '发射器安装座' },
  'clue.hiSlots': { en: 'HIGH SLOTS', de: 'HOCHSLOTS', es: 'RANURAS ALTAS', fr: 'EMPLACEMENTS HAUTS', ja: 'ハイスロット', ko: '하이 슬롯', ru: 'ВЕРХНИЕ СЛОТЫ', zh: '高能量槽' },
  'clue.medSlots': { en: 'MID SLOTS', de: 'MEDSLOTS', es: 'RANURAS MEDIAS', fr: 'EMPLACEMENTS MOYENS', ja: 'ミディアムスロット', ko: '미디움 슬롯', ru: 'СРЕДНИЕ СЛОТЫ', zh: '中能量槽' },
  'clue.lowSlots': { en: 'LOW SLOTS', de: 'NIEDRIGE SLOTS', es: 'RANURAS BAJAS', fr: 'EMPLACEMENTS BAS', ja: 'ロースロット', ko: '로우 슬롯', ru: 'НИЖНИЕ СЛОТЫ', zh: '低能量槽' },
  'clue.rigSlots': { en: 'RIG SLOTS', de: 'RIGSLOTS', es: 'RANURAS DE RIG', fr: 'EMPLACEMENTS RIG', ja: 'リグスロット', ko: '리그 슬롯', ru: 'СЛОТЫ РИГОВ', zh: '改装件槽' },
  'dossier.slotCargo': { en: 'CARGO HOLD', de: 'FRACHTRAUM', es: 'BODEGA', fr: 'Soute', ja: 'カーゴホールド', ko: '화물칸', ru: 'ТРЮМ', zh: '货仓' },
  'dossier.unique': { en: 'UNIQUE', de: 'EINZIGARTIG', es: 'ÚNICO', fr: 'UNIQUE', ja: 'ユニーク', ko: '고유', ru: 'УНИКАЛЬНО', zh: '唯一' },
  'dossier.limited': { en: 'LIMITED', de: 'EINGESCHRÄNKT', es: 'LIMITADO', fr: 'LIMITÉ', ja: '限定', ko: '제한', ru: 'ОГРАНИЧЕНО', zh: '限定' },
  'footer.copyrightTitle': {
    en: 'COPYRIGHT / LEGAL', de: 'COPYRIGHT / RECHTLICHES', es: 'COPYRIGHT / LEGAL', fr: 'COPYRIGHT / MENTIONS LÉGALES',
    ja: '著作権 / 法的情報', ko: '저작권 / 법적 고지', ru: 'АВТОРСКИЕ ПРАВА / ПРАВОВАЯ ИНФОРМАЦИЯ', zh: '版权信息',
  },
  'footer.source': {
    en: 'SOURCE CODE', de: 'QUELLCODE', es: 'CÓDIGO FUENTE', fr: 'CODE SOURCE',
    ja: 'ソースコード', ko: '소스 코드', ru: 'ИСХОДНЫЙ КОД', zh: '源代码',
  },
  'footer.copyright': {
    en: 'EVE Online and the EVE logo are trademarks of Fenris Creations (formerly CCP hf. / CCP Games). CCP was renamed Fenris Creations in 2026. © 2026 Fenris Creations. All rights reserved.',
    de: 'EVE Online und das EVE-Logo sind Marken von Fenris Creations (früher CCP hf. / CCP Games). CCP wurde 2026 in Fenris Creations umbenannt. © 2026 Fenris Creations. Alle Rechte vorbehalten.',
    es: 'EVE Online y el logotipo de EVE son marcas de Fenris Creations (antes CCP hf. / CCP Games). CCP pasó a llamarse Fenris Creations en 2026. © 2026 Fenris Creations. Todos los derechos reservados.',
    fr: 'EVE Online et le logo EVE sont des marques de Fenris Creations (anciennement CCP hf. / CCP Games). CCP est devenu Fenris Creations en 2026. © 2026 Fenris Creations. Tous droits réservés.',
    ja: 'EVE Online および EVE ロゴは Fenris Creations（旧 CCP hf. / CCP Games）の商標です。CCP は 2026 年に Fenris Creations へ改称しました。© 2026 Fenris Creations. All rights reserved.',
    ko: 'EVE Online 및 EVE 로고는 Fenris Creations(구 CCP hf. / CCP Games)의 상표입니다. CCP는 2026년 Fenris Creations로 사명을 변경했습니다. © 2026 Fenris Creations. All rights reserved.',
    ru: 'EVE Online и логотип EVE являются товарными знаками Fenris Creations (ранее CCP hf. / CCP Games). CCP переименована в Fenris Creations в 2026 году. © 2026 Fenris Creations. Все права защищены.',
    zh: 'EVE Online 与 EVE 标志是 Fenris Creations（原 CCP hf. / CCP Games）的商标。CCP 已于 2026 年更名为 Fenris Creations。© 2026 Fenris Creations。保留所有权利。',
  },
  'oneShot.kicker': {
    en: 'FIRST-PASS SIGNAL LOCK', de: 'PERFEKTER KILL', es: 'BAJA PERFECTA', fr: 'KILL PARFAIT',
    ja: 'パーフェクトキル', ko: '퍼펙트 킬', ru: 'ИДЕАЛЬНЫЙ КИЛЛ', zh: '首次信号锁定',
  },
  'oneShot.title': {
    en: 'SIGNAL LOCKED', de: 'ONE SHOT', es: 'UN SOLO DISPARO', fr: 'ONE SHOT',
    ja: '一発撃破', ko: '원샷', ru: 'С ПЕРВОГО ВЫСТРЕЛА', zh: '信号已锁定',
  },
  'oneShot.body': {
    en: 'First attempt. Signal locked on the first pass; target identity resolved.',
    de: 'Erster Versuch. Ziel zerstört. Kein zweiter Versuch nötig.',
    es: 'Primer intento. Objetivo destruido. No hace falta un segundo intento.',
    fr: 'Premier essai. Cible détruite. Aucune seconde tentative nécessaire.',
    ja: '最初の推測で目標撃破。二度目の必要はありません。',
    ko: '첫 추측에 목표 격파. 두 번째 시도는 필요 없습니다.',
    ru: 'Первая попытка. Цель уничтожена. Второй не требуется.',
    zh: '第一次尝试即完成信号锁定，目标身份已解析。',
  },
  'mode.helpLabel': {
    en: 'MODE HELP', de: 'MODUS-HILFE', es: 'AYUDA DEL MODO', fr: 'AIDE DU MODE',
    ja: 'モードヘルプ', ko: '모드 도움말', ru: 'СПРАВКА РЕЖИМА', zh: '模式帮助',
  },
  'mode.helpTitle': {
    en: 'MODE BRIEFING', de: 'MODUS-BRIEFING', es: 'INFORME DEL MODO', fr: 'BRIEFING DU MODE',
    ja: 'モード説明', ko: '모드 브리핑', ru: 'БРИФИНГ РЕЖИМА', zh: '模式说明',
  },
  'mode.helpNormalTitle': {
    en: 'STANDARD MODE', de: 'STANDARDMODUS', es: 'MODO ESTÁNDAR', fr: 'MODE STANDARD',
    ja: '標準モード', ko: '표준 모드', ru: 'СТАНДАРТНЫЙ РЕЖИМ', zh: '标准模式',
  },
  'mode.helpAbyssTitle': {
    en: 'ABYSSAL MODE', de: 'ABYSS-MODUS', es: 'MODO ABISMO', fr: 'MODE ABYSS',
    ja: 'アビスモード', ko: '어비설 모드', ru: 'РЕЖИМ БЕЗДНЫ', zh: '深渊模式',
  },
  'mode.helpNormal': {
    en: 'Initial clues are drawn by a weight threshold.\nEach miss reveals up to 2 fittings.\nOther clues only reveal when your guess shares the same value.\nTraits and fittings counts stay hidden until fully revealed.\nRandom opening clues avoid combinations that would leave only a handful of hulls.',
    de: 'Die Start-Hinweise werden über eine Gewichtsschwelle gezogen.\nJeder Fehlversuch gibt bis zu 2 Fittings frei.\nAndere Hinweise erscheinen nur bei gleichem Wert wie die Antwort.\nBoni- und Fitting-Anzahl bleiben bis zur vollständigen Freigabe verborgen.\nZufällige Start-Hinweise vermeiden Kombinationen, die nur wenige Hüllen übrig lassen.',
    es: 'Las pistas iniciales se extraen mediante un umbral de peso.\nCada fallo libera hasta 2 ajustes.\nLas demás pistas solo aparecen si tu nave comparte el mismo valor.\nEl número de bonos y ajustes permanece oculto hasta revelarse.\nLas pistas iniciales evitan combinaciones que dejen muy pocos cascos.',
    fr: 'Les indices initiaux sont tirés selon un seuil de poids.\nChaque erreur libère jusqu’à 2 fittings.\nLes autres indices n’apparaissent que si votre vaisseau partage la même valeur.\nLe nombre de bonus et fittings reste caché jusqu’à révélation complète.\nLes indices initiaux évitent les combinaisons qui ne laissent que peu de coques.',
    ja: '初期ヒントは重みのしきい値で抽選されます。\n誤答ごとに最大2装備を公開。\nその他のヒントは推測船と同じ値のときだけ公開。\nボーナスと装備の本数は全公開まで伏せられます。\n初期ヒントは候補が極端に少なくなる組み合わせを避けます。',
    ko: '초기 단서는 가중치 임계값으로 추출됩니다.\n오답마다 최대 2개 장비가 공개됩니다.\n다른 단서는 추측 선체와 같은 값일 때만 공개됩니다.\n보너스와 장비 수는 전부 공개될 때까지 숨겨집니다.\n초기 단서는 후보가 극소수만 남는 조합을 피합니다.',
    ru: 'Начальные подсказки выбираются по порогу веса.\nКаждый промах раскрывает до 2 модулей.\nОстальные подсказки появляются только при совпадении значения.\nКоличество бонусов и модулей скрыто до полного раскрытия.\nНачальные подсказки избегают комбинаций, оставляющих слишком мало корпусов.',
    zh: '初始线索按权重阈值动态抽取。\n每次猜错最多揭示 2 件装备。\n其他线索只在你猜的船与答案具有相同值时揭示。\n加成和装备数量在完全揭示前保持隐藏。\n开局随机线索会避免让候选只剩极少舰船的组合。',
  },
  'mode.helpAbyss': {
    en: 'Navigation and defense are simulated from fitted modules.\nRare and specialised hulls are more likely to be selected.\nEach miss reveals +1..+5 equipment clues and one weighted other clue.\nTraits and fittings counts stay hidden until fully revealed.',
    de: 'Navigation und Verteidigung werden aus Fittings simuliert.\nSeltene und spezialisierte Hüllen werden häufiger gewählt.\nFehlversuche geben +1, +2, +3, +4, +5 Hinweise frei.\nBoni- und Fitting-Anzahl bleiben bis zur vollständigen Freigabe verborgen.',
    es: 'Navegación y defensa se simulan desde los ajustes.\nLos cascos raros y especializados son más probables.\nLos fallos revelan +1, +2, +3, +4, +5 pistas.\nEl número de bonos y ajustes permanece oculto hasta revelarse.',
    fr: 'Navigation et défense sont simulées depuis les fittings.\nLes coques rares et spécialisées sont plus probables.\nLes erreurs révèlent +1, +2, +3, +4, +5 indices.\nLe nombre de bonus et fittings reste caché jusqu’à révélation complète.',
    ja: '航行・防御は装備からシミュレーションされます。\n希少・特殊船体が選ばれやすくなります。\n誤答ごとに +1, +2, +3, +4, +5 のヒント。\nボーナスと装備の本数は全公開まで伏せられます。',
    ko: '항법과 방어는 장비에서 시뮬레이션됩니다.\n희귀·특수 선체가 더 자주 선택됩니다.\n오답마다 +1, +2, +3, +4, +5 단서.\n보너스와 장비 수는 전부 공개될 때까지 숨겨집니다.',
    ru: 'Навигация и защита симулируются по фитингу.\nРедкие и специальные корпуса выбираются чаще.\nПромахи дают +1, +2, +3, +4, +5 подсказок.\nКоличество бонусов и модулей скрыто до полного раскрытия.',
    zh: '导航与防御按装配模块模拟。\n稀有和特殊船体更容易被选中。\n每次猜错分别揭示 +1~+5 条装备线索，并额外揭示一条其他线索。\n加成和装备数量在完全揭示前保持隐藏。',
  },
  'dossier.equipmentSealed': {
    en: 'Unprobed fittings', de: 'Ungeprüfte Fittings', es: 'Equipamiento sin sondear', fr: 'Fittings non sondés',
    ja: '未探査の装備', ko: '미탐사 장비', ru: 'Необследованные модули', zh: '未探测装备',
  },
  'dossier.traitsSealed': {
    en: 'Unprobed bonuses', de: 'Ungeprüfte Boni', es: 'Bonos sin sondear', fr: 'Bonus non sondés',
    ja: '未探査のボーナス', ko: '미탐사 보너스', ru: 'Необследованные бонусы', zh: '未探测加成',
  },
  'dossier.newClue': {
    en: 'NEW CLUE', de: 'NEUER HINWEIS', es: 'NUEVA PISTA', fr: 'NOUVEL INDICE',
    ja: '新ヒント', ko: '새 단서', ru: 'НОВАЯ ЗАЦЕПКА', zh: '新线索',
  },
  'clue.usageRank': {
    en: 'Usage rank', de: 'Nutzungsrang', es: 'Rango de uso', fr: 'Rang d’utilisation',
    ja: '使用ランク', ko: '사용 순위', ru: 'Ранг использования', zh: '使用排名',
  },
  'clue.rankTop': {
    en: 'Top {n}%', de: 'Top {n}%', es: 'Top {n}%', fr: 'Top {n}%',
    ja: '上位 {n}%', ko: '상위 {n}%', ru: 'Топ {n}%', zh: '前 {n}%',
  },
  'font.label': {
    en: 'EVE FONT', de: 'EVE-SCHRIFT', es: 'FUENTE EVE', fr: 'POLICE EVE',
    ja: 'EVEフォント', ko: 'EVE 글꼴', ru: 'ШРИФТ EVE', zh: 'EVE 字体',
  },
  'font.neue': { en: 'NEW', de: 'NEU', es: 'NUEVA', fr: 'NOUVELLE', ja: '新', ko: '신형', ru: 'НОВЫЙ', zh: '新' },
  'font.triglavian': { en: 'TRIGLAVIAN', de: 'TRIGLAVIAN', es: 'TRIGLAVIAN', fr: 'TRIGLAVIAN', ja: 'トリグラフ', ko: '트리글라비안', ru: 'ТРИГЛАВИАН', zh: '三神裔' },
  'font.triglavianToast': {
    en: 'ANCIENT SIGNAL DETECTED', de: 'URALTES SIGNAL ENTDECKT', es: 'SEÑAL ANTIGUA DETECTADA',
    fr: 'SIGNAL ANCIEN DÉTECTÉ', ja: '古代信号を検出', ko: '고대 신호 감지',
    ru: 'ОБНАРУЖЕН ДРЕВНИЙ СИГНАЛ', zh: '检测到远古信号',
  },
  'font.triglavianSub': {
    en: 'THE CLADES OBSERVE', de: 'DIE CLADES BEOBACHTEN', es: 'LOS CLADOS OBSERVAN',
    fr: 'LES CLADES OBSERVENT', ja: 'クレードが観測している', ko: '클레이드가 관측 중',
    ru: 'КЛАДЫ НАБЛЮДАЮТ', zh: '三神裔正在观察',
  },
  'font.classic': { en: 'CLASSIC', de: 'KLASSISCH', es: 'CLÁSICA', fr: 'CLASSIQUE', ja: 'クラシック', ko: '클래식', ru: 'КЛАССИКА', zh: '经典' },
  'font.switch': {
    en: 'Switch between Eve Sans Neue and classic EveSans',
    de: 'Zwischen Eve Sans Neue und klassischer EveSans wechseln',
    es: 'Cambiar entre Eve Sans Neue y la EveSans clásica',
    fr: 'Basculer entre Eve Sans Neue et l’EveSans classique',
    ja: 'Eve Sans Neue とクラシック EveSans を切り替え',
    ko: 'Eve Sans Neue와 클래식 EveSans 전환',
    ru: 'Переключить Eve Sans Neue и классический EveSans',
    zh: '在新版 Eve Sans Neue 与老版 EveSans 之间切换',
  },
  'clue.bonusLine': {
    en: 'Hull bonus {n}', de: 'Hüllen-Bonus {n}', es: 'Bono de casco {n}', fr: 'Bonus de coque {n}',
    ja: '船体ボーナス {n}', ko: '선체 보너스 {n}', ru: 'Бонус корпуса {n}', zh: '舰船加成 {n}',
  },
  'clue.turrets': {
    en: 'turrets', de: 'Türme', es: 'torretas', fr: 'tourelles', ja: 'タレット', ko: '터렛', ru: 'турели', zh: '炮台',
  },
  'clue.launchers': {
    en: 'launchers', de: 'Werfer', es: 'lanzadores', fr: 'lanceurs', ja: 'ランチャー', ko: '런처', ru: 'пусковые', zh: '发射器',
  },
  'hero.daily': {
    en: 'DAILY TARGET', de: 'TAGESZIEL', es: 'OBJETIVO DIARIO', fr: 'CIBLE DU JOUR',
    ja: 'デイリーターゲット', ko: '일일 목표', ru: 'ЕЖЕДНЕВНАЯ ЦЕЛЬ', zh: '每日目标',
  },
  'help.low': {
    en: 'LOW', de: 'NIEDRIG', es: 'BAJO', fr: 'FAIBLE', ja: '低', ko: '낮음', ru: 'НИЗКИЙ', zh: '低',
  },
  'help.high': {
    en: 'HIGH', de: 'HOCH', es: 'ALTO', fr: 'ÉLEVÉ', ja: '高', ko: '높음', ru: 'ВЫСОКИЙ', zh: '高',
  },
  'board.locked': {
    en: 'LOCKED', de: 'GESPERRT', es: 'BLOQUEADO', fr: 'VERROUILLÉ',
    ja: 'ロック中', ko: '잠김', ru: 'ЗАБЛОКИРОВАНО', zh: '已锁定',
  },
  'board.sealed': {
    en: 'UNPROBED', de: 'UNGEPRÜFT', es: 'SIN SONDEAR', fr: 'NON SONDÉ',
    ja: '未探査', ko: '미탐사', ru: 'НЕ ОБСЛЕДОВАНО', zh: '未探测',
  },
  'board.ready': {
    en: 'READY', de: 'BEREIT', es: 'LISTO', fr: 'PRÊT',
    ja: '準備完了', ko: '준비', ru: 'ГОТОВО', zh: '待命',
  },
};
for (const [key, values] of Object.entries(EXTRAS)) {
  for (const [lang, value] of Object.entries(values)) {
    if (MESSAGES[lang] && MESSAGES[lang][key] == null) MESSAGES[lang][key] = value;
  }
}

// Killboard terminology overrides. Kept separate from the legacy dictionaries
// so wording can be changed without rewriting every locale block.
const RENAMES = {
  'board.title': {
    en: 'TARGET DESTROYED', de: 'ZIEL ZERSTÖRT', es: 'OBJETIVO DESTRUIDO', fr: 'CIBLE DÉTRUITE',
    ja: 'ターゲット撃破', ko: '목표 격파', ru: 'ЦЕЛЬ УНИЧТОЖЕНА', zh: '目标击毁',
  },
  'board.subtitle': {
    en: 'Submit a hull to compare its profile and pull the next killmail.',
    de: 'Reiche eine Hülle ein, vergleiche ihr Profil und hole den nächsten Killmail.',
    es: 'Envía un casco, compara su perfil y obtén el siguiente killmail.',
    fr: 'Soumettez une coque, comparez son profil et extrayez le prochain killmail.',
    ja: '船体を送信してプロファイルを比較し、次のキルメールを取得。',
    ko: '선체를 제출해 프로필을 비교하고 다음 킬메일을 확보하세요.',
    ru: 'Отправьте корпус, сравните профиль и получите следующий килмейл.',
    zh: '提交一艘船，比对轮廓并拉取下一份击杀记录。',
  },
  'dossier.title': {
    en: 'KILLBOARD DOSSIER', de: 'KILLBOARD-DOSSIER', es: 'DOSSIER KILLBOARD', fr: 'DOSSIER KILLBOARD',
    ja: 'キルボード・ドシエ', ko: '킬보드 문서', ru: 'ДОСЬЕ KILLBOARD', zh: '击杀档案',
  },
  'dossier.subtitle': {
    en: 'Low-signal killmail intel is declassified first. Hull-specific fittings carry the highest weight.',
    de: 'Schwache Killmail-Informationen werden zuerst freigegeben. Hüllenspezifische Fittings wiegen am schwersten.',
    es: 'La inteligencia de killmail de baja señal se desclasifica primero. Los ajustes exclusivos del casco pesan más.',
    fr: 'Les informations killmail à faible signal sont déclassifiées en premier. Les fittings propres à la coque pèsent le plus lourd.',
    ja: '低シグナルのキルメール情報から機密解除されます。船体専用装備の重みが最大です。',
    ko: '낮은 신호의 킬메일 정보부터 해제됩니다. 선체 전용 장비의 가중치가 가장 높습니다.',
    ru: 'Данные килмейлов со слабым сигналом рассекречиваются первыми. Уникальные модули корпуса имеют наибольший вес.',
    zh: '低辨识度击杀情报优先解析。舰船专属装备权重最高。',
  },
  'dossier.encrypted': {
    en: 'UNPROBED', de: 'UNGEPRÜFT', es: 'SIN SONDEAR', fr: 'NON SONDÉ',
    ja: '未探査', ko: '미탐사', ru: 'НЕ ОБСЛЕДОВАНО', zh: '未探测',
  },
  'dossier.decrypted': {
    en: 'PARSED', de: 'GEPARST', es: 'ANALIZADOS', fr: 'ANALYSÉS',
    ja: '解析済み', ko: '분석됨', ru: 'РАСШИФРОВАНО', zh: '已解析',
  },
  'hero.body': {
    en: 'Six attempts. One kill. Its fittings and vital statistics are sealed behind progressively declassified killmail intel. Read the killmails. Name the hull.',
    de: 'Sechs Versuche. Ein Kill. Seine Fittings und Kennzahlen liegen hinter schrittweise freigegebenen Killmail-Informationen. Lies die Killmails. Benenne die Hülle.',
    es: 'Seis intentos. Una muerte. Sus ajustes y estadísticas vitales están sellados tras inteligencia de killmail que se desclasifica por etapas. Lee los killmails. Nombra el casco.',
    fr: 'Six tentatives. Un kill. Ses fittings et statistiques vitales sont scellés derrière des informations killmail déclassifiées par étapes. Lisez les killmails. Nommez la coque.',
    ja: '6回の試行、1つのキル。装備と主要諸元は段階的に機密解除されるキルメール情報の中に封じられている。キルメールを読み、船名を答えよ。',
    ko: '여섯 번의 시도, 하나의 킬. 장비와 주요 제원은 단계적으로 해제되는 킬메일 정보 속에 봉인되어 있습니다. 킬메일을 읽고 선체를 맞히세요.',
    ru: 'Шесть попыток. Один килл. Его фитинг и ключевые характеристики скрыты за постепенно рассекречиваемыми данными килмейлов. Прочитайте килмейлы. Назовите корпус.',
    zh: '六次尝试，一个击杀。它的装备与关键属性被封存在逐步解析的击杀情报中。读取击杀记录，完成击杀。',
  },
  'hero.fragments': {
    en: 'KILLMAIL INTEL', de: 'KILLMAIL-INTEL', es: 'INTEL DE KILLMAIL', fr: 'INTEL KILLMAIL',
    ja: 'キルメール情報', ko: '킬메일 정보', ru: 'ДАННЫЕ КИЛМЕЙЛОВ', zh: '击杀情报',
  },
  'hero.kicker': {
    en: 'TQ // DAILY KILLBOARD', de: 'TQ // TÄGLICHES KILLBOARD', es: 'TQ // KILLBOARD DIARIO', fr: 'TQ // KILLBOARD QUOTIDIEN',
    ja: 'TQ // デイリー・キルボード', ko: 'TQ // 일일 킬보드', ru: 'TQ // ЕЖЕДНЕВНЫЙ KILLBOARD', zh: 'TQ // 每日击杀板',
  },
  'hero.statusValue': {
    en: 'TRACKING KILLS', de: 'KILLS IM BLICK', es: 'RASTREANDO KILLS', fr: 'KILLS SUIVIS',
    ja: 'キル追跡中', ko: '킬 추적 중', ru: 'ОТСЛЕЖИВАНИЕ КИЛЛОВ', zh: '追踪击杀',
  },
  'header.snapshot': {
    en: 'KILLBOARD SNAPSHOT', de: 'KILLBOARD-SNAPSHOT', es: 'SNAPSHOT KILLBOARD', fr: 'SNAPSHOT KILLBOARD',
    ja: 'キルボード・スナップショット', ko: '킬보드 스냅샷', ru: 'СНИМОК KILLBOARD', zh: '击杀板快照',
  },
  'end.intel': {
    en: 'KILLMAIL INTEL PARSED', de: 'KILLMAIL-INTEL GEPARST', es: 'INTEL DE KILLMAIL ANALIZADA', fr: 'INTEL KILLMAIL ANALYSÉ',
    ja: 'キルメール情報を解析', ko: '킬메일 정보 분석', ru: 'ДАННЫЕ КИЛМЕЙЛОВ РАСШИФРОВАНЫ', zh: '已解析击杀情报',
  },
  'toast.intel': {
    en: 'NEW KILLMAIL INTEL', de: 'NEUE KILLMAIL-INFOS', es: 'NUEVA INTEL DE KILLMAIL', fr: 'NOUVELLE INTEL KILLMAIL',
    ja: '新しいキルメール情報', ko: '새 킬메일 정보', ru: 'НОВЫЕ ДАННЫЕ КИЛМЕЙЛОВ', zh: '新击杀情报',
  },
  'toast.noMatch': {
    en: 'NO SHARED KILLMAIL INTEL', de: 'KEINE GEMEINSAMEN KILLMAIL-INFOS', es: 'SIN INTEL DE KILLMAIL COMPARTIDA',
    fr: 'AUCUNE INFO KILLMAIL PARTAGÉE', ja: '共有できるキルメール情報なし', ko: '공유된 킬메일 정보 없음',
    ru: 'ОБЩИХ ДАННЫХ КИЛМЕЙЛОВ НЕТ', zh: '没有可共享的击杀情报',
  },
  'toast.clue': {
    en: '+{n} killmail intel', de: '+{n} Killmail-Infos', es: '+{n} intel de killmail', fr: '+{n} infos killmail',
    ja: '+{n} キルメール情報', ko: '+{n} 킬메일 정보', ru: '+{n} данных килмейлов', zh: '+{n} 条击杀情报',
  },
  'help.step1': {
    en: 'Standard releases equipment on a miss, and only shared clues when your guess matches. Abyssal starts at +1 and increases by one each miss.',
    de: 'Standard gibt bei Fehlversuch Fittings frei und nur gemeinsame Hinweise bei Übereinstimmung. Abyss beginnt bei +1 und steigert sich pro Fehlversuch.',
    es: 'El estándar libera ajustes al fallar y solo pistas compartidas al acertar. Abismo empieza en +1 y sube uno por fallo.',
    fr: 'Le standard libère des fittings en cas d’erreur et seulement des indices partagés en cas de correspondance. Abyss commence à +1 et augmente d’un par erreur.',
    ja: '標準は誤答で装備、一致で共通ヒントのみ公開。アビスは+1から始まり誤答ごとに1件ずつ増えます。',
    ko: '표준은 오답 시 장비, 일치 시 공통 단서만 공개합니다. 어비설은 +1부터 시작해 오답마다 1개씩 증가합니다.',
    ru: 'Стандарт раскрывает модули за промах и только общие подсказки при совпадении. Бездна начинается с +1 и растёт на один.',
    zh: '标准模式猜错揭示装备，只有与答案相同的线索才会揭示；深渊模式从 +1 开始，逐次递增。',
  },
  'help.step2': {
    en: 'Search any hull in any official client language. Six attempts. One target per EVE downtime (11:00 UTC).',
    de: 'Suche jede Hülle in jeder offiziellen Client-Sprache. Sechs Versuche. Ein Ziel pro EVE-Downtime (11:00 UTC).',
    es: 'Busca cualquier casco en cualquier idioma oficial. Seis intentos. Un objetivo por mantenimiento EVE (11:00 UTC).',
    fr: 'Cherchez n’importe quelle coque dans toutes les langues officielles. Six tentatives. Une cible par downtime EVE (11:00 UTC).',
    ja: '公式クライアント言語で任意の船体を検索。試行は6回、EVEダウンタイム（11:00 UTC）ごとに1目標。',
    ko: '공식 클라이언트 언어로 모든 선체를 검색하세요. 6회 시도, EVE 다운타임(11:00 UTC)마다 목표 1개.',
    ru: 'Ищите любой корпус на любом официальном языке. Шесть попыток. Одна цель на даунтайм EVE (11:00 UTC).',
    zh: '搜索任意舰船，支持所有官方客户端语言。六次尝试，每个 EVE 维护周期（11:00 UTC）一个目标。',
  },
  'header.reset': {
    en: 'NEXT DOWNTIME', de: 'NÄCHSTE DOWNTIME', es: 'PRÓXIMO MANTENIMIENTO', fr: 'PROCHAINE DOWNTIME',
    ja: '次回ダウンタイム', ko: '다음 다운타임', ru: 'СЛЕДУЮЩИЙ DOWNTIME', zh: '下次维护',
  },
  'end.next': {
    en: 'NEXT DOWNTIME', de: 'NÄCHSTE DOWNTIME', es: 'PRÓXIMO MANTENIMIENTO', fr: 'PROCHAINE DOWNTIME',
    ja: '次回ダウンタイム', ko: '다음 다운타임', ru: 'СЛЕДУЮЩИЙ DOWNTIME', zh: '下次维护',
  },
};
Object.assign(RENAMES, {
  'footer.copyright': {
    en: 'EVE Online and the EVE logo are the registered trademarks of Fenris Creations (formerly CCP hf.). All rights are reserved worldwide. All other trademarks are the property of their respective owners. EVE Online, the EVE logo, EVE and all associated logos and designs are the intellectual property of Fenris Creations. All artwork, screenshots, characters, vehicles, storylines, world facts or other recognizable features of the intellectual property relating to these trademarks are likewise the intellectual property of Fenris Creations. Fenris Creations has granted permission to this FITDLE deployment ({site}) to use EVE Online and all associated logos and designs for promotional and information purposes on this website, but does not endorse, and is not in any way affiliated with, FITDLE or this deployment. Fenris Creations is in no way responsible for the content on or functioning of this website, nor can it be liable for any damage arising from the use of this website.',
    de: 'EVE Online und das EVE-Logo sind eingetragene Marken von Fenris Creations (vormals CCP hf.). Alle Rechte weltweit vorbehalten. Alle anderen Marken sind Eigentum ihrer jeweiligen Inhaber. EVE Online, das EVE-Logo, EVE sowie alle zugehörigen Logos und Designs sind geistiges Eigentum von Fenris Creations. Sämtliche Kunstwerke, Screenshots, Charaktere, Fahrzeuge, Handlungsstränge, Weltfakten und sonstigen erkennbaren Merkmale der geistigen Eigentumsrechte im Zusammenhang mit diesen Marken sind ebenfalls geistiges Eigentum von Fenris Creations. Fenris Creations hat diesem FITDLE-Deployment ({site}) die Erlaubnis erteilt, EVE Online und alle zugehörigen Logos und Designs zu Werbe- und Informationszwecken auf dieser Website zu verwenden, befürwortet dieses FITDLE-Deployment jedoch nicht und ist in keiner Weise mit ihm verbunden. Fenris Creations ist in keiner Weise für die Inhalte oder die Funktionsweise dieser Website verantwortlich und haftet nicht für Schäden, die aus der Nutzung dieser Website entstehen.',
    es: 'EVE Online y el logotipo de EVE son marcas registradas de Fenris Creations (anteriormente CCP hf.). Todos los derechos están reservados en todo el mundo. Todas las demás marcas son propiedad de sus respectivos titulares. EVE Online, el logotipo de EVE, EVE y todos los logotipos y diseños asociados son propiedad intelectual de Fenris Creations. Todas las ilustraciones, capturas de pantalla, personajes, vehículos, argumentos, datos del universo u otras características reconocibles de la propiedad intelectual relacionadas con estas marcas son igualmente propiedad intelectual de Fenris Creations. Fenris Creations ha concedido permiso a esta implementación de FITDLE ({site}) para utilizar EVE Online y todos los logotipos y diseños asociados con fines promocionales e informativos en este sitio web, pero no respalda ni está afiliada de ningún modo a esta implementación de FITDLE. Fenris Creations no es responsable en modo alguno del contenido ni del funcionamiento de este sitio web, ni podrá ser considerada responsable de ningún daño derivado del uso de este sitio web.',
    fr: 'EVE Online et le logo EVE sont des marques déposées de Fenris Creations (anciennement CCP hf.). Tous droits réservés dans le monde entier. Toutes les autres marques sont la propriété de leurs détenteurs respectifs. EVE Online, le logo EVE, EVE ainsi que tous les logos et designs associés sont la propriété intellectuelle de Fenris Creations. Toutes les illustrations, captures d’écran, personnages, véhicules, scénarios, faits relatifs à l’univers ou autres éléments reconnaissables de la propriété intellectuelle liés à ces marques sont également la propriété intellectuelle de Fenris Creations. Fenris Creations a autorisé ce déploiement FITDLE ({site}) à utiliser EVE Online ainsi que tous les logos et designs associés à des fins promotionnelles et informatives sur ce site web, mais ne cautionne pas et n’est en aucune manière affiliée à ce déploiement FITDLE. Fenris Creations n’est en aucun cas responsable du contenu ou du fonctionnement de ce site web et ne saurait être tenue responsable de tout dommage résultant de l’utilisation de ce site web.',
    ja: 'EVE Online および EVE ロゴは、Fenris Creations（旧 CCP hf.）の登録商標です。世界中で全ての権利が留保されています。その他の商標はすべて、それぞれの所有者の財産です。EVE Online、EVE ロゴ、EVE および関連するすべてのロゴとデザインは、Fenris Creations の知的財産です。これらの商標に関連する知的財産に含まれるすべてのアートワーク、スクリーンショット、キャラクター、乗り物、ストーリー、世界設定その他の識別可能な要素も、同様に Fenris Creations の知的財産です。Fenris Creations は、FITDLE のデプロイ（{site}）に対し、本ウェブサイト上で宣伝および情報提供を目的として EVE Online および関連するすべてのロゴとデザインを使用することを許可していますが、FITDLE のデプロイを推奨するものではなく、いかなる関係も有していません。Fenris Creations は、本ウェブサイトの内容または動作について一切責任を負わず、本ウェブサイトの使用に起因するいかなる損害についても責任を負いません。',
    ko: 'EVE Online 및 EVE 로고는 Fenris Creations(구 CCP hf.)의 등록 상표입니다. 전 세계적으로 모든 권리가 보유됩니다. 그 밖의 모든 상표는 각 소유자의 재산입니다. EVE Online, EVE 로고, EVE 및 관련된 모든 로고와 디자인은 Fenris Creations의 지식 재산입니다. 이러한 상표와 관련된 지식 재산에 속하는 모든 아트워크, 스크린샷, 캐릭터, 탈것, 스토리, 세계관 사실 또는 기타 식별 가능한 요소 역시 Fenris Creations의 지식 재산입니다. Fenris Creations는 FITDLE 배포({site})에 본 웹사이트에서 홍보 및 정보 제공 목적으로 EVE Online과 관련된 모든 로고 및 디자인을 사용할 수 있는 허가를 부여했지만, FITDLE 배포를 보증하지 않으며 어떠한 방식으로도 제휴 관계에 있지 않습니다. Fenris Creations는 본 웹사이트의 콘텐츠나 작동에 대해 어떠한 책임도 지지 않으며, 본 웹사이트의 사용으로 발생하는 어떠한 손해에 대해서도 책임을 지지 않습니다.',
    ru: 'EVE Online и логотип EVE являются зарегистрированными товарными знаками Fenris Creations (ранее CCP hf.). Все права защищены во всём мире. Все остальные товарные знаки являются собственностью их соответствующих владельцев. EVE Online, логотип EVE, EVE и все связанные с ними логотипы и дизайны являются интеллектуальной собственностью Fenris Creations. Все художественные материалы, скриншоты, персонажи, транспортные средства, сюжетные линии, факты вселенной и другие узнаваемые элементы интеллектуальной собственности, связанные с этими товарными знаками, также являются интеллектуальной собственностью Fenris Creations. Fenris Creations предоставила развёртыванию FITDLE по адресу {site} разрешение использовать EVE Online и все связанные с ним логотипы и дизайны в рекламных и информационных целях на этом сайте, но не одобряет это развёртывание FITDLE и никаким образом не связана с ним. Fenris Creations никоим образом не несёт ответственности за содержание или работу этого сайта и не может нести ответственность за какой-либо ущерб, возникший в результате использования этого сайта.',
    zh: 'EVE Online 及 EVE 标志是 Fenris Creations（原 CCP hf.）的注册商标。全球范围内保留所有权利。所有其他商标均为其各自所有者的财产。EVE Online、EVE 标志、EVE 及所有相关标志和设计均为 Fenris Creations 的知识产权。与这些商标相关的所有美术作品、截图、角色、载具、故事情节、世界设定或其他可识别特征，同样属于 Fenris Creations 的知识产权。Fenris Creations 已授权 FITDLE 部署（{site}）在本网站上为宣传和信息目的使用 EVE Online 及所有相关标志和设计，但不认可、且在任何方面均不隶属于 FITDLE 或其部署。Fenris Creations 对本网站的内容或运行不承担任何责任，亦不对因使用本网站而产生的任何损害承担责任。',
  },
});

Object.assign(RENAMES, {
  'help.sharedTitle': {
    en: 'COMMON RULES', de: 'GEMEINSAME REGELN', es: 'REGLAS COMUNES', fr: 'RÈGLES COMMUNES',
    ja: '共通ルール', ko: '공통 규칙', ru: 'ОБЩИЕ ПРАВИЛА', zh: '通用规则',
  },
  'help.sharedRules': {
    en: 'Six attempts. One hull.\nInitial intel is drawn by weight; the exact clue count stays hidden.\nA guess reveals values shared with the target.\nOpening clues never leave fewer than six candidate hulls.',
    de: 'Sechs Versuche. Eine Hülle.\nDie ersten Hinweise werden gewichtet gezogen; die genaue Anzahl bleibt verborgen.\nEin Tipp deckt Werte auf, die mit dem Ziel übereinstimmen.\nDie ersten Hinweise lassen nie weniger als sechs mögliche Hüllen übrig.',
    es: 'Seis intentos. Un casco.\nLa información inicial se extrae por peso; el número exacto de pistas permanece oculto.\nUna respuesta revela los valores que comparte con el objetivo.\nLas pistas iniciales nunca dejan menos de seis cascos candidatos.',
    fr: 'Six tentatives. Une coque.\nLes premiers indices sont tirés selon leur poids ; leur nombre exact reste caché.\nUne proposition révèle les valeurs partagées avec la cible.\nLes indices initiaux ne laissent jamais moins de six coques candidates.',
    ja: '挑戦は6回、船体は1つ。\n最初の情報は重み付きで抽選され、ヒントの正確な数は非公開です。\n回答すると、目標と共通する値が開示されます。\n最初のヒントで候補が6隻未満になることはありません。',
    ko: '도전 6회, 선체 1척.\n초기 정보는 가중치로 추첨되며 정확한 힌트 수는 비공개입니다.\n추측하면 목표와 공유되는 값이 공개됩니다.\n초기 힌트로 후보가 6척 미만이 되지는 않습니다.',
    ru: 'Шесть попыток. Один корпус.\nНачальные сведения выбираются по весу; точное число подсказок скрыто.\nОтвет раскрывает значения, совпадающие с целью.\nНачальные подсказки никогда не оставляют меньше шести корпусов-кандидатов.',
    zh: '六次尝试，一个船体。\n初始情报按权重抽取，具体线索数量不公开。\n每次回答会揭示与目标相同的数值。\n初始线索不会让候选船体少于六艘。',
  },
  'help.step4': {
    en: 'When the cycle ends, share a spoiler-free link.',
    de: 'Wenn der Zyklus endet, teile einen spoilerfreien Link.',
    es: 'Cuando termine el ciclo, comparte un enlace sin spoilers.',
    fr: 'À la fin du cycle, partagez un lien sans spoiler.',
    ja: 'サイクル終了後は、ネタバレのないリンクを共有しましょう。',
    ko: '주기가 끝나면 스포일러 없는 링크를 공유하세요.',
    ru: 'Когда цикл завершится, поделитесь ссылкой без спойлеров.',
    zh: '本轮结束后，分享一个不剧透的链接。',
  },
  'mode.helpNormal': {
    en: 'Wrong guesses reveal equipment using a count-and-weight budget.\nLow-weight equipment appears first; high-weight picks reduce the number revealed.\nOther clues are revealed when a guess shares the target value.',
    de: 'Falsche Tipps decken Ausrüstung über ein Mengen- und Gewichtsbudget auf.\nLeichte Ausrüstung erscheint zuerst; schwere Treffer reduzieren die Anzahl.\nAndere Hinweise erscheinen, wenn ein Tipp denselben Wert wie das Ziel hat.',
    es: 'Las respuestas incorrectas revelan equipo según un presupuesto de cantidad y peso.\nEl equipo de bajo peso aparece primero; las elecciones de alto peso reducen el número revelado.\nOtras pistas aparecen cuando una respuesta comparte el valor del objetivo.',
    fr: 'Les mauvaises réponses révèlent de l’équipement selon un budget de quantité et de poids.\nL’équipement de faible poids apparaît d’abord ; les choix de poids élevé réduisent le nombre révélé.\nD’autres indices apparaissent lorsqu’une proposition partage la valeur de la cible.',
    ja: '不正解時は、数量と重みの予算に従って装備が開示されます。\n軽い装備ほど先に現れ、重い装備を引くと開示数が減ります。\n回答が目標と同じ値を持つと、その他のヒントが開示されます。',
    ko: '오답 시 수량과 가중치 예산에 따라 장비가 공개됩니다.\n낮은 가중치 장비가 먼저 나오며, 높은 가중치를 뽑으면 공개 수가 줄어듭니다.\n추측이 목표와 같은 값을 가지면 다른 힌트가 공개됩니다.',
    ru: 'Неверные ответы раскрывают оборудование по бюджету количества и веса.\nСначала появляется оборудование с низким весом; выбор тяжёлого уменьшает число раскрытий.\nДругие подсказки открываются, когда ответ совпадает со значением цели.',
    zh: '猜错时按数量与权重预算揭示装备。\n低权重装备更容易先出现；抽到高权重装备会减少揭示数量。\n当猜测与目标拥有相同数值时，揭示其他线索。',
  },
  'mode.helpAbyss': {
    en: 'All-V skills and every fitted module are simulated as active.\nRare and low-usage hulls are more likely than in standard mode.\nEach miss adds +1..+5 equipment clues, plus one weighted other clue.\nIf equipment runs short, the uncovered quota is halved (rounded up) into additional other clues; all picks follow the weight rule.',
    de: 'Alle V-Skills und jedes montierte Modul werden als aktiv simuliert.\nSeltene und wenig genutzte Hüllen sind wahrscheinlicher als im Standardmodus.\nJeder Fehlversuch fügt +1/+2/+3/+4/+5 Hinweise hinzu.\nOhne Ausrüstung oder nach vollständiger Ausrüstungsaufdeckung entfallen diese Hinweise auf andere Informationen.',
    es: 'Se simulan habilidades a V y todos los módulos equipados como activos.\nLos cascos raros y poco usados son más probables que en el modo estándar.\nCada fallo añade +1/+2/+3/+4/+5 pistas.\nSin equipo, o cuando todo el equipo ya se ha revelado, esas pistas recaen en otra información.',
    fr: 'Les compétences au niveau V et tous les modules équipés sont simulés comme actifs.\nLes coques rares et peu utilisées sont plus probables qu’en mode standard.\nChaque échec ajoute +1/+2/+3/+4/+5 indices.\nSans équipement, ou une fois tout l’équipement révélé, ces indices portent sur d’autres informations.',
    ja: '全スキル V と装着済みの全モジュールを有効としてシミュレーションします。\nレアで使用頻度の低い船体は標準モードより出やすくなります。\n不正解ごとに +1/+2/+3/+4/+5 個のヒントが追加されます。\n装備がない場合、または装備がすべて開示された場合、その分は他の情報に振り分けられます。',
    ko: '모든 스킬 V와 장착된 모든 모듈을 활성 상태로 시뮬레이션합니다.\n희귀하고 사용 빈도가 낮은 선체가 표준 모드보다 더 자주 등장합니다.\n오답마다 +1/+2/+3/+4/+5개의 힌트가 추가됩니다.\n장비가 없거나 모든 장비가 공개되면 해당 수량은 다른 정보로 대체됩니다.',
    ru: 'Все навыки V и все установленные модули моделируются как активные.\nРедкие и редко используемые корпуса встречаются чаще, чем в стандартном режиме.\nКаждый промах добавляет +1/+2/+3/+4/+5 подсказок.\nБез оборудования или после полного раскрытия оборудования эти подсказки приходятся на другие сведения.',
    zh: '按全 V 技能、所有已装配装备生效进行模拟。\n稀有和低使用率船体比标准模式更常见。\n每次猜错分别增加 +1~+5 条装备线索，并额外揭示一条其他线索。\n装备不足时，未满足的装备配额减半后向上取整，转为额外其他线索；所有抽取仍按权重进行。',
  },
});

Object.assign(RENAMES, {
  'dossier.limitedHint': {
    en: 'Can fit some hulls; a strong but not final clue.',
    de: 'Passt auf einige Hüllen; ein starker, aber kein endgültiger Hinweis.',
    es: 'Encaja en algunos cascos; una pista fuerte, pero no definitiva.',
    fr: 'Compatible avec certaines coques ; un indice fort mais pas définitif.',
    ja: '一部の船体に装着可能。有力だが決定的ではないヒント。',
    ko: '일부 선체에 장착 가능. 강력하지만 결정적이지 않은 힌트.',
    ru: 'Подходит к некоторым корпусам; сильная, но не окончательная подсказка.',
    zh: '可装配于某些船体；是强力线索，但不能唯一确定。',
  },
  'dossier.uniqueHint': {
    en: 'Fits only one hull type; the strongest equipment clue.',
    de: 'Passt nur auf einen Hüllentyp; der stärkste Ausrüstungshinweis.',
    es: 'Solo encaja en un tipo de casco; la pista de equipo más fuerte.',
    fr: 'Compatible avec un seul type de coque ; l’indice d’équipement le plus fort.',
    ja: '1種類の船体にのみ装着可能。最も強い装備ヒント。',
    ko: '한 종류의 선체에만 장착 가능. 가장 강력한 장비 힌트.',
    ru: 'Подходит только к одному типу корпуса; сильнейшая подсказка по оборудованию.',
    zh: '仅能装配于一种船体类型；最强的装备线索。',
  },
  'dossier.officerHint': {
    en: 'Officer-grade module. :O Expensive!',
    de: 'Offiziersmodul. :O Teuer!',
    es: 'Módulo de oficial. :O ¡Caro!',
    fr: 'Module officier. :O Cher !',
    ja: 'オフィサーモジュール。:O 高価！',
    ko: '오피서 모듈. :O 비싸요!',
    ru: 'Офицерский модуль. :O Дорого!',
    zh: '官员级装备。:O 好贵！',
  },
  'dossier.abyssHint': {
    en: 'Abyssal module; calculated with the closest matching representative.',
    de: 'Abgrundmodul; Berechnung mit dem nächstliegenden passenden Vertreter.',
    es: 'Módulo abisal; se calcula con el representante compatible más cercano.',
    fr: 'Module abyssal ; calculé avec le représentant compatible le plus proche.',
    ja: 'アビサルモジュール。最も近い同型代表で計算します。',
    ko: '어비설 모듈. 가장 가까운 동일 계열 대표로 계산합니다.',
    ru: 'Абиссальный модуль; расчёт по ближайшему подходящему представителю.',
    zh: '深渊装备；按最接近的同类代表计算。',
  },
  'dossier.abyssCalc': {
    en: 'Calculation: {name}',
    de: 'Berechnung: {name}',
    es: 'Cálculo: {name}',
    fr: 'Calcul : {name}',
    ja: '計算: {name}',
    ko: '계산: {name}',
    ru: 'Расчёт: {name}',
    zh: '按 {name} 计算',
  },
  'dossier.plexHint': {
    en: 'PLEX in the cargo hold? That is a very unusual fit.',
    de: 'PLEX im Frachtraum? Eine sehr ungewöhnliche Ladung.',
    es: '¿PLEX en la bodega? Una carga muy poco habitual.',
    fr: 'Du PLEX en soute ? Une cargaison très inhabituelle.',
    ja: '貨物倉にPLEX？かなり珍しい積み方です。',
    ko: '화물칸에 PLEX? 아주 특이한 적재입니다.',
    ru: 'PLEX в трюме? Очень необычная загрузка.',
    zh: '货仓里放 PLEX？这装配相当不寻常。',
  },
  'dossier.victimId': {
    en: 'ID', de: 'ID', es: 'ID', fr: 'ID', ja: 'ID', ko: 'ID', ru: 'ID', zh: 'ID',
  },
  'dossier.corporation': {
    en: 'CORP', de: 'KONZERN', es: 'CORP', fr: 'CORP', ja: '企業', ko: '코퍼레이션', ru: 'КОРП.', zh: '公司',
  },
  'dossier.alliance': {
    en: 'ALLIANCE', de: 'ALLIANZ', es: 'ALIANZA', fr: 'ALLIANCE', ja: '同盟', ko: '얼라이언스', ru: 'АЛЬЯНС', zh: '联盟',
  },
  'dossier.pilotFallback': {
    en: 'Pilot #{id}', de: 'Pilot #{id}', es: 'Piloto #{id}', fr: 'Pilote #{id}',
    ja: 'パイロット #{id}', ko: '파일럿 #{id}', ru: 'Пилот #{id}', zh: '飞行员 #{id}',
  },
  'dossier.corpFallback': {
    en: 'Corp #{id}', de: 'Konzern #{id}', es: 'Corp. #{id}', fr: 'Corp. #{id}',
    ja: '企業 #{id}', ko: '코퍼레이션 #{id}', ru: 'Корп. #{id}', zh: '公司 #{id}',
  },
  'dossier.allianceFallback': {
    en: 'Alliance #{id}', de: 'Allianz #{id}', es: 'Alianza #{id}', fr: 'Alliance #{id}',
    ja: '同盟 #{id}', ko: '얼라이언스 #{id}', ru: 'Альянс #{id}', zh: '联盟 #{id}',
  },
  'dossier.slotFighterBay': {
    en: 'FIGHTER BAY', de: 'JÄGERBAY', es: 'BAHÍA DE CAZAS', fr: 'BAIE DE CHASSEURS',
    ja: 'ファイター・ベイ', ko: '파이터 베이', ru: 'АНГАР ИСТРЕБИТЕЛЕЙ', zh: '舰载机舱',
  },
  'dossier.slotFuelBay': {
    en: 'FUEL BAY', de: 'TREIBSTOFFBAY', es: 'BAHÍA DE COMBUSTIBLE', fr: 'BAIE DE CARBURANT',
    ja: '燃料ベイ', ko: '연료 베이', ru: 'ТОПЛИВНЫЙ ОТСЕК', zh: '燃料舱',
  },
  'board.matchRate': {
    en: 'MATCH RATE', de: 'ÜBEREINSTIMMUNG', es: 'COINCIDENCIA', fr: 'CORRESPONDANCE',
    ja: '一致度', ko: '일치도', ru: 'СОВПАДЕНИЕ', zh: '匹配度',
  },
  'mode.daily': {
    en: 'DAILY', de: 'TÄGLICH', es: 'DIARIO', fr: 'QUOTIDIEN',
    ja: 'デイリー', ko: '데일리', ru: 'ЕЖЕДНЕВНО', zh: '每日',
  },
  'mode.free': {
    en: 'FREE', de: 'FREI', es: 'LIBRE', fr: 'LIBRE',
    ja: 'フリー', ko: '프리', ru: 'СВОБОДНЫЙ', zh: '自由',
  },
  'mode.archive': {
    en: 'ARCHIVE', de: 'ARCHIV', es: 'ARCHIVO', fr: 'ARCHIVES',
    ja: 'アーカイブ', ko: '아카이브', ru: 'АРХИВ', zh: '档案',
  },
  'archive.prev': {
    en: 'PREVIOUS DAY', de: 'VORTAG', es: 'DÍA ANTERIOR', fr: 'JOUR PRÉCÉDENT',
    ja: '前日', ko: '이전 날', ru: 'ПРЕДЫДУЩИЙ ДЕНЬ', zh: '前一天',
  },
  'archive.next': {
    en: 'NEXT DAY', de: 'FOLGETAG', es: 'DÍA SIGUIENTE', fr: 'JOUR SUIVANT',
    ja: '翌日', ko: '다음 날', ru: 'СЛЕДУЮЩИЙ ДЕНЬ', zh: '后一天',
  },
  'freeModal.title': {
    en: 'Free target', de: 'Freies Ziel', es: 'Objetivo libre', fr: 'Cible libre',
    ja: 'フリー目標', ko: '자유 목표', ru: 'Свободная цель', zh: '自由模式',
  },
  'freeModal.body': {
    en: 'Enter a killmail ID or a full zKillboard kill link to use as the puzzle.',
    de: 'Killmail-ID oder vollständigen zKillboard-Link eingeben. Das Ziel wird vor dem Start geprüft.',
    es: 'Introduce un ID de killmail o un enlace completo de zKillboard. El objetivo se valida antes de empezar.',
    fr: 'Entrez un ID de killmail ou un lien zKillboard complet. La cible est validée avant le départ.',
    ja: 'キルメールIDまたはzKillboardの完全なリンクを入力してください。開始前に目標を検証します。',
    ko: '킬메일 ID 또는 전체 zKillboard 링크를 입력하세요. 시작 전에 목표를 검증합니다.',
    ru: 'Введите ID киллмейла или полную ссылку zKillboard. Цель проверяется перед запуском.',
    zh: '输入击杀 ID 或完整 zKillboard 击杀链接，用来当作谜题。',
  },
  'freeModal.kbLabel': {
    en: 'Killmail ID / zKill link', de: 'Killmail-ID / zKill-Link', es: 'ID de killmail / enlace zKill',
    fr: 'ID de killmail / lien zKill', ja: 'キルメールID / zKillリンク', ko: '킬메일 ID / zKill 링크',
    ru: 'ID киллмейла / ссылка zKill', zh: '击杀 ID / zKill 链接',
  },
  'freeModal.placeholder': {
    en: '139037509 or zkillboard.com/kill/139037509/',
    de: '139037509 oder zkillboard.com/kill/139037509/',
    es: '139037509 o zkillboard.com/kill/139037509/',
    fr: '139037509 ou zkillboard.com/kill/139037509/',
    ja: '139037509 または zkillboard.com/kill/139037509/',
    ko: '139037509 또는 zkillboard.com/kill/139037509/',
    ru: '139037509 или zkillboard.com/kill/139037509/',
    zh: '139037509 或 zkillboard.com/kill/139037509/',
  },
  'freeModal.open': {
    en: 'Open free mode', de: 'Freien Modus öffnen', es: 'Abrir modo libre', fr: 'Ouvrir le mode libre',
    ja: 'フリーモードを開く', ko: '자유 모드 열기', ru: 'Открыть свободный режим', zh: '进入自由模式',
  },
  'freeModal.loading': {
    en: 'Validating…', de: 'Prüfe…', es: 'Validando…', fr: 'Validation…',
    ja: '検証中…', ko: '검증 중…', ru: 'Проверка…', zh: '验证中…',
  },
  'freeModal.invalid': {
    en: 'Enter a valid zKillboard killmail ID or link.', de: 'Gültige zKillboard-Killmail-ID oder Link eingeben.',
    es: 'Introduce un ID o enlace de killmail válido.', fr: 'Entrez un ID ou lien de killmail valide.',
    ja: '有効なzKillboardキルメールIDまたはリンクを入力してください。',
    ko: '유효한 zKillboard 킬메일 ID 또는 링크를 입력하세요.',
    ru: 'Введите корректный ID или ссылку киллмейла zKillboard.', zh: '请输入有效的 zKillboard 击杀 ID 或链接。',
  },
  'freeModal.old': {
    en: 'zKillboard has no reliable kill reports before 2012-05-22.', de: 'Vor dem 22.05.2012 gibt es keine verlässlichen Kill-Reports.',
    es: 'No hay informes fiables antes del 22/05/2012.', fr: 'Pas de rapports fiables avant le 22/05/2012.',
    ja: '2012年5月22日より前のキルレポートは信頼できません。',
    ko: '2012-05-22 이전 킬 리포트는 신뢰할 수 없습니다.',
    ru: 'До 22.05.2012 надёжных отчётов об убийствах нет.', zh: '2012-05-22 之前的击杀记录不可靠。',
  },
  'freeModal.empty': {
    en: 'Empty-hull killmails are disabled in the field manual.', de: 'Leere Hüllen sind im Handbuch deaktiviert.',
    es: 'Los cascos vacíos están desactivados en el manual.', fr: 'Les coques vides sont désactivées dans le manuel.',
    ja: '空船のキルメールはマニュアルで無効です。', ko: '빈 선체 킬메일은 매뉴얼에서 비활성화되어 있습니다.',
    ru: 'Пустые корпуса отключены в руководстве.', zh: '战地手册中已禁止空船击杀。',
  },
  'archiveModal.title': {
    en: 'Archive run', de: 'Archivlauf', es: 'Partida de archivo', fr: 'Partie archive',
    ja: 'アーカイブ実行', ko: '아카이브 실행', ru: 'Архивный запуск', zh: '档案模式',
  },
  'archiveModal.body': {
    en: 'Pick any past UTC day to replay an earlier puzzle.',
    de: 'Wähle einen beliebigen vergangenen UTC-Tag. Das Datum ist nur der Seed; die Killmail-Suche beginnt weiterhin am 22.05.2012.',
    es: 'Elige cualquier día UTC pasado. La fecha solo es la semilla; la búsqueda de killmails sigue empezando el 22/05/2012.',
    fr: 'Choisissez n’importe quel jour UTC passé. La date sert de graine ; la recherche de killmails commence toujours le 22/05/2012.',
    ja: '過去の任意のUTC日を選択。日付はシードで、キルメール検索は引き続き2012年5月22日からです。',
    ko: '과거의 모든 UTC 날짜를 선택하세요. 날짜는 시드이며 킬메일 검색은 계속 2012-05-22부터 시작합니다.',
    ru: 'Выберите любой прошедший день UTC. Дата — только seed; поиск киллмейлов по-прежнему начинается 22.05.2012.',
    zh: '选择任意过去的 UTC 日期，来游玩之前的谜题。',
  },
  'archiveModal.select': {
    en: 'Date', de: 'Datum', es: 'Fecha', fr: 'Date',
    ja: '日付', ko: '날짜', ru: 'Дата', zh: '日期',
  },
  'archiveModal.open': {
    en: 'Open archive', de: 'Archiv öffnen', es: 'Abrir archivo', fr: 'Ouvrir les archives',
    ja: 'アーカイブを開く', ko: '아카이브 열기', ru: 'Открыть архив', zh: '进入档案模式',
  },
  'archiveModal.invalid': {
    en: 'Choose a date between 2003-05-06 and today.', de: 'Datum zwischen 06.05.2003 und heute wählen.',
    es: 'Elige una fecha entre el 06/05/2003 y hoy.', fr: 'Choisissez une date entre le 06/05/2003 et aujourd’hui.',
    ja: '2003年5月6日から今日までの日付を選択してください。',
    ko: '2003-05-06부터 오늘까지의 날짜를 선택하세요.',
    ru: 'Выберите дату с 06.05.2003 по сегодня.', zh: '请选择 2003-05-06 至今天的日期。',
  },
  'manual.settingsTitle': {
    en: 'Settings', de: 'Einstellungen', es: 'Ajustes', fr: 'Réglages',
    ja: '設定', ko: '설정', ru: 'НАСТРОЙКИ', zh: '设置',
  },
  'settings.fontSize': {
    en: 'FONT SIZE', de: 'SCHRIFTGRÖSSE', es: 'TAMAÑO DE FUENTE', fr: 'TAILLE DE POLICE',
    ja: '文字サイズ', ko: '글자 크기', ru: 'РАЗМЕР ШРИФТА', zh: '字体大小',
  },
  'settings.sizeSmallest': {
    en: 'SMALLEST', de: 'MINIMAL', es: 'MÍNIMO', fr: 'MINIMALE',
    ja: '最小', ko: '최소', ru: 'МИНИМАЛЬНЫЙ', zh: '最小',
  },
  'settings.sizeSmaller': {
    en: 'SMALLER', de: 'KLEINER', es: 'MENOR', fr: 'PETITE',
    ja: '小さめ', ko: '작게', ru: 'МЕНЬШЕ', zh: '更小',
  },
  'settings.sizeLarger': {
    en: 'LARGER', de: 'GRÖSSER', es: 'MAYOR', fr: 'PLUS GRANDE',
    ja: '大きめ', ko: '크게', ru: 'БОЛЬШЕ', zh: '更大',
  },
  'settings.sizeLargest': {
    en: 'LARGEST', de: 'MAXIMAL', es: 'MÁXIMO', fr: 'MAXIMALE',
    ja: '最大', ko: '최대', ru: 'МАКСИМАЛЬНЫЙ', zh: '最大',
  },
  'settings.sizeNormal': {
    en: 'NORMAL', de: 'NORMAL', es: 'NORMAL', fr: 'NORMALE',
    ja: '標準', ko: '보통', ru: 'ОБЫЧНЫЙ', zh: '标准',
  },
  'settings.sizeLarge': {
    en: 'LARGE', de: 'GROSS', es: 'GRANDE', fr: 'GRANDE',
    ja: '大', ko: '크게', ru: 'КРУПНЫЙ', zh: '大',
  },
  'settings.sizeXLarge': {
    en: 'XL', de: 'XL', es: 'XL', fr: 'XL',
    ja: '特大', ko: '특대', ru: 'XL', zh: '特大',
  },
  'manual.emptyKb': {
    en: 'Allow empty-hull killmails', de: 'Leere Hüllen erlauben', es: 'Permitir cascos vacíos',
    fr: 'Autoriser les coques vides', ja: '空船キルメールを許可', ko: '빈 선체 킬메일 허용',
    ru: 'Разрешить пустые корпуса', zh: '允许空船击杀',
  },
  'manual.emptyKbHelp': {
    en: 'Applies when the next target is selected.', de: 'Gilt bei der nächsten Zielauswahl.',
    es: 'Se aplica al seleccionar el próximo objetivo.', fr: 'S’applique à la prochaine sélection.',
    ja: '次回の目標選択から適用されます。', ko: '다음 목표 선택부터 적용됩니다.',
    ru: 'Применяется при следующем выборе цели.', zh: '从下一次选择目标开始生效。',
  },
  'manual.emptyKbOn': {
    en: 'Empty-hull killmails enabled', de: 'Leere Hüllen aktiviert', es: 'Cascos vacíos activados',
    fr: 'Coques vides activées', ja: '空船キルメールを有効化', ko: '빈 선체 킬메일 활성화',
    ru: 'Пустые корпуса включены', zh: '已允许空船击杀',
  },
  'manual.emptyKbOff': {
    en: 'Empty-hull killmails disabled', de: 'Leere Hüllen deaktiviert', es: 'Cascos vacíos desactivados',
    fr: 'Coques vides désactivées', ja: '空船キルメールを無効化', ko: '빈 선체 킬메일 비활성화',
    ru: 'Пустые корпуса отключены', zh: '已禁止空船击杀',
  },
  'archive.noStats': {
    en: 'ARCHIVE RUN // NOT COUNTED', de: 'ARCHIV-LAUF // NICHT GEZÄHLT',
    es: 'PARTIDA DE ARCHIVO // NO CUENTA', fr: 'PARTIE ARCHIVE // NON COMPTÉE',
    ja: 'アーカイブ実行 // 集計外', ko: '아카이브 실행 // 집계 제외',
    ru: 'АРХИВНЫЙ ЗАБЕГ // НЕ УЧИТЫВАЕТСЯ', zh: '档案模式 // 不计入数据',
  },
  'dossier.victimAlt': {
    en: 'Victim portrait', de: 'Porträt des Opfers', es: 'Retrato de la víctima', fr: 'Portrait de la victime',
    ja: '被害者のポートレート', ko: '피해자 초상화', ru: 'Портрет жертвы', zh: '受害者头像',
  },
  'dossier.officer': {
    en: 'OFFICER', de: 'OFFIZIER', es: 'OFICIAL', fr: 'OFFICIER',
    ja: 'オフィサー', ko: '오피서', ru: 'ОФИЦЕР', zh: '官员',
  },
  'dossier.abyss': {
    en: 'ABYSSAL', de: 'ABGRUND', es: 'ABISAL', fr: 'ABYSSAL',
    ja: 'アビサル', ko: '어비설', ru: 'АБИССАЛЬНЫЙ', zh: '深渊',
  },
  'dossier.plex': {
    en: 'PLEX ???', de: 'PLEX ???', es: 'PLEX ???', fr: 'PLEX ???',
    ja: 'PLEX ???', ko: 'PLEX ???', ru: 'PLEX ???', zh: 'PLEX ???',
  },
});

Object.assign(RENAMES, {
  'board.title': {
    en: 'SHIP SIGNAL LOCK', de: 'SCHIFFSSIGNAL-SPERRE', es: 'BLOQUEO DE SEÑAL', fr: 'VERROUILLAGE SIGNAL',
    ja: '艦船信号ロック', ko: '함선 신호 락', ru: 'ЗАХВАТ СИГНАЛА КОРАБЛЯ', zh: '舰船信号锁定',
  },
  'board.subtitle': {
    en: 'Try to lock a ship signal, compare the profile and pull the next kill record.',
    de: 'Versuche, ein Schiffsignal zu sperren, vergleiche das Profil und hole den nächsten Kill.',
    es: 'Intenta bloquear una señal de nave, compara el perfil y obtén el siguiente registro.',
    fr: 'Tentez de verrouiller un signal de vaisseau, comparez le profil et extrayez le prochain kill.',
    ja: '艦船信号のロックを試み、プロファイルを比較して次のキル記録を取得します。',
    ko: '함선 신호 락을 시도하고 프로필을 비교해 다음 킬 기록을 가져옵니다.',
    ru: 'Попробуйте захватить сигнал корабля, сравните профиль и получите следующую запись.',
    zh: '尝试锁定舰船信号，比对轮廓并拉取下一份击杀记录。',
  },
  'board.locked': {
    en: 'SIGNAL LOCKED', de: 'SIGNAL GESPERRT', es: 'SEÑAL BLOQUEADA', fr: 'SIGNAL VERROUILLÉ',
    ja: '信号ロック済み', ko: '신호 락됨', ru: 'СИГНАЛ ЗАХВАЧЕН', zh: '信号已锁定',
  },
  'board.sealed': {
    en: 'SIGNAL UNPROBED', de: 'SIGNAL UNGEPRÜFT', es: 'SEÑAL SIN SONDEAR', fr: 'SIGNAL NON SONDÉ',
    ja: '信号未探査', ko: '신호 미탐사', ru: 'СИГНАЛ НЕ ОБСЛЕДОВАН', zh: '信号未探测',
  },
  'board.ready': {
    en: 'SIGNAL READY', de: 'SIGNAL BEREIT', es: 'SEÑAL LISTA', fr: 'SIGNAL PRÊT',
    ja: '信号待機', ko: '신호 준비', ru: 'СИГНАЛ ГОТОВ', zh: '信号待锁定',
  },
  'dossier.encrypted': {
    en: 'SIGNAL UNPROBED', de: 'SIGNAL UNGEPRÜFT', es: 'SEÑAL SIN SONDEAR', fr: 'SIGNAL NON SONDÉ',
    ja: '信号未探査', ko: '신호 미탐사', ru: 'СИГНАЛ НЕ ОБСЛЕДОВАН', zh: '信号未探测',
  },
  'dossier.decrypted': {
    en: 'SIGNAL PARSED', de: 'SIGNAL GEPARST', es: 'SEÑAL ANALIZADA', fr: 'SIGNAL ANALYSÉ',
    ja: '信号解析済み', ko: '신호 분석됨', ru: 'СИГНАЛ РАСШИФРОВАН', zh: '信号已解析',
  },
});

Object.assign(RENAMES, {
  'cat.cargo': {
    en: 'CARGO HOLD', de: 'FRACHTRAUM', es: 'BODEGA', fr: 'SOUTE',
    ja: 'カーゴホールド', ko: '화물창', ru: 'ГРУЗОВОЙ ОТСЕК', zh: '货仓',
  },
  'dossier.cargoSealed': {
    en: 'Unprobed cargo', de: 'Ungeprüfte Fracht', es: 'Carga sin sondear', fr: 'Soute non sondée',
    ja: '未探査の貨物', ko: '미탐사 화물', ru: 'Необследованный груз', zh: '未探测货仓',
  },
  'mode.timed': {
    en: 'TIMED', de: 'ZEIT', es: 'CRONO', fr: 'CHRONO',
    ja: 'タイム', ko: '타임', ru: 'НА ВРЕМЯ', zh: '计时',
  },
  'mode.timedHint': {
    en: 'An unscored alternate ruleset for Standard and Abyss.',
    de: 'Ein ungewerteter alternativer Regelsatz für Standard und Abyss.',
    es: 'Un conjunto de reglas alternativo sin puntuación para Estándar y Abismo.',
    fr: 'Une variante de règles non classée pour Standard et Abysse.',
    ja: 'スタンダードとアビスのための、スコア対象外の別ルール。',
    ko: '스탠다드와 어비스를 위한 점수 미반영 대체 규칙입니다.',
    ru: 'Альтернативные правила без очков для стандартного и безднового режимов.',
    zh: '普通与深渊模式的无计分替代规则。',
  },
  'mode.helpTimed': {
    en: 'No clues are shown before you press start.\nPressing start begins the timer, reveals the opening intel, and shows the ship input.\nAttempts are unlimited. A weighted clue is released every 30 seconds; guesses do not release clues. Each target lock has a 5-second cooldown. If every usable clue is already revealed, the next scheduled release fails the run.\nThe timed target uses a different daily killmail seed.\nCorrectly naming the ship stops the timer and settles your elapsed time.\nHold the timer button for 3 seconds to give up; the red fill marks the hold. The answer is then revealed.\nProgress is saved without affecting score or streaks; data updates and progress reset clear it.',
    de: 'Vor dem Start werden keine Hinweise gezeigt.\nStart startet den Timer, deckt die Anfangsinformationen auf und zeigt die Schiffseingabe.\nUnbegrenzte Versuche. Alle 30 Sekunden wird ein gewichteter Hinweis freigegeben; falsche Versuche geben keine Hinweise. Jede Zielerfassung hat 5 Sekunden Abklingzeit. Sind alle nutzbaren Hinweise bereits offen, scheitert der Lauf bei der nächsten Freigabe.\nDas Zeit-Ziel nutzt einen anderen täglichen Killmail-Seed.\nDie richtige Schiffsnennung stoppt den Timer und zeigt die Zeit.\nTimer 3 Sekunden halten zum Aufgeben; die rote Füllung markiert das Halten. Danach wird die Antwort gezeigt.\nFortschritt wird ohne Wertung gespeichert; Datenupdates und Zurücksetzen löschen ihn.',
    es: 'No se muestran pistas antes de empezar.\nIniciar arranca el cronómetro, revela la información inicial y muestra la entrada de nave.\nIntentos ilimitados. Cada 30 segundos se revela una pista ponderada; los intentos no revelan pistas. Cada bloqueo tiene 5 segundos de recarga. Si todas las pistas útiles ya están reveladas, el siguiente aviso hace fallar la partida.\nEl objetivo cronometrado usa otra semilla diaria de killmail.\nAcertar el nombre detiene el cronómetro y muestra el tiempo.\nMantén el botón del cronómetro 3 segundos para rendirte; el relleno rojo marca la pulsación. Después se revela la respuesta.\nEl progreso se guarda sin afectar a la puntuación ni a las rachas; las actualizaciones de datos y el reinicio lo borran.',
    fr: 'Aucun indice avant le départ.\nDémarrer lance le chrono, révèle les informations initiales et affiche la saisie du vaisseau.\nTentatives illimitées. Un indice pondéré est révélé toutes les 30 secondes ; les tentatives n’en révèlent pas. Chaque verrouillage a 5 secondes de recharge. Si tous les indices utiles sont déjà révélés, la prochaine révélation fait échouer la partie.\nLa cible chronométrée utilise une autre graine quotidienne de killmail.\nTrouver le nom arrête le chrono et affiche le temps.\nMaintenez le bouton du chrono 3 secondes pour abandonner ; le remplissage rouge marque l’appui. La réponse est alors révélée.\nLa progression est sauvegardée sans affecter le score ni les séries ; les mises à jour de données et la réinitialisation l’effacent.',
    ja: '開始前はヒントが表示されません。\n開始するとタイマーが動き、初期情報が公開され、船名入力が表示されます。\n試行は無制限です。30秒ごとに重み付きヒントが1つ公開され、推測ではヒントは公開されません。ターゲットロックごとに5秒のクールダウンがあります。有効なヒントをすべて公開済みの場合、次の公開タイミングで失敗します。\nタイム対象は通常とは異なるデイリーkillmailシードを使います。\n正しい船名でタイマーが停止し、経過時間が確定します。\nタイマーボタンを3秒長押しすると放棄できます。赤い塗りつぶしが長押しを示し、その後答えが表示されます。\n進行状況はスコアや連勝に影響せず保存されます。データ更新と進行リセットで消去されます。',
    ko: '시작 전에는 단서가 표시되지 않습니다.\n시작하면 타이머가 작동하고 초기 정보가 공개되며 함선 입력이 표시됩니다.\n시도는 무제한입니다. 30초마다 가중 단서 하나가 공개되며, 추측으로는 단서가 공개되지 않습니다. 목표 락마다 5초 쿨다운이 있습니다. 유효한 단서가 모두 공개되면 다음 공개 시점에 실패합니다.\n타임 목표는 다른 일일 킬메일 시드를 사용합니다.\n함선 이름을 맞히면 타이머가 멈추고 경과 시간이 확정됩니다.\n타이머 버튼을 3초간 길게 누르면 포기합니다. 빨간 채움이 길게 누름을 표시하며 이후 정답이 공개됩니다.\n진행 상황은 점수와 연승에 영향을 주지 않고 저장됩니다. 데이터 업데이트와 진행 초기화 시 삭제됩니다.',
    ru: 'До старта подсказки не показываются.\nСтарт запускает таймер, открывает начальные данные и показывает ввод корабля.\nПопытки не ограничены. Каждые 30 секунд открывается одна взвешенная подсказка; попытки не открывают подсказки. Каждый захват цели имеет 5 секунд перезарядки. Если все полезные подсказки уже открыты, следующий выпуск приводит к поражению.\nЦель на время использует другую ежедневную основу киллмейла.\nВерное название корабля останавливает таймер и фиксирует время.\nУдерживайте кнопку таймера 3 секунды, чтобы сдаться; красная заливка отмечает удержание, затем открывается ответ.\nПрогресс сохраняется без влияния на очки и серии; обновление данных и сброс прогресса его очищают.',
    zh: '开始前不显示任何线索。\n按下开始后启动计时、揭示初始情报并显示船名输入。\n尝试次数不限。每 30 秒揭示一条加权线索，猜错不会揭示线索。每次锁定目标有 5 秒冷却。如果所有有效线索都已揭示，下一次线索发布时自动失败。\n计时目标使用不同的每日击杀种子。\n猜中船名后停止计时并结算用时。\n长按计时器按钮 3 秒可放弃；红色填充表示长按进度，结束后显示答案。\n进度会保存，但不计分、不影响连胜；数据更新和重置进度会清空计时进度。',
  },
  'timed.start': {
    en: 'START TIMED RUN', de: 'ZEITLAUF STARTEN', es: 'INICIAR CRONO', fr: 'LANCER LE CHRONO',
    ja: 'タイム計測を開始', ko: '타임 런 시작', ru: 'НАЧАТЬ ЗАБЕГ', zh: '开始计时',
  },
  'timed.startHint': {
    en: 'No clues until you start. Unlimited attempts, timer runs until you lock the ship.',
    de: 'Keine Hinweise vor dem Start. Unbegrenzte Versuche, die Zeit läuft bis zum Lock.',
    es: 'Sin pistas hasta empezar. Intentos ilimitados; el crono corre hasta bloquear la nave.',
    fr: 'Aucun indice avant le départ. Tentatives illimitées, le chrono tourne jusqu’au verrouillage.',
    ja: '開始までヒントなし。試行は無制限、艦船をロックするまで計測。',
    ko: '시작 전에는 단서가 없습니다. 시도는 무제한이며 함선을 락할 때까지 시간이 흐릅니다.',
    ru: 'До старта подсказок нет. Попытки не ограничены, таймер идёт до захвата корабля.',
    zh: '开始前没有任何线索。可无限次尝试，计时直到锁定舰船。',
  },
  'timed.label': {
    en: 'TIME', de: 'ZEIT', es: 'TIEMPO', fr: 'TEMPS',
    ja: 'タイム', ko: '시간', ru: 'ВРЕМЯ', zh: '用时',
  },
  'timed.hold': {
    en: 'Hold to give up and reveal the answer', de: 'Halten zum Aufgeben und Auflösen',
    es: 'Mantén para rendirte y revelar la respuesta', fr: 'Maintenez pour abandonner et révéler',
    ja: '長押しで放棄して答えを表示', ko: '길게 눌러 포기하고 정답 표시',
    ru: 'Удерживайте, чтобы сдаться и увидеть ответ', zh: '长按放弃并显示答案',
  },
  'timed.holdShort': {
    en: 'HOLD TO GIVE UP', de: 'HALTEN ZUM AUFGEBEN', es: 'MANTÉN PARA RENDIRTE', fr: 'MAINTENIR POUR ABANDONNER',
    ja: '長押しで放棄', ko: '길게 눌러 포기', ru: 'УДЕРЖИВАТЬ — СДАТЬСЯ', zh: '长按放弃',
  },
  'timed.time': {
    en: 'TIME', de: 'ZEIT', es: 'TIEMPO', fr: 'TEMPS',
    ja: 'タイム', ko: '시간', ru: 'ВРЕМЯ', zh: '用时',
  },
  'timed.winKicker': {
    en: 'TIMED SIGNAL LOCK', de: 'ZEITLAUF-SIGNALSPERRE', es: 'BLOQUEO CRONO', fr: 'VERROU CHRONO',
    ja: 'タイム・シグナルロック', ko: '타임 신호 락', ru: 'ЗАХВАТ НА ВРЕМЯ', zh: '计时信号锁定',
  },
  'timed.winTitle': {
    en: 'SIGNAL LOCKED', de: 'SIGNAL GESPERRT', es: 'SEÑAL BLOQUEADA', fr: 'SIGNAL VERROUILLÉ',
    ja: '信号ロック完了', ko: '신호 락 완료', ru: 'СИГНАЛ ЗАХВАЧЕН', zh: '信号已锁定',
  },
  'timed.winBody': {
    en: 'Timed signal locked. Target identity resolved: {name}.',
    de: 'Zeitsignal gesperrt. Ziel identifiziert: {name}.',
    es: 'Señal cronometrada bloqueada. Identidad resuelta: {name}.',
    fr: 'Signal chronométré verrouillé. Identité résolue : {name}.',
    ja: 'タイム信号ロック完了。目標識別：{name}。',
    ko: '타임 신호 락 완료. 목표 신원 확인: {name}.',
    ru: 'Сигнал захвачен на время. Цель опознана: {name}.',
    zh: '计时信号锁定完成，目标身份已解析：{name}。',
  },
  'timed.failKicker': {
    en: 'TIMED INTEL EXHAUSTED', de: 'ZEIT-INTEL ERSCHÖPFT', es: 'INTEL CRONO AGOTADA', fr: 'RENSEIGNEMENTS ÉPUISÉS',
    ja: 'タイム情報を使い切り', ko: '타임 정보 소진', ru: 'ВРЕМЯ И ИНФОРМАЦИЯ ИСЧЕРПАНЫ', zh: '计时情报耗尽',
  },
  'timed.failTitle': {
    en: 'SIGNAL LOST', de: 'SIGNAL VERLOREN', es: 'SEÑAL PERDIDA', fr: 'SIGNAL PERDU',
    ja: '信号喪失', ko: '신호 상실', ru: 'СИГНАЛ ПОТЕРЯН', zh: '信号丢失',
  },
  'timed.failBody': {
    en: 'All intel was revealed and no more will arrive. The target remains unidentified: {name}.',
    de: 'Alle Informationen wurden aufgedeckt. Das Ziel bleibt unidentifiziert: {name}.',
    es: 'Se reveló toda la información y no llegará más. El objetivo sigue sin identificar: {name}.',
    fr: 'Tous les renseignements ont été révélés. La cible reste non identifiée : {name}.',
    ja: 'すべての情報が公開され、追加はありません。目標は未識別のままです：{name}。',
    ko: '모든 정보가 공개되었고 더 이상 제공되지 않습니다. 목표는 미확인 상태입니다: {name}.',
    ru: 'Вся информация раскрыта, новых данных не будет. Цель не опознана: {name}.',
    zh: '所有情报均已揭示，不会再有新线索。目标仍未识别：{name}。',
  },
  'timed.giveUpKicker': {
    en: 'TIMED RUN ABANDONED', de: 'ZEITLAUF AUFGEGEBEN', es: 'CRONO ABANDONADO', fr: 'CHRONO ABANDONNÉ',
    ja: 'タイム計測を放棄', ko: '타임 런 포기', ru: 'ЗАБЕГ ПРЕРВАН', zh: '计时中止',
  },
  'timed.giveUpTitle': {
    en: 'SIGNAL RELEASED', de: 'SIGNAL FREIGEGEBEN', es: 'SEÑAL LIBERADA', fr: 'SIGNAL LIBÉRÉ',
    ja: '信号を解放', ko: '신호 해제', ru: 'СИГНАЛ ОТПУЩЕН', zh: '信号已释放',
  },
  'timed.giveUpBody': {
    en: 'You gave up the timed lock. The target was {name}.',
    de: 'Du hast die Zeitsperre aufgegeben. Das Ziel war {name}.',
    es: 'Abandonaste el bloqueo cronometrado. El objetivo era {name}.',
    fr: 'Vous avez abandonné le verrou chronométré. La cible était {name}.',
    ja: 'タイムロックを放棄しました。目標は {name} でした。',
    ko: '타임 락을 포기했습니다. 목표는 {name}였습니다.',
    ru: 'Вы отказались от захвата на время. Целью был {name}.',
    zh: '你放弃了计时锁定。目标是 {name}。',
  },
  'share.freeTitle': {
    en: 'FITDLE — Free target', de: 'FITDLE — Freies Ziel', es: 'FITDLE — Objetivo libre', fr: 'FITDLE — Cible libre',
    ja: 'FITDLE — フリー目標', ko: 'FITDLE — 자유 목표', ru: 'FITDLE — Свободная цель', zh: 'FITDLE — 自由目标',
  },
  'share.freeDescription': {
    en: 'A free FITDLE puzzle from a specific killmail. Open the link and identify the hull.',
    de: 'Ein freies FITDLE-Rätsel aus einem bestimmten Killmail. Öffne den Link und identifiziere die Hülle.',
    es: 'Un puzzle libre de FITDLE a partir de un killmail concreto. Abre el enlace e identifica el casco.',
    fr: 'Un puzzle FITDLE libre issu d’un killmail précis. Ouvrez le lien et identifiez la coque.',
    ja: '特定のキルメールから作られたFITDLEのフリーパズル。リンクを開いて船体を特定しよう。',
    ko: '특정 킬메일로 만든 FITDLE 자유 퍼즐. 링크를 열고 선체를 맞혀 보세요.',
    ru: 'Свободная головоломка FITDLE по конкретному киллмейлу. Откройте ссылку и определите корпус.',
    zh: '来自特定击杀邮件的 FITDLE 自由谜题。打开链接并识别船体。',
  },
  'share.timedTitle': {
    en: 'FITDLE — Timed signal run', de: 'FITDLE — Zeitlauf', es: 'FITDLE — Crono', fr: 'FITDLE — Chrono',
    ja: 'FITDLE — タイム計測', ko: 'FITDLE — 타임 런', ru: 'FITDLE — Забег на время', zh: 'FITDLE — 计时挑战',
  },
  'share.timedDescription': {
    en: 'A timed FITDLE run. Open the puzzle and try to beat the clock.',
    de: 'Ein FITDLE-Zeitlauf. Öffne das Rätsel und schlage die Uhr.',
    es: 'Una partida cronometrada de FITDLE. Abre el puzzle e intenta batir el reloj.',
    fr: 'Une partie chronométrée de FITDLE. Ouvrez le puzzle et battez le chrono.',
    ja: 'FITDLEのタイム計測。パズルを開いてタイムに挑戦。',
    ko: 'FITDLE 타임 런. 퍼즐을 열고 기록에 도전하세요.',
    ru: 'Забег FITDLE на время. Откройте головоломку и побейте таймер.',
    zh: 'FITDLE 计时挑战。打开谜题，尝试刷新用时。',
  },
});


Object.assign(RENAMES, {
  'mode.standardHint': {
    en: `Six attempts. Misses reveal fitted equipment; matches reveal shared values.`,
    de: `Sechs Versuche. Fehlversuche zeigen montierte Ausrüstung; Treffer zeigen gemeinsame Werte.`,
    es: `Seis intentos. Los fallos revelan equipo montado; los aciertos, valores compartidos.`,
    fr: `Six tentatives. Les erreurs révèlent l’équipement monté ; les correspondances, les valeurs partagées.`,
    ja: `6回の挑戦。誤答で装備、一致で共通値を公開。`,
    ko: `6회 시도. 오답은 장착 장비, 일치는 공통 값을 공개.`,
    ru: `Шесть попыток. Промахи раскрывают установленное оборудование, совпадения — общие значения.`,
    zh: `六次尝试。猜错揭示已装配装备，猜中揭示共同数值。`,
  },
  'mode.abyssHint': {
    en: `Six attempts. Simulated all-V fittings, rarer hulls, larger reveal steps.`,
    de: `Sechs Versuche. Simulierte All-V-Fittings, seltenere Hüllen, größere Schritte.`,
    es: `Seis intentos. Ajustes simulados a V, cascos más raros, revelaciones mayores.`,
    fr: `Six tentatives. Fittings simulés au niveau V, coques plus rares, révélations plus larges.`,
    ja: `6回の挑戦。全スキルVの装備シミュレーション、希少船体、より大きな開示。`,
    ko: `6회 시도. 올 V 장비 시뮬레이션, 희귀 선체, 더 큰 공개 단위.`,
    ru: `Шесть попыток. Симуляция фитинга на все V, редкие корпуса, больше подсказок.`,
    zh: `六次尝试。全 V 技能模拟装配、稀有船体、更大揭示步长。`,
  },
  'mode.timedHint': {
    en: `Timed gameplay. Uses the selected Daily or Free source; with Daily it has its own daily target. Unlimited attempts against the clock; no six-attempt score.`,
    de: `Timed-Spielweise. Nutzt die gewählte Daily- oder Free-Quelle; bei Daily mit eigenem Tagesziel. Unbegrenzte Versuche gegen die Uhr; keine Sechs-Versuche-Wertung.`,
    es: `Modalidad Crono. Usa la fuente Diaria o Libre seleccionada; con Diaria tiene su propio objetivo diario. Intentos ilimitados contra el reloj; sin puntuación de seis intentos.`,
    fr: `Mode Chrono. Utilise la source Quotidien ou Libre sélectionnée ; en Quotidien, il a sa propre cible quotidienne. Tentatives illimitées contre le chrono ; sans score à six tentatives.`,
    ja: `タイムド玩法。選択中のデイリーまたはフリーの目標ソースに従い、デイリー時は専用のデイリー目標を使います。時間制限付きで試行は無制限、6回制のスコアはありません。`,
    ko: `타임드 플레이. 선택한 데일리 또는 자유 목표 소스를 따르며, 데일리에서는 전용 일일 목표를 사용합니다. 시간 제한과 무제한 시도, 6회 점수는 없습니다.`,
    ru: `Режим Timed. Использует выбранный источник Daily или Free; в Daily — отдельную дневную цель. Неограниченные попытки на время; без счёта по шести попыткам.`,
    zh: `计时玩法。目标来源遵循当前选择的每日或自由模式；选择每日时使用独立的每日目标。无限尝试，与时间赛跑；不使用六次机会成绩。`,
  },
  'mode.freeHint': {
    en: `Play a chosen killboard or roll a random one. A chosen kill that matches today's Daily target opens Daily; otherwise it stays Free and unscored. Only random refresh builds the separate Free streak.`,
    de: `Spiele ein gewähltes oder zufälliges Killboard. Ein gewählter Kill, der dem heutigen Daily-Ziel entspricht, öffnet Daily; sonst bleibt er Free und ohne Wertung. Nur der Zufalls-Refresh baut die separate Free-Serie auf.`,
    es: `Juega un killboard elegido o uno aleatorio. Si el kill elegido coincide con el objetivo diario de hoy, abre Diaria; si no, sigue en Libre y sin puntuación. Solo la actualización aleatoria construye la racha libre separada.`,
    fr: `Jouez un killboard choisi ou aléatoire. Un kill choisi qui correspond à la cible quotidienne ouvre Quotidien ; sinon il reste en Libre, non classé. Seul le rafraîchissement aléatoire alimente la série libre distincte.`,
    ja: `指定またはランダムなキルボードで遊べます。選んだキルが今日のデイリー目標と一致すればデイリーを開き、それ以外はフリーのまま採点外です。フリーの独立した連勝はランダム更新のみで増えます。`,
    ko: `지정 또는 무작위 킬보드로 플레이합니다. 선택한 킬이 오늘의 데일리 목표와 일치하면 데일리가 열리고, 아니면 자유 모드로 남아 점수에 반영되지 않습니다. 자유 모드의 별도 연승은 무작위 새로고침으로만 쌓입니다.`,
    ru: `Играйте выбранный или случайный киллборд. Если выбранный килл совпадает с сегодняшней целью Daily, откроется Daily; иначе останется Free без оценки. Отдельная серия Free растёт только при случайном обновлении.`,
    zh: `游玩指定击杀，或随机刷新一个目标。若指定击杀与今日每日目标一致，会进入每日模式；否则保持自由模式且不计分。自由模式的独立连胜只通过随机刷新累积。`,
  },
  'help.step1': {
    en: `Each UTC day has one target. Standard and Abyss give six attempts; Timed is unlimited.`,
    de: `Jeder UTC-Tag hat ein Ziel. Standard und Abyss geben sechs Versuche; Timed ist unbegrenzt.`,
    es: `Cada día UTC tiene un objetivo. Estándar y Abismo dan seis intentos; Crono es ilimitado.`,
    fr: `Chaque jour UTC a une cible. Standard et Abysse donnent six tentatives ; Chrono est illimité.`,
    ja: `UTCごとに1つの目標。スタンダードとアビスは6回、タイムは無制限です。`,
    ko: `UTC 기준 하루에 목표 하나. 스탠다드와 어비스는 6회, 타임은 무제한입니다.`,
    ru: `На каждый день UTC — одна цель. В стандартном и бездновом режимах шесть попыток, на время — без ограничений.`,
    zh: `每个 UTC 日一个目标。普通和深渊有六次尝试；计时模式不限次数。`,
  },
  'help.step2': {
    en: `Search by ship name, race, hull class or abbreviation in any supported language.`,
    de: `Suche nach Schiffsname, Rasse, Hüllenklasse oder Abkürzung in jeder unterstützten Sprache.`,
    es: `Busca por nombre, raza, clase de casco o abreviatura en cualquier idioma compatible.`,
    fr: `Cherchez par nom, race, classe de coque ou abréviation dans toute langue prise en charge.`,
    ja: `船名、種族、船体クラス、略称で検索できます。対応言語はすべて利用可能です。`,
    ko: `함선 이름, 종족, 선체 등급, 약어로 검색할 수 있습니다. 모든 지원 언어를 사용할 수 있습니다.`,
    ru: `Ищите по названию, расе, классу корпуса или аббревиатуре на любом поддерживаемом языке.`,
    zh: `按船名、种族、舰船类别或缩写搜索，支持所有官方语言。`,
  },
  'help.step3': {
    en: `Read the dossier and use the revealed intel to identify the hull.`,
    de: `Lies das Dossier und nutze die aufgedeckten Infos, um die Hülle zu identifizieren.`,
    es: `Lee el dossier y usa la información revelada para identificar el casco.`,
    fr: `Lisez le dossier et utilisez les informations révélées pour identifier la coque.`,
    ja: `ドシエを読み、公開された情報から船体を特定します。`,
    ko: `문서를 읽고 공개된 정보로 선체를 식별하세요.`,
    ru: `Читайте досье и используйте раскрытые данные, чтобы определить корпус.`,
    zh: `读取击杀档案，利用已揭示的情报识别船体。`,
  },
  'help.step4': {
    en: `Share your result without revealing the answer.`,
    de: `Teile dein Ergebnis, ohne die Antwort zu verraten.`,
    es: `Comparte tu resultado sin revelar la respuesta.`,
    fr: `Partagez votre résultat sans révéler la réponse.`,
    ja: `答えを明かさずに結果を共有できます。`,
    ko: `정답을 공개하지 않고 결과를 공유하세요.`,
    ru: `Делитесь результатом, не раскрывая ответ.`,
    zh: `分享结果，但不要剧透答案。`,
  },
  'help.sharedRules': {
    en: `One target per UTC day; reset at 11:00 UTC.
Standard and Abyss: six attempts.
Timed: unlimited attempts.
Free and Timed runs do not affect score or streaks.`,
    de: `Ein Ziel pro UTC-Tag; Reset um 11:00 UTC.
Standard und Abyss: sechs Versuche.
Timed: unbegrenzte Versuche.
Freies Spiel und Timed beeinflussen weder Wertung noch Serie.`,
    es: `Un objetivo por día UTC; reinicio a las 11:00 UTC.
Estándar y Abismo: seis intentos.
Crono: intentos ilimitados.
Libre y Crono no afectan a la puntuación ni a las rachas.`,
    fr: `Une cible par jour UTC ; réinitialisation à 11:00 UTC.
Standard et Abysse : six tentatives.
Chrono : tentatives illimitées.
Libre et Chrono n’affectent ni le score ni les séries.`,
    ja: `UTCごとに目標は1つ。11:00 UTCにリセット。
スタンダードとアビスは6回、タイムは無制限。
フリーとタイムはスコアや連勝に影響しません。`,
    ko: `UTC 기준 하루에 목표 하나. 11:00 UTC 초기화.
스탠다드와 어비스는 6회, 타임은 무제한.
자유와 타임은 점수와 연승에 영향을 주지 않습니다.`,
    ru: `Одна цель на день UTC; сброс в 11:00 UTC.
Стандарт и Бездна: шесть попыток.
На время: без ограничений.
Свободная игра и режим на время не влияют на очки и серии.`,
    zh: `每个 UTC 日一个目标，11:00 UTC 重置。
普通和深渊：六次尝试。
计时：无限次尝试。
自由和计时模式不计分、不影响连胜。`,
  },
  'mode.helpNormal': {
    en: `Six attempts.
Opening clues are revealed when the puzzle starts.
Each miss reveals fitted equipment from a weight budget; low-weight items appear first, heavier items consume more of the budget.
Other clues are revealed only when your guess shares the target's value.
Hull bonuses and cargo have their own clues.
Structure resists are always shown and do not narrow the hull.`,
    de: `Sechs Versuche.
Start-Hinweise werden zu Beginn aufgedeckt.
Jeder Fehlversuch deckt montierte Ausrüstung aus einem Gewichtsbudget auf; leichte Hinweise erscheinen zuerst, schwerere verbrauchen mehr Budget.
Andere Hinweise erscheinen nur bei einem zum Ziel passenden Wert.
Hüllen-Boni und Fracht haben eigene Hinweise.
Strukturresistenzen sind immer sichtbar und grenzen die Hülle nicht ein.`,
    es: `Seis intentos.
Las pistas iniciales se revelan al empezar.
Cada fallo revela equipo montado según un presupuesto de peso; las pistas ligeras aparecen primero y las pesadas consumen más presupuesto.
Otras pistas solo aparecen si tu nave comparte el valor del objetivo.
Los bonos de casco y la carga tienen sus propias pistas.
Las resistencias de estructura siempre se muestran y no reducen el casco.`,
    fr: `Six tentatives.
Les indices initiaux sont révélés au départ.
Chaque erreur révèle l’équipement monté selon un budget de poids ; les indices légers apparaissent d’abord, les plus lourds consomment plus de budget.
Les autres indices n’apparaissent que si votre vaisseau partage la valeur de la cible.
Les bonus de coque et la soute ont leurs propres indices.
Les résistances de structure sont toujours visibles et ne réduisent pas la coque.`,
    ja: `6回の挑戦。
開始時に初期ヒントが公開されます。
誤答ごとに、重量予算の範囲で装着装備を公開。軽いヒントが先に出て、重いヒントほど予算を多く使います。
その他のヒントは推測船が目標と同じ値のときだけ公開。
船体ボーナスと貨物には専用のヒントがあります。
構造レジストは常に表示され、船体を絞り込みません。`,
    ko: `6회 시도.
시작 시 초기 단서가 공개됩니다.
오답마다 무게 예산 범위에서 장착 장비를 공개합니다. 가벼운 단서가 먼저 나오고, 무거운 단서일수록 예산을 더 씁니다.
다른 단서는 추측 선체가 목표와 같은 값을 가질 때만 공개됩니다.
선체 보너스와 화물은 별도 단서가 있습니다.
구조 저항은 항상 표시되며 선체 범위를 좁히지 않습니다.`,
    ru: `Шесть попыток.
Начальные подсказки открываются при старте.
Каждый промах раскрывает установленное оборудование в рамках бюджета веса: лёгкие подсказки идут первыми, тяжёлые расходуют больше бюджета.
Остальные подсказки — только при совпадении значения с целью.
У бонусов корпуса и груза свои подсказки.
Сопротивления структуры видны всегда и не сужают выбор корпуса.`,
    zh: `六次尝试。
开局展示初始线索。
每次猜错会按权重预算揭示已装配装备；低权重先出现，高权重消耗更多预算。
其他线索只在猜测与目标数值相同时揭示。
船体加成和货仓有独立线索。
结构抗性始终显示，但不会缩小船体范围。`,
  },
  'mode.helpAbyss': {
    en: `Six attempts.
Fittings and navigation/defense are simulated with all-V skills; fitted modules are online and active.
Rare and low-usage hulls are more likely.
Each miss reveals 1–5 equipment clues plus one other clue. If equipment runs out, half of the missing equipment quota (rounded up) becomes extra other clues.
Cargo has its own clues.
Abyssal modules use the closest same-group, same-size representative for attribute simulation.
Resistance modules and Assault Damage Control can make resistance clues decisive.`,
    de: `Sechs Versuche.
Fittings sowie Navigation/Verteidigung werden mit All-V-Skills simuliert; montierte Module sind online und aktiv.
Seltene und wenig genutzte Hüllen sind wahrscheinlicher.
Jeder Fehlversuch deckt 1–5 Ausrüstungshinweise plus einen weiteren Hinweis auf. Fehlt Ausrüstung, wird die Hälfte (aufgerundet) des fehlenden Ausrüstungsanteils zu zusätzlichen anderen Hinweisen.
Fracht hat eigene Hinweise.
Abyssale Module nutzen für die Attributssimulation den nächstgelegenen Vertreter derselben Gruppe und Größe.
Resistenzmodule und Assault Damage Control können Resistenzhinweise entscheidend machen.`,
    es: `Seis intentos.
Los ajustes y la navegación/defensa se simulan con habilidades a V; los módulos montados están online y activos.
Los cascos raros y poco usados son más probables.
Cada fallo revela 1–5 pistas de equipo y una pista adicional. Si falta equipo, la mitad (redondeada hacia arriba) del cupo faltante se convierte en pistas adicionales de otro tipo.
La carga tiene sus propias pistas.
Los módulos abisales usan el representante más cercano del mismo grupo y tamaño para simular atributos.
Los módulos de resistencia y el Assault Damage Control pueden hacer decisivas las pistas de resistencia.`,
    fr: `Six tentatives.
Les fittings et la navigation/défense sont simulés avec toutes les compétences au niveau V ; les modules montés sont en ligne et actifs.
Les coques rares et peu utilisées sont plus probables.
Chaque erreur révèle 1 à 5 indices d’équipement et un autre indice. Si l’équipement manque, la moitié (arrondie au supérieur) du quota manquant devient des indices supplémentaires d’un autre type.
La soute a ses propres indices.
Les modules abyssaux utilisent le représentant le plus proche du même groupe et de même taille pour simuler les attributs.
Les modules de résistance et l’Assault Damage Control peuvent rendre les indices de résistance décisifs.`,
    ja: `6回の挑戦。
装備と航行・防御は全スキルVでシミュレーションされ、装着モジュールはオンライン・アクティブとして扱われます。
希少で使用頻度の低い船体が出やすくなります。
誤答ごとに装備ヒント1～5個と、その他のヒント1個を公開。装備が足りない場合、不足分の半分（切り上げ）が追加のその他ヒントになります。
貨物には専用のヒントがあります。
アビサルモジュールは、同グループ・同サイズの最も近い代表モジュールで属性をシミュレーションします。
レジストモジュールとアサルト・ダメージコントロールは、レジストヒントを決定的にすることがあります。`,
    ko: `6회 시도.
장비와 항법/방어는 모든 스킬 V로 시뮬레이션되며, 장착 모듈은 온라인·활성 상태로 처리됩니다.
희귀하고 사용 빈도가 낮은 선체가 더 자주 나옵니다.
오답마다 장비 단서 1~5개와 다른 단서 1개를 공개합니다. 장비가 부족하면 부족분의 절반(올림)이 추가 다른 단서로 바뀝니다.
화물은 별도 단서가 있습니다.
어비설 모듈은 같은 그룹·같은 크기의 가장 가까운 대표 모듈로 속성을 시뮬레이션합니다.
저항 모듈과 어설트 대미지 컨트롤은 저항 단서를 결정적으로 만들 수 있습니다.`,
    ru: `Шесть попыток.
Фитинг, навигация и защита моделируются со всеми навыками V; установленные модули считаются онлайн и активными.
Редкие и редко используемые корпуса встречаются чаще.
Каждый промах раскрывает 1–5 подсказок об оборудовании и ещё одну подсказку. Если оборудования не хватает, половина (с округлением вверх) недостающей квоты становится дополнительными подсказками другого типа.
У груза свои подсказки.
Абиссальные модули для расчёта атрибутов заменяются ближайшим представителем той же группы и размера.
Модули сопротивления и Assault Damage Control могут сделать подсказки о сопротивлениях решающими.`,
    zh: `六次尝试。
按全 V 技能模拟装配与导航/防御；已装配模块视为在线并激活。
稀有和低使用率船体更容易出现。
每次猜错揭示 1–5 条装备线索，并额外揭示一条其他线索。装备线索不足时，缺口的一半（向上取整）转为额外的其他线索。
货仓有独立线索。
深渊装备在属性模拟时使用同组、同尺寸中最接近的代表模块。
抗性装备和突击损控可能让抗性线索成为决定性线索。`,
  },
  'mode.helpTimed': {
    en: `Unlimited attempts.
Opening clues are revealed when you start.
Wrong guesses do not reveal clues.
One clue is revealed every 30 seconds.
A 5-second cooldown follows every lock.
If all clues are already revealed, the next release fails the run. If fewer clues remain than the next batch, release all of them and fail only on the following release.
Hold the timer for 3 seconds to give up and reveal the answer.
Progress is saved; Timed does not use the six-attempt score.`,
    de: `Unbegrenzte Versuche.
Start-Hinweise werden beim Start aufgedeckt.
Falsche Versuche geben keine Hinweise.
Alle 30 Sekunden wird ein Hinweis aufgedeckt.
Nach jeder Zielerfassung folgen 5 Sekunden Abklingzeit.
Sind alle Hinweise bereits offen, scheitert der Lauf bei der nächsten Freigabe. Sind weniger Hinweise übrig als das nächste Paket, werden alle freigegeben; der Lauf scheitert erst bei der darauffolgenden Freigabe.
Timer 3 Sekunden halten, um aufzugeben und die Antwort zu sehen.
Fortschritt wird gespeichert; Timed nutzt keine Sechs-Versuche-Wertung.`,
    es: `Intentos ilimitados.
Las pistas iniciales se revelan al empezar.
Los fallos no revelan pistas.
Cada 30 segundos se revela una pista.
Tras cada bloqueo hay 5 segundos de recarga.
Si todas las pistas ya están reveladas, la siguiente entrega hace fallar la partida. Si quedan menos pistas que el siguiente lote, se revelan todas y la partida falla solo en la entrega siguiente.
Mantén el cronómetro 3 segundos para rendirte y ver la respuesta.
El progreso se guarda; Crono no usa la puntuación de seis intentos.`,
    fr: `Tentatives illimitées.
Les indices initiaux sont révélés au départ.
Les erreurs ne révèlent pas d’indices.
Un indice est révélé toutes les 30 secondes.
Chaque verrouillage impose 5 secondes de recharge.
Si tous les indices sont déjà révélés, la révélation suivante fait échouer la partie. S’il reste moins d’indices que le prochain lot, ils sont tous révélés et la partie n’échoue qu’à la révélation suivante.
Maintenez le chrono 3 secondes pour abandonner et voir la réponse.
La progression est sauvegardée ; Chrono n’utilise pas le score à six tentatives.`,
    ja: `試行は無制限。
開始時に初期ヒントが公開されます。
誤答ではヒントは公開されません。
30秒ごとにヒントが1つ公開されます。
ターゲットロックごとに5秒のクールダウン。
すべてのヒントが公開済みだと、次の公開タイミングで失敗します。
タイマーを3秒長押しすると放棄し、答えが表示されます。
進行状況は保存されますが、スコア対象外です。`,
    ko: `시도는 무제한입니다.
시작 시 초기 단서가 공개됩니다.
오답으로는 단서가 공개되지 않습니다.
30초마다 단서 하나가 공개됩니다.
목표 락마다 5초 쿨다운이 있습니다.
모든 단서가 공개되면 다음 공개 시점에 실패합니다.
타이머를 3초 길게 누르면 포기하고 정답이 표시됩니다.
진행 상황은 저장되지만 점수에는 반영되지 않습니다.`,
    ru: `Попытки не ограничены.
Начальные подсказки открываются при старте.
Промахи не открывают подсказки.
Каждые 30 секунд открывается одна подсказка.
После каждого захвата — 5 секунд перезарядки.
Если все подсказки открыты, следующий выпуск приводит к поражению.
Удерживайте таймер 3 секунды, чтобы сдаться и увидеть ответ.
Прогресс сохраняется, но очки не начисляются.`,
    zh: `无限次尝试。
开始计时时展示该模式的初始线索。
猜错不会揭示线索。
每 30 秒揭示一条线索。
每次锁定目标后有 5 秒冷却。
所有线索都已揭示后，下一次线索发布时自动失败。
长按计时器 3 秒可放弃并显示答案。
进度会保存，但不使用六次机会成绩。`,
  },
  'mode.helpFree': {
    en: `Open a shared killboard link or refresh for a random target.
A chosen kill that matches today's Daily target opens Daily; otherwise it stays Free.
You can paste a killmail ID or zKill link.
Free runs do not affect daily stats. Only the random refresh builds the separate per-gameplay Free streak; direct links and shares do not.
A loss or abandoned round resets that Free streak.`,
    de: `Öffne einen geteilten Killboard-Link oder lade ein zufälliges Ziel neu.
Ein gewählter Kill, der dem heutigen Daily-Ziel entspricht, öffnet Daily; sonst bleibt er Free.
Du kannst eine Killmail-ID oder einen zKill-Link einfügen.
Free beeinflusst die Tagesstatistik nicht. Nur der Zufalls-Refresh baut die separate Free-Serie pro Spielweise auf; direkte Links und Shares nicht.
Ein Verlust oder eine abgebrochene Runde setzt diese Free-Serie zurück.`,
    es: `Abre un enlace de killboard compartido o recarga un objetivo aleatorio.
Si el kill elegido coincide con el objetivo diario de hoy, abre Diaria; si no, sigue en Libre.
Puedes pegar un ID de killmail o un enlace de zKill.
Libre no afecta a las estadísticas diarias. Solo la actualización aleatoria construye la racha libre por modalidad; los enlaces directos y compartidos no.
Una derrota o ronda abandonada reinicia esa racha libre.`,
    fr: `Ouvrez un lien de killboard partagé ou rechargez une cible aléatoire.
Un kill choisi qui correspond à la cible quotidienne ouvre Quotidien ; sinon il reste en Libre.
Vous pouvez coller un ID de killmail ou un lien zKill.
Libre n’affecte pas les stats quotidiennes. Seul le rafraîchissement aléatoire alimente la série libre par mode ; les liens directs et partagés non.
Une défaite ou une manche abandonnée réinitialise cette série libre.`,
    ja: `共有されたキルボードリンクを開くか、ランダム目標に更新できます。
選んだキルが今日のデイリー目標と一致すればデイリーを開き、それ以外はフリーのままです。
キルメールIDまたはzKillリンクを貼り付けられます。
フリーはデイリー統計に影響しません。モード別の独立したフリー連勝はランダム更新のみで増え、直接リンクや共有リンクでは増えません。
敗北または途中放棄でそのフリー連勝はリセットされます。`,
    ko: `공유된 킬보드 링크를 열거나 무작위 목표로 새로고침하세요.
선택한 킬이 오늘의 데일리 목표와 일치하면 데일리가 열리고, 아니면 자유 모드로 남습니다.
킬메일 ID 또는 zKill 링크를 붙여넣을 수 있습니다.
자유 모드는 일일 통계에 영향을 주지 않습니다. 모드별 별도 자유 연승은 무작위 새로고침으로만 쌓이며, 직접 링크와 공유 링크는 해당되지 않습니다.
패배하거나 진행 중인 판을 포기하면 해당 자유 연승이 초기화됩니다.`,
    ru: `Откройте общую ссылку на киллборд или обновите случайную цель.
Если выбранный килл совпадает с сегодняшней целью Daily, откроется Daily; иначе останется Free.
Можно вставить ID киллмейла или ссылку zKill.
Free не влияет на ежедневную статистику. Отдельная серия Free для каждой игровой моды растёт только при случайном обновлении; прямые и общие ссылки — нет.
Поражение или брошенный раунд сбрасывают эту серию Free.`,
    zh: `打开分享的击杀链接，或刷新随机目标。
若指定击杀与今日每日目标一致，会进入每日模式；否则保持自由模式。
可以粘贴击杀 ID 或 zKill 链接。
自由模式不影响每日统计。各玩法的独立自由连胜只通过随机刷新累积；直接链接和分享链接不会。
失败或中途放弃会重置对应的自由连胜。`,
  },
  'help.weightBody': {
    en: `Weight shows how strongly a clue narrows the hull. Low means many hulls fit; high means few.`,
    de: `Das Gewicht zeigt, wie stark ein Hinweis die Hülle eingrenzt. Niedrig = viele passen, hoch = wenige.`,
    es: `El peso indica cuánto reduce el casco una pista. Bajo = muchos encajan; alto = pocos.`,
    fr: `Le poids indique à quel point un indice réduit la coque. Faible = beaucoup ; élevé = peu.`,
    ja: `重量はヒントが船体をどれだけ絞るかを示します。低い＝多くの船が該当、高い＝少数。`,
    ko: `가중치는 단서가 선체를 얼마나 좁히는지 보여줍니다. 낮음=많은 선체, 높음=소수.`,
    ru: `Вес показывает, насколько подсказка сужает выбор корпуса. Низкий — подходит много, высокий — мало.`,
    zh: `权重表示线索能在多大程度上缩小船体范围。低=符合的船多，高=符合的船少。`,
  },
});

for (const [key, values] of Object.entries(RENAMES)) {
  for (const [lang, value] of Object.entries(values)) {
    if (MESSAGES[lang]) MESSAGES[lang][key] = value;
  }
}

export function isLocale(locale) {
  return LOCALES.includes(locale);
}

export function resolveLocale(raw) {
  if (!raw) return 'en';
  const lower = String(raw).toLowerCase().replace('_', '-');
  if (isLocale(lower)) return lower;
  if (lower.startsWith('zh')) return 'zh';
  if (lower.startsWith('ja')) return 'ja';
  if (lower.startsWith('ko')) return 'ko';
  if (lower.startsWith('ru')) return 'ru';
  if (lower.startsWith('de')) return 'de';
  if (lower.startsWith('fr')) return 'fr';
  if (lower.startsWith('es')) return 'es';
  if (lower.startsWith('en')) return 'en';
  return 'en';
}

function localeFromTag(raw) {
  if (!raw) return null;
  // Every zh variant (zh-Hans, zh-Hant, zh-TW, zh-HK, ...) uses the
  // Simplified Chinese catalog in FITDLE.
  if (/^zh(?:[-_]|$)/i.test(String(raw))) return 'zh';
  const resolved = resolveLocale(raw);
  if (resolved !== 'en' || /^en(?:[-_]|$)/i.test(String(raw))) return resolved;
  return null;
}

export function detectLocale() {
  try {
    const stored = localStorage.getItem('fitdle:v1:lang');
    const storedLocale = localeFromTag(stored);
    if (storedLocale) return storedLocale;
  } catch {
    // localStorage can be unavailable in privacy modes
  }
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
  for (const candidate of candidates) {
    const resolved = resolveLocale(candidate);
    if (isLocale(resolved)) return resolved;
  }
  return 'en';
}

export function createI18n(locale) {
  const lang = isLocale(locale) ? locale : 'en';
  const messages = MESSAGES[lang] || MESSAGES.en;
  const fallback = MESSAGES.en;
  const intl = LOCALE_META[lang]?.intl || LOCALE_META.en.intl;

  const t = (key, vars = {}) => {
    let value = messages[key] ?? fallback[key] ?? key;
    for (const [name, replacement] of Object.entries(vars)) {
      value = value.replaceAll(`{${name}}`, String(replacement));
    }
    return value;
  };

  const numberFormat = (options = {}) => new Intl.NumberFormat(intl, options);
  const integer = (n) => numberFormat({ maximumFractionDigits: 0 }).format(Number(n) || 0);
  const decimal = (n, digits = 1) => numberFormat({ minimumFractionDigits: 0, maximumFractionDigits: digits }).format(Number(n) || 0);
  const compact = (n) => numberFormat({ notation: 'compact', maximumFractionDigits: 1 }).format(Number(n) || 0);
  const isk = (n) => `${compact(n)} ISK`;
  const percent = (n) => numberFormat({ maximumFractionDigits: 0 }).format(Number(n) || 0);
  const date = (dateKey) => {
    const d = new Date(`${dateKey}T12:00:00Z`);
    return new Intl.DateTimeFormat(intl, {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }).format(d);
  };
  const duration = (ms) => {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = String(Math.floor(total / 3600)).padStart(2, '0');
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  return { lang, intl, t, integer, decimal, compact, isk, percent, date, duration };
}

Object.assign(RENAMES, {
  'help.modesTitle': {
    en: `MODES`, de: `MODI`, es: `MODOS`, fr: `MODES`,
    ja: `モード`, ko: `모드`, ru: `РЕЖИМЫ`, zh: `模式说明`,
  },
  'help.gameplayTitle': {
    en: `GAMEPLAY`, de: `SPIELWEISEN`, es: `MODALIDADES`, fr: `MODES DE JEU`,
    ja: `ゲームモード`, ko: `게임 모드`, ru: `ИГРОВЫЕ РЕЖИМЫ`, zh: `玩法说明`,
  },
  'help.generalTitle': {
    en: `GENERAL`, de: `ALLGEMEIN`, es: `GENERAL`, fr: `GÉNÉRAL`,
    ja: `共通`, ko: `공통`, ru: `ОБЩИЕ`, zh: `通用`,
  },
  'help.dailyBody': {
    en: `One target per UTC day, reset at 11:00 UTC. Standard, Abyss and Timed each have their own daily target. All three record daily plays and wins; Standard and Abyss use the six-attempt score.`,
    de: `Ein Ziel pro UTC-Tag, Reset um 11:00 UTC. Standard, Abyss und Timed haben jeweils ein eigenes Tagesziel. Alle drei erfassen tägliche Spiele und Siege; Standard und Abyss nutzen die Sechs-Versuche-Wertung.`,
    es: `Un objetivo por día UTC, reinicio a las 11:00 UTC. Estándar, Abismo y Crono tienen su propio objetivo diario. Los tres registran partidas y victorias diarias; Estándar y Abismo usan la puntuación de seis intentos.`,
    fr: `Une cible par jour UTC, réinitialisation à 11:00 UTC. Standard, Abysse et Chrono ont chacun leur propre cible quotidienne. Les trois enregistrent parties et victoires quotidiennes ; Standard et Abysse utilisent le score à six tentatives.`,
    ja: `UTC ごとに1日1目標、11:00 UTC にリセット。スタンダード、アビス、タイムドはそれぞれ専用のデイリー目標を持ちます。3つともデイリーのプレイと勝利を記録し、スタンダードとアビスは6回制のスコアを使います。`,
    ko: `UTC 기준 하루 하나의 목표, 11:00 UTC 초기화. 스탠다드, 어비스, 타임드는 각각 전용 일일 목표를 가집니다. 세 모드 모두 일일 플레이와 승리를 기록하며, 스탠다드와 어비스는 6회 점수를 사용합니다.`,
    ru: `Одна цель на сутки UTC, сброс в 11:00 UTC. У Standard, Abyss и Timed свои ежедневные цели. Все три записывают ежедневные игры и победы; Standard и Abyss используют счёт по шести попыткам.`,
    zh: `每个 UTC 日一个目标，11:00 UTC 重置。标准、深渊和计时模式各自拥有独立的每日目标。三者都会记录每日游玩与胜利；标准和深渊使用六次机会的成绩。`,
  },
  'help.sharedRules': {
    en: `The selected Daily or Free source determines the target.
Standard and Abyss use six attempts; Timed is unlimited.
A guess reveals values shared with the target; misses add equipment clues.
Daily Standard, Abyss and Timed all record daily plays and wins; Free does not affect daily stats.
Any daily win counts once for the daily streak. Free keeps a separate per-gameplay streak from random refresh.`,
    de: `Die gewählte Daily- oder Free-Quelle bestimmt das Ziel.
Standard und Abyss haben sechs Versuche; Timed ist unbegrenzt.
Ein Tipp deckt Werte auf, die mit dem Ziel übereinstimmen; Fehlversuche fügen Ausrüstungshinweise hinzu.
Daily-Standard, Daily-Abyss und Daily-Timed erfassen alle tägliche Spiele und Siege; Free beeinflusst die Tagesstatistik nicht.
Jeder Tagessieg zählt einmal für die Tages-Serie. Free führt über den Zufalls-Refresh eine eigene Serie pro Spielweise.`,
    es: `La fuente Diaria o Libre seleccionada determina el objetivo.
Estándar y Abismo usan seis intentos; Crono es ilimitado.
Cada intento revela valores compartidos con el objetivo; los fallos añaden pistas de equipo.
Diaria Estándar, Diaria Abismo y Diaria Crono registran partidas y victorias diarias; Libre no afecta a las estadísticas diarias.
Cada victoria diaria cuenta una vez para la racha diaria. Libre mantiene una racha propia por modalidad mediante la actualización aleatoria.`,
    fr: `La source Quotidien ou Libre sélectionnée détermine la cible.
Standard et Abysse utilisent six tentatives ; Chrono est illimité.
Chaque tentative révèle les valeurs partagées avec la cible ; les erreurs ajoutent des indices d’équipement.
Quotidien Standard, Quotidien Abysse et Quotidien Chrono enregistrent parties et victoires quotidiennes ; Libre n’affecte pas les stats quotidiennes.
Chaque victoire quotidienne compte une fois pour la série quotidienne. Libre conserve une série distincte par mode via le rafraîchissement aléatoire.`,
    ja: `選択中のデイリーまたはフリーの目標ソースに従います。
スタンダードとアビスは6回、タイムドは無制限です。
推測すると目標と共通する値が公開され、誤答は装備ヒントを追加します。
デイリーのスタンダード、アビス、タイムドはすべてデイリーのプレイと勝利を記録し、フリーはデイリー統計に影響しません。
デイリーの勝利は1日1回だけ連勝日に数えます。フリーはランダム更新でモード別の独立した連勝を保持します。`,
    ko: `선택한 데일리 또는 자유 목표 소스가 목표를 결정합니다.
스탠다드와 어비스는 6회, 타임드는 무제한입니다.
추측하면 목표와 공유하는 값이 공개되고, 오답은 장비 단서를 추가합니다.
데일리 스탠다드, 데일리 어비스, 데일리 타임드는 모두 일일 플레이와 승리를 기록하며, 자유는 일일 통계에 영향을 주지 않습니다.
일일 승리는 하루 한 번만 일일 연승에 반영됩니다. 자유는 무작위 새로고침으로 모드별 별도 연승을 유지합니다.`,
    ru: `Выбранный источник Daily или Free определяет цель.
Standard и Abyss дают шесть попыток; Timed — неограниченно.
Догадка раскрывает совпадающие с целью значения; промахи добавляют подсказки об оборудовании.
Daily Standard, Daily Abyss и Daily Timed записывают ежедневные игры и победы; Free не влияет на ежедневную статистику.
Любая ежедневная победа учитывается для серии дней один раз в день. Free ведёт отдельную серию для каждой игровой моды при случайном обновлении.`,
    zh: `目标来源由当前选择的每日或自由模式决定。
标准和深渊有六次尝试；计时模式尝试次数不限。
每次猜测会揭示与目标相同的数值；猜错还会增加装备线索。
每日标准、每日深渊和每日计时都会记录每日游玩与胜利；自由模式不影响每日统计。
每个 UTC 日的任意一次胜利只计入一次连胜天数。自由模式通过随机刷新维护独立的玩法连胜。`,
  },
  'mode.timedHint': {
    en: `Timed gameplay. Uses the selected Daily or Free target source; with Daily it has its own daily target. Unlimited attempts against the clock; no six-attempt score.`,
    de: `Timed-Spielweise. Nutzt die gewählte Daily- oder Free-Zielquelle; bei Daily mit eigenem Tagesziel. Unbegrenzte Versuche gegen die Uhr; keine Sechs-Versuche-Wertung.`,
    es: `Modalidad Crono. Usa la fuente de objetivo Diaria o Libre seleccionada; con Diaria tiene su propio objetivo diario. Intentos ilimitados contra el reloj; sin puntuación de seis intentos.`,
    fr: `Mode Chrono. Utilise la source de cible Quotidien ou Libre sélectionnée ; en Quotidien, il a sa propre cible quotidienne. Tentatives illimitées contre le chrono ; sans score à six tentatives.`,
    ja: `タイムド玩法。選択中のデイリーまたはフリーの目標ソースに従い、デイリー時は専用のデイリー目標を使います。時間制限付きで試行は無制限、6回制のスコアはありません。`,
    ko: `타임드 플레이. 선택한 데일리 또는 자유 목표 소스를 따르며, 데일리에서는 전용 일일 목표를 사용합니다. 시간 제한과 무제한 시도, 6회 점수는 없습니다.`,
    ru: `Режим Timed. Использует выбранный источник цели Daily или Free; в Daily — отдельную дневную цель. Неограниченные попытки на время; без счёта по шести попыткам.`,
    zh: `计时玩法。目标来源遵循当前选择的每日或自由模式；选择每日时使用独立的每日目标。无限尝试，与时间赛跑；不使用六次机会成绩。`,
  },
  'mode.helpTimed': {
    en: `Unlimited attempts.
Opening clues are revealed when you start.
Wrong guesses do not reveal clues.
A batch is released every 30 seconds; each lock has a 5-second cooldown. The batch grows every two releases: +1, +1, +2, +2, +3, and so on.
If all clues are already revealed, the next release fails the run. If fewer clues remain than the next batch, release all of them and fail only on the following release.
Hold the timer for 3 seconds to give up and reveal the answer.
With Daily selected, Timed uses its own daily target. With Free selected, it uses the chosen or random free target.
Progress is saved; Timed does not use the six-attempt score.`,
    de: `Unbegrenzte Versuche.
Start-Hinweise werden beim Start aufgedeckt.
Falsche Versuche geben keine Hinweise.
Alle 30 Sekunden wird ein Hinweis-Paket freigegeben; nach jeder Erfassung folgen 5 Sekunden Abklingzeit. Alle zwei Freigaben wächst das Paket: +1, +1, +2, +2, +3 und so weiter.
Sind alle Hinweise bereits offen, scheitert der Lauf bei der nächsten Freigabe. Sind weniger Hinweise übrig als das nächste Paket, werden alle freigegeben; der Lauf scheitert erst bei der darauffolgenden Freigabe.
Timer 3 Sekunden halten, um aufzugeben und die Antwort zu sehen.
Bei Daily nutzt Timed ein eigenes Tagesziel. Bei Free wird das gewählte oder zufällige freie Ziel verwendet.
Fortschritt wird gespeichert; Timed nutzt keine Sechs-Versuche-Wertung.`,
    es: `Intentos ilimitados.
Las pistas iniciales se revelan al empezar.
Los fallos no revelan pistas.
Cada 30 segundos se revela un lote de pistas; tras cada bloqueo hay 5 segundos de recarga. El lote crece cada dos entregas: +1, +1, +2, +2, +3 y así sucesivamente.
Si todas las pistas ya están reveladas, la siguiente entrega hace fallar la partida. Si quedan menos pistas que el siguiente lote, se revelan todas y la partida falla solo en la entrega siguiente.
Mantén el cronómetro 3 segundos para rendirte y ver la respuesta.
Con Diaria, Crono usa su propio objetivo diario. Con Libre, usa el objetivo libre elegido o aleatorio.
El progreso se guarda; Crono no usa la puntuación de seis intentos.`,
    fr: `Tentatives illimitées.
Les indices initiaux sont révélés au départ.
Les erreurs ne révèlent pas d’indices.
Un lot d’indices est révélé toutes les 30 secondes ; chaque verrouillage impose 5 secondes de recharge. Le lot augmente toutes les deux révélations : +1, +1, +2, +2, +3, etc.
Si tous les indices sont déjà révélés, la révélation suivante fait échouer la partie. S’il reste moins d’indices que le prochain lot, ils sont tous révélés et la partie n’échoue qu’à la révélation suivante.
Maintenez le chrono 3 secondes pour abandonner et voir la réponse.
En Quotidien, Chrono utilise sa propre cible quotidienne. En Libre, il utilise la cible libre choisie ou aléatoire.
La progression est sauvegardée ; Chrono n’utilise pas le score à six tentatives.`,
    ja: `試行は無制限です。
開始時に初期ヒントが公開されます。
誤答ではヒントは公開されません。
30秒ごとにヒントの束が公開され、各ロック後には5秒のクールダウンがあります。2回の公開ごとに束の数が増えます：+1、+1、+2、+2、+3…。
すべてのヒントが公開済みの場合、次の公開で失敗します。残りのヒントが次の束より少ない場合はすべて公開し、その次の公開で失敗します。
タイマーを3秒長押しすると諦めて答えが表示されます。
デイリー選択時は専用のデイリー目標、フリー選択時は選択またはランダムなフリー目標を使います。
進行状況は保存されますが、6回制のスコアは使用しません。`,
    ko: `시도 횟수는 무제한입니다.
시작하면 초기 단서가 공개됩니다.
틀린 추측은 단서를 공개하지 않습니다.
30초마다 단서 묶음이 공개되며, 각 잠금 후 5초의 재사용 대기시간이 있습니다. 두 번의 공개마다 묶음 크기가 늘어납니다: +1, +1, +2, +2, +3….
모든 단서가 이미 공개되었다면 다음 공개에서 실패합니다. 남은 단서가 다음 묶음보다 적으면 모두 공개하고, 그다음 공개에서만 실패합니다.
타이머를 3초간 길게 누르면 포기하고 정답이 공개됩니다.
데일리 선택 시 타임드는 전용 일일 목표를, 자유 선택 시 선택하거나 무작위로 고른 자유 목표를 사용합니다.
진행 상황은 저장되지만 6회 점수는 사용하지 않습니다.`,
    ru: `Неограниченное число попыток.
При старте открываются начальные подсказки.
Неверные догадки не открывают подсказки.
Каждые 30 секунд открывается пакет подсказок; после каждой фиксации — 5 секунд перезарядки. Каждые две выдачи размер пакета растёт: +1, +1, +2, +2, +3 и так далее.
Если все подсказки уже открыты, следующая выдача приводит к поражению. Если оставшихся подсказок меньше следующего пакета, открываются все, а поражение наступает только при следующей выдаче.
Удерживайте таймер 3 секунды, чтобы сдаться и увидеть ответ.
В Daily Timed использует отдельную дневную цель. В Free — выбранную или случайную свободную цель.
Прогресс сохраняется; Timed не использует счёт по шести попыткам.`,
    zh: `尝试次数不限。
开始计时时展示开局线索。
猜错不会揭示线索。
每 30 秒发放一批线索；每次锁定目标后有 5 秒冷却。每两次发放后批量增加：+1、+1、+2、+2、+3，以此类推。
如果所有线索都已揭示，下一次发放时失败。如果剩余线索少于下一批数量，则全部揭示，并在再下一次发放时才失败。
长按计时器 3 秒可放弃并显示答案。
选择每日模式时，计时玩法使用独立的每日目标；选择自由模式时，使用指定或随机的自由目标。
进度会保存，但不使用六次机会成绩。`,
  },
});

for (const [key, values] of Object.entries(RENAMES)) {
  for (const [lang, value] of Object.entries(values)) {
    if (MESSAGES[lang]) MESSAGES[lang][key] = value;
  }
}

Object.assign(RENAMES, {
  'help.statStreak': {
    en: `WIN STREAK (DAYS)`, de: `SIEGESSERIE (TAGE)`, es: `RACHA (DÍAS)`, fr: `SÉRIE (JOURS)`,
    ja: `連勝日数`, ko: `연승 일수`, ru: `СЕРИЯ ПОБЕД (ДНЕЙ)`, zh: `连胜天数`,
  },
  'help.statBest': {
    en: `BEST STREAK (DAYS)`, de: `BESTE SERIE (TAGE)`, es: `MEJOR RACHA (DÍAS)`, fr: `MEILLEURE SÉRIE (JOURS)`,
    ja: `最高連勝日数`, ko: `최고 연승 일수`, ru: `ЛУЧШАЯ СЕРИЯ (ДНЕЙ)`, zh: `最高连胜天数`,
  },
  'end.streak': {
    en: `DAY STREAK`, de: `TAGES-SERIE`, es: `RACHA DE DÍAS`, fr: `SÉRIE DE JOURS`,
    ja: `連勝日数`, ko: `연승 일수`, ru: `СЕРИЯ ДНЕЙ`, zh: `连胜天数`,
  },
  'help.statLegacy': {
    en: `LEGACY TOTAL: {played} played / {wins} won`,
    de: `ALTES GESAMT: {played} gespielt / {wins} gewonnen`,
    es: `TOTAL ANTERIOR: {played} jugadas / {wins} ganadas`,
    fr: `TOTAL HÉRITÉ : {played} jouées / {wins} gagnées`,
    ja: `旧集計: プレイ {played} / 勝利 {wins}`,
    ko: `이전 합계: 플레이 {played} / 승리 {wins}`,
    ru: `ПРЕЖНИЙ ИТОГ: {played} игр / {wins} побед`,
    zh: `迁移前总计：游玩 {played} / 击杀 {wins}`,
  },
  'help.resetRecord': {
    en: `HOLD 5s TO RESET ALL PROGRESS`,
    de: `5 SEK. HALTEN ZUM ZURÜCKSETZEN`,
    es: `MANTÉN 5 s PARA REINICIAR`,
    fr: `MAINTENIR 5 s POUR RÉINITIALISER`,
    ja: `5秒長押しで全進行をリセット`,
    ko: `5초 길게 눌러 전체 진행 초기화`,
    ru: `УДЕРЖИВАЙТЕ 5 СЕК. ДЛЯ СБРОСА`,
    zh: `长按 5 秒重置全部进度`,
  },
});

for (const [key, values] of Object.entries(RENAMES)) {
  for (const [lang, value] of Object.entries(values)) {
    if (MESSAGES[lang]) MESSAGES[lang][key] = value;
  }
}

Object.assign(RENAMES, {
  'help.resetRecord': {
    en: `RESET ALL PROGRESS`,
    de: `GESAMTEN FORTSCHRITT ZURÜCKSETZEN`,
    es: `REINICIAR TODO EL PROGRESO`,
    fr: `RÉINITIALISER TOUTE LA PROGRESSION`,
    ja: `全進行をリセット`,
    ko: `전체 진행 초기화`,
    ru: `СБРОСИТЬ ВЕСЬ ПРОГРЕСС`,
    zh: `重置全部进度`,
  },
});
for (const [key, values] of Object.entries(RENAMES)) {
  for (const [lang, value] of Object.entries(values)) {
    if (MESSAGES[lang]) MESSAGES[lang][key] = value;
  }
}

Object.assign(RENAMES, {
  'error.dailyUnavailableCode': {
    en: 'DAILY TARGET LOCKED', de: 'TAGESZIEL GESPERRT', es: 'OBJETIVO DIARIO BLOQUEADO',
    fr: 'CIBLE QUOTIDIENNE INDISPONIBLE', ja: 'デイリー目標を取得できません',
    ko: '일일 목표를 사용할 수 없음', ru: 'ЕЖЕДНЕВНАЯ ЦЕЛЬ НЕДОСТУПНА', zh: '每日目标不可用',
  },
  'error.dailyUnavailableTitle': {
    en: 'Daily target unavailable', de: 'Tagesziel nicht verfügbar', es: 'Objetivo diario no disponible',
    fr: 'Cible quotidienne indisponible', ja: 'デイリー目標を取得できません',
    ko: '일일 목표를 사용할 수 없습니다', ru: 'Ежедневная цель недоступна', zh: '每日目标暂不可用',
  },
  'error.dailyUnavailableBody': {
    en: 'The authoritative time, drand beacon, or killmail record could not be verified. Open Free mode to choose a target manually.',
    de: 'Die autoritative Zeit, der drand-Beacon oder der Killmail-Datensatz konnte nicht verifiziert werden. Öffne den Free-Modus, um ein Ziel manuell zu wählen.',
    es: 'No se pudo verificar la hora autoritativa, el beacon de drand o el killmail. Abre el modo Libre para elegir un objetivo manualmente.',
    fr: 'L’heure de référence, le beacon drand ou le killmail n’a pas pu être vérifié. Ouvrez le mode Libre pour choisir une cible manuellement.',
    ja: '権威時刻、drand ビーコン、またはキルメールを検証できませんでした。フリーモードを開き、目標を手動で選択してください。',
    ko: '권위 시간, drand 비컨 또는 킬메일을 검증할 수 없습니다. 자유 모드에서 목표를 직접 선택하세요.',
    ru: 'Не удалось проверить авторитетное время, beacon drand или киллмейл. Откройте Free, чтобы выбрать цель вручную.',
    zh: '无法验证权威时间、drand 信标或击杀记录。请打开自由模式手动选择目标。',
  },
  'clue.unavailable': {
    en: 'UNAVAILABLE', de: 'NICHT VERFÜGBAR', es: 'NO DISPONIBLE', fr: 'INDISPONIBLE',
    ja: 'データなし', ko: '데이터 없음', ru: 'НЕТ ДАННЫХ', zh: '数据缺失',
  },
});
for (const [key, values] of Object.entries(RENAMES)) {
  for (const [lang, value] of Object.entries(values)) {
    if (MESSAGES[lang]) MESSAGES[lang][key] = value;
  }
}

Object.assign(RENAMES, {
  "header.reset": {
    "en": "NEXT RESET IN",
    "de": "NÄCHSTER RESET IN",
    "es": "PRÓXIMO REINICIO EN",
    "fr": "PROCHAINE RÉINITIALISATION DANS",
    "ja": "次回リセットまで",
    "ko": "다음 초기화까지",
    "ru": "ДО СЛЕДУЮЩЕГО СБРОСА",
    "zh": "距离下次重置"
  },
  "end.next": {
    "en": "NEXT RESET",
    "de": "NÄCHSTER RESET",
    "es": "PRÓXIMO REINICIO",
    "fr": "PROCHAINE RÉINITIALISATION",
    "ja": "次回リセット",
    "ko": "다음 초기화",
    "ru": "СЛЕДУЮЩИЙ СБРОС",
    "zh": "下次重置"
  },
  "error.timeCode": {
    "en": "TIME VERIFICATION FAILED",
    "de": "ZEITPRÜFUNG FEHLGESCHLAGEN",
    "es": "VERIFICACIÓN DE TIEMPO FALLIDA",
    "fr": "ÉCHEC DE LA VÉRIFICATION DE L’HEURE",
    "ja": "時刻検証に失敗",
    "ko": "시간 검증 실패",
    "ru": "ОШИБКА ПРОВЕРКИ ВРЕМЕНИ",
    "zh": "时间校验失败"
  },
  "error.timeTitle": {
    "en": "Authoritative time unavailable",
    "de": "Autoritative Zeit nicht verfügbar",
    "es": "Hora autoritativa no disponible",
    "fr": "Heure de référence indisponible",
    "ja": "権威時刻を取得できません",
    "ko": "권위 시간을 사용할 수 없음",
    "ru": "Авторитетное время недоступно",
    "zh": "无法验证权威时间"
  },
  "error.timeBody": {
    "en": "The server time could not be verified. The daily target stays locked; no local-clock fallback is used. Open Free mode or retry.",
    "de": "Die Serverzeit konnte nicht verifiziert werden. Das Tagesziel bleibt gesperrt; es wird kein lokaler Uhr-Ersatz verwendet. Öffne den Free-Modus oder versuche es erneut.",
    "es": "No se pudo verificar la hora del servidor. El objetivo diario sigue bloqueado; no se usa la hora local como respaldo. Abre el modo Libre o reintenta.",
    "fr": "L’heure du serveur n’a pas pu être vérifiée. La cible quotidienne reste verrouillée ; aucune heure locale n’est utilisée. Ouvrez le mode Libre ou réessayez.",
    "ja": "サーバー時刻を検証できませんでした。デイリー目標はロックされたままで、ローカル時計へのフォールバックは行いません。フリーモードを開くか再試行してください。",
    "ko": "서버 시간을 검증할 수 없습니다. 일일 목표는 잠긴 상태로 유지되며 로컬 시계로 대체하지 않습니다. 자유 모드를 열거나 다시 시도하세요.",
    "ru": "Не удалось проверить серверное время. Ежедневная цель остаётся заблокированной; локальные часы не используются. Откройте Free или повторите попытку.",
    "zh": "无法验证服务器时间。每日目标保持锁定，不会退回本地时钟。请打开自由模式或重试。"
  },
  "error.drandCode": {
    "en": "DRAND BEACON UNAVAILABLE",
    "de": "DRAND-BEACON NICHT VERFÜGBAR",
    "es": "BEACON DRAND NO DISPONIBLE",
    "fr": "BEACON DRAND INDISPONIBLE",
    "ja": "DRAND ビーコン利用不可",
    "ko": "DRAND 비컨 사용 불가",
    "ru": "BEACON DRAND НЕДОСТУПЕН",
    "zh": "DRAND 信标不可用"
  },
  "error.drandTitle": {
    "en": "Time-lock beacon unavailable",
    "de": "Zeitlock-Beacon nicht verfügbar",
    "es": "Beacon de bloqueo temporal no disponible",
    "fr": "Beacon de verrouillage temporel indisponible",
    "ja": "タイムロックビーコン利用不可",
    "ko": "타임락 비컨 사용 불가",
    "ru": "Тайм-лок beacon недоступен",
    "zh": "时间锁信标不可用"
  },
  "error.drandBody": {
    "en": "The configured drand round could not be fetched or verified. The daily target stays locked until the beacon is available. Open Free mode or retry.",
    "de": "Die konfigurierte drand-Runde konnte nicht abgerufen oder verifiziert werden. Das Tagesziel bleibt gesperrt, bis der Beacon verfügbar ist. Öffne den Free-Modus oder versuche es erneut.",
    "es": "No se pudo obtener ni verificar la ronda drand configurada. El objetivo diario sigue bloqueado hasta que el beacon esté disponible. Abre el modo Libre o reintenta.",
    "fr": "La ronde drand configurée n’a pas pu être récupérée ou vérifiée. La cible quotidienne reste verrouillée jusqu’à la disponibilité du beacon. Ouvrez le mode Libre ou réessayez.",
    "ja": "設定された drand ラウンドを取得・検証できませんでした。ビーコンが利用できるまでデイリー目標はロックされます。フリーモードを開くか再試行してください。",
    "ko": "설정된 drand 라운드를 가져오거나 검증할 수 없습니다. 비컨이 사용 가능할 때까지 일일 목표는 잠깁니다. 자유 모드를 열거나 다시 시도하세요.",
    "ru": "Не удалось получить или проверить настроенный раунд drand. Ежедневная цель остаётся заблокированной до появления beacon. Откройте Free или повторите попытку.",
    "zh": "无法获取或验证配置的 drand 轮次。每日目标保持锁定，直到信标恢复。请打开自由模式或重试。"
  },
  "error.zkillCode": {
    "en": "ZKILLBOARD UNAVAILABLE",
    "de": "ZKILLBOARD NICHT VERFÜGBAR",
    "es": "ZKILLBOARD NO DISPONIBLE",
    "fr": "ZKILLBOARD INDISPONIBLE",
    "ja": "ZKILLBOARD 利用不可",
    "ko": "ZKILLBOARD 사용 불가",
    "ru": "ZKILLBOARD НЕДОСТУПЕН",
    "zh": "ZKILLBOARD 不可用"
  },
  "error.zkillTitle": {
    "en": "Killmail data unavailable",
    "de": "Killmail-Daten nicht verfügbar",
    "es": "Datos de killmail no disponibles",
    "fr": "Données de killmail indisponibles",
    "ja": "キルメールデータ利用不可",
    "ko": "킬메일 데이터 사용 불가",
    "ru": "Данные киллмейлов недоступны",
    "zh": "击杀数据不可用"
  },
  "error.zkillBody": {
    "en": "zKillboard could not return the completed-month killmail data. The daily target stays locked; no static target is used. Open Free mode or retry.",
    "de": "zKillboard konnte die Killmail-Daten des abgeschlossenen Monats nicht liefern. Das Tagesziel bleibt gesperrt; kein statisches Ziel wird verwendet. Öffne den Free-Modus oder versuche es erneut.",
    "es": "zKillboard no pudo devolver los killmails del mes completo. El objetivo diario sigue bloqueado; no se usa un objetivo estático. Abre el modo Libre o reintenta.",
    "fr": "zKillboard n’a pas pu renvoyer les killmails du mois terminé. La cible quotidienne reste verrouillée ; aucune cible statique n’est utilisée. Ouvrez le mode Libre ou réessayez.",
    "ja": "zKillboard から完了月のキルメールを取得できませんでした。デイリー目標はロックされたままで、静的目標は使用しません。フリーモードを開くか再試行してください。",
    "ko": "zKillboard에서 완료된 월의 킬메일을 가져오지 못했습니다. 일일 목표는 잠긴 상태로 유지되며 정적 목표를 사용하지 않습니다. 자유 모드를 열거나 다시 시도하세요.",
    "ru": "zKillboard не вернул киллмейлы завершённого месяца. Ежедневная цель остаётся заблокированной; статическая цель не используется. Откройте Free или повторите попытку.",
    "zh": "zKillboard 无法返回完整月份的击杀数据。每日目标保持锁定，不会使用静态目标。请打开自由模式或重试。"
  },
  "error.esiCode": {
    "en": "ESI UNAVAILABLE",
    "de": "ESI NICHT VERFÜGBAR",
    "es": "ESI NO DISPONIBLE",
    "fr": "ESI INDISPONIBLE",
    "ja": "ESI 利用不可",
    "ko": "ESI 사용 불가",
    "ru": "ESI НЕДОСТУПЕН",
    "zh": "ESI 不可用"
  },
  "error.esiTitle": {
    "en": "ESI name data unavailable",
    "de": "ESI-Namendaten nicht verfügbar",
    "es": "Datos de nombres ESI no disponibles",
    "fr": "Données de noms ESI indisponibles",
    "ja": "ESI 名前データ利用不可",
    "ko": "ESI 이름 데이터 사용 불가",
    "ru": "Данные имён ESI недоступны",
    "zh": "ESI 名称数据不可用"
  },
  "error.esiBody": {
    "en": "ESI could not provide supporting character or type names. The puzzle can continue, but some names may be missing.",
    "de": "ESI konnte keine unterstützenden Charakter- oder Typnamen liefern. Das Rätsel kann fortgesetzt werden, aber einige Namen fehlen möglicherweise.",
    "es": "ESI no pudo proporcionar nombres de personajes o tipos. El puzzle puede continuar, pero es posible que falten algunos nombres.",
    "fr": "ESI n’a pas pu fournir les noms de personnages ou de types. Le puzzle peut continuer, mais certains noms peuvent manquer.",
    "ja": "ESI からキャラクター名やタイプ名を取得できませんでした。パズルは続行できますが、一部の名前が表示されない場合があります。",
    "ko": "ESI에서 캐릭터 또는 타입 이름을 가져오지 못했습니다. 퍼즐은 계속할 수 있지만 일부 이름이 표시되지 않을 수 있습니다.",
    "ru": "ESI не предоставил имена персонажей или типов. Головоломку можно продолжить, но некоторые имена могут отсутствовать.",
    "zh": "ESI 无法提供角色或物品名称。谜题可以继续，但部分名称可能缺失。"
  },
  "error.noTargetCode": {
    "en": "NO KB TARGET",
    "de": "KEIN KB-ZIEL",
    "es": "SIN OBJETIVO KB",
    "fr": "AUCUNE CIBLE KB",
    "ja": "KB 目標なし",
    "ko": "KB 목표 없음",
    "ru": "НЕТ ЦЕЛИ KB",
    "zh": "未选出 KB 目标"
  },
  "error.noTargetTitle": {
    "en": "No eligible killmail",
    "de": "Kein passendes Killmail",
    "es": "No hay killmail elegible",
    "fr": "Aucun killmail éligible",
    "ja": "条件に合うキルメールがありません",
    "ko": "조건에 맞는 킬메일이 없습니다",
    "ru": "Нет подходящего киллмейла",
    "zh": "没有符合条件的击杀"
  },
  "error.noTargetBody": {
    "en": "No completed-month killmail matched the selected ship and KB lower bound. Open Free mode or retry.",
    "de": "Kein Killmail des abgeschlossenen Monats passte zum gewählten Schiff und zur KB-Untergrenze. Öffne den Free-Modus oder versuche es erneut.",
    "es": "Ningún killmail del mes completo coincidió con la nave y el límite inferior de KB. Abre el modo Libre o reintenta.",
    "fr": "Aucun killmail du mois terminé ne correspond au vaisseau et à la limite KB. Ouvrez le mode Libre ou réessayez.",
    "ja": "完了月のキルメールに、選択した船と KB 下限に一致するものがありませんでした。フリーモードを開くか再試行してください。",
    "ko": "완료된 월의 킬메일 중 선택한 함선과 KB 하한에 맞는 항목이 없습니다. 자유 모드를 열거나 다시 시도하세요.",
    "ru": "Среди киллмейлов завершённого месяца нет подходящего к выбранному кораблю и нижней границе KB. Откройте Free или повторите попытку.",
    "zh": "完整月份的击杀中没有符合当前舰船与 KB 下限的记录。请打开自由模式或重试。"
  }
});
for (const [key, values] of Object.entries(RENAMES)) {
  for (const [lang, value] of Object.entries(values)) {
    if (MESSAGES[lang]) MESSAGES[lang][key] = value;
  }
}

Object.assign(RENAMES, {
  "error.dailyLore": {
    "en": "DAILY SIGNAL LOST",
    "de": "TÄGLICHES SIGNAL VERLOREN",
    "es": "SEÑAL DIARIA PERDIDA",
    "fr": "SIGNAL QUOTIDIEN PERDU",
    "ja": "デイリー信号喪失",
    "ko": "일일 신호 상실",
    "ru": "ЕЖЕДНЕВНЫЙ СИГНАЛ ПОТЕРЯН",
    "zh": "每日信号丢失"
  },
  "error.timeLore": {
    "en": "TIME SIGNAL LOST",
    "de": "ZEITSIGNAL VERLOREN",
    "es": "SEÑAL DE TIEMPO PERDIDA",
    "fr": "SIGNAL TEMPOREL PERDU",
    "ja": "時刻信号喪失",
    "ko": "시간 신호 상실",
    "ru": "СИГНАЛ ВРЕМЕНИ ПОТЕРЯН",
    "zh": "时间信号丢失"
  },
  "error.drandLore": {
    "en": "BEACON SIGNAL LOST",
    "de": "BEACON-SIGNAL VERLOREN",
    "es": "SEÑAL DEL BEACON PERDIDA",
    "fr": "SIGNAL DU BEACON PERDU",
    "ja": "ビーコン信号喪失",
    "ko": "비컨 신호 상실",
    "ru": "СИГНАЛ BEACON ПОТЕРЯН",
    "zh": "信标信号丢失"
  },
  "error.zkillLore": {
    "en": "UPLINK FAILED",
    "de": "UPLINK FEHLGESCHLAGEN",
    "es": "ENLACE ASCENDENTE FALLIDO",
    "fr": "LIAISON MONTANTE EN ÉCHEC",
    "ja": "アップリンク失敗",
    "ko": "업링크 실패",
    "ru": "СБОЙ UPLINK",
    "zh": "上行链路失败"
  },
  "error.esiLore": {
    "en": "IDENTITY ARCHIVE OFFLINE",
    "de": "IDENTITÄTSARCHIV OFFLINE",
    "es": "ARCHIVO DE IDENTIDAD OFFLINE",
    "fr": "ARCHIVE D’IDENTITÉ HORS LIGNE",
    "ja": "識別アーカイブオフライン",
    "ko": "신원 기록 오프라인",
    "ru": "АРХИВ ИДЕНТИЧНОСТИ ОФЛАЙН",
    "zh": "身份档案离线"
  },
  "error.noTargetLore": {
    "en": "NO TARGET LOCK",
    "de": "KEIN ZIEL LOCK",
    "es": "SIN BLOQUEO DE OBJETIVO",
    "fr": "AUCUN VERROUILLAGE DE CIBLE",
    "ja": "目標ロックなし",
    "ko": "목표 잠금 없음",
    "ru": "ЦЕЛЬ НЕ ЗАХВАЧЕНА",
    "zh": "未捕获目标"
  },
  "error.unknownHullLore": {
    "en": "SIGNAL UNCLASSIFIED",
    "de": "SIGNAL UNKLASSIFIZIERT",
    "es": "SEÑAL SIN CLASIFICAR",
    "fr": "SIGNAL NON CLASSÉ",
    "ja": "信号未分類",
    "ko": "신호 미분류",
    "ru": "СИГНАЛ НЕ КЛАССИФИЦИРОВАН",
    "zh": "信号无法归类"
  },
  "error.genericLore": {
    "en": "UPLINK FAILED",
    "de": "UPLINK FEHLGESCHLAGEN",
    "es": "ENLACE ASCENDENTE FALLIDO",
    "fr": "LIAISON MONTANTE EN ÉCHEC",
    "ja": "アップリンク失敗",
    "ko": "업링크 실패",
    "ru": "СБОЙ UPLINK",
    "zh": "上行链路失败"
  },
  "error.genericCode": {
    "en": "Unclassified signal failure",
    "de": "Unklassifizierter Signalfehler",
    "es": "Fallo de señal no clasificado",
    "fr": "Échec de signal non classé",
    "ja": "未分類の信号障害",
    "ko": "분류되지 않은 신호 오류",
    "ru": "Неклассифицированный сбой сигнала",
    "zh": "未分类的信号错误"
  }
});
for (const [key, values] of Object.entries(RENAMES)) {
  for (const [lang, value] of Object.entries(values)) {
    if (MESSAGES[lang]) MESSAGES[lang][key] = value;
  }
}

Object.assign(RENAMES, {
  "help.sharedRules": {
    "en": "One hull. Six attempts.\nClues are declassified as you play.\nGuesses reveal information shared with the target.\nDifferent modes release intel in different ways.",
    "de": "Eine Hülle. Sechs Versuche.\nHinweise werden im Spielverlauf freigegeben.\nEin Tipp deckt Informationen auf, die mit dem Ziel übereinstimmen.\nDie Modi geben Hinweise auf unterschiedliche Weise frei.",
    "es": "Un casco. Seis intentos.\nLas pistas se desclasifican mientras juegas.\nLas respuestas revelan información compartida con el objetivo.\nCada modo libera información a su manera.",
    "fr": "Une coque. Six tentatives.\nLes indices sont déclassifiés au fil du jeu.\nUne proposition révèle les informations partagées avec la cible.\nChaque mode libère les indices à sa façon.",
    "ja": "1つの船体、6回の挑戦。\nプレイに応じてヒントが公開されます。\n回答すると、目標と共通する情報が明らかになります。\nモードごとに情報の公開ペースは異なります。",
    "ko": "선체 1척, 6회 시도.\n플레이하면서 단서가 공개됩니다.\n추측하면 목표와 공유되는 정보가 드러납니다.\n모드마다 정보가 공개되는 방식이 다릅니다.",
    "ru": "Один корпус. Шесть попыток.\nПодсказки раскрываются по ходу игры.\nОтвет показывает сведения, общие с целью.\nВ каждом режиме сведения раскрываются по-своему.",
    "zh": "一艘船，六次尝试。\n线索会随游戏进程逐步解密。\n猜测会揭示与目标相同的信息。\n不同模式的解密节奏不同。"
  },
  "mode.helpNormal": {
    "en": "Standard mode.\nWrong guesses gradually reveal intelligence.\nA correct guess reveals information shared with the target.",
    "de": "Standardmodus.\nFalsche Tipps decken nach und nach Informationen auf.\nEin richtiger Tipp zeigt gemeinsam genutzte Informationen.",
    "es": "Modo estándar.\nLos fallos revelan información poco a poco.\nUn acierto revela información compartida con el objetivo.",
    "fr": "Mode standard.\nLes erreurs révèlent progressivement des informations.\nUne bonne réponse révèle les informations partagées avec la cible.",
    "ja": "スタンダードモード。\n誤答すると少しずつ情報が公開されます。\n正解すると、目標と共通する情報が明らかになります。",
    "ko": "스탠다드 모드.\n오답을 내면 정보가 조금씩 공개됩니다.\n정답을 맞히면 목표와 공유되는 정보가 드러납니다.",
    "ru": "Стандартный режим.\nНеверные ответы постепенно раскрывают сведения.\nВерный ответ показывает информацию, общую с целью.",
    "zh": "标准模式。\n猜错会逐步揭示情报。\n猜中会获得与目标共享的信息。"
  },
  "mode.helpAbyss": {
    "en": "Abyssal mode.\nFittings and attributes are simulated from the killmail.\nRare and specialised hulls are more likely.\nIntelligence unfolds at its own pace.",
    "de": "Abyssmodus.\nFitting und Attribute werden aus dem Killmail simuliert.\nSeltene und spezialisierte Hüllen sind wahrscheinlicher.\nInformationen entfalten sich in ihrem eigenen Tempo.",
    "es": "Modo Abismo.\nLos ajustes y atributos se simulan desde el killmail.\nLos cascos raros y especializados son más probables.\nLa información se despliega a su propio ritmo.",
    "fr": "Mode Abyssal.\nLes fittings et attributs sont simulés depuis le killmail.\nLes coques rares et spécialisées sont plus probables.\nLes informations se dévoilent à leur propre rythme.",
    "ja": "アビサルモード。\n装備と属性はキルメールからシミュレーションされます。\n希少・特殊な船体が選ばれやすくなります。\n情報は独自のペースで公開されます。",
    "ko": "어비설 모드.\n장비와 속성은 킬메일에서 시뮬레이션됩니다.\n희귀·특수 선체가 더 자주 선택됩니다.\n정보는 자체적인 속도로 공개됩니다.",
    "ru": "Режим Бездны.\nМодули и атрибуты симулируются по киллмейлу.\nРедкие и специальные корпуса встречаются чаще.\nСведения раскрываются в своём темпе.",
    "zh": "深渊模式。\n装配与属性根据击杀记录模拟。\n稀有舰船更可能出现。\n情报按自身节奏释放。"
  },
  "mode.helpTimed": {
    "en": "Timed mode.\nThe run starts when you start the timer.\nIntel unfolds on a schedule; guesses do not reveal extra intel.\nName the hull to stop the clock.",
    "de": "Zeitmodus.\nDer Lauf beginnt mit dem Timer.\nInformationen werden nach Zeitplan freigegeben; Tipps geben keine zusätzlichen Hinweise.\nNenne die Hülle, um die Zeit zu stoppen.",
    "es": "Modo cronometrado.\nLa partida empieza al iniciar el cronómetro.\nLa información se revela según el tiempo; los intentos no añaden más.\nAcierta el casco para detener el reloj.",
    "fr": "Mode chronométré.\nLa partie commence au lancement du chrono.\nLes informations se révèlent selon le temps ; les tentatives n’en ajoutent pas.\nTrouvez la coque pour arrêter le chrono.",
    "ja": "タイムモード。\nタイマーを開始するとゲームが始まります。\n情報は時間に沿って公開され、推測では追加されません。\n船体名を当てると計測が止まります。",
    "ko": "타임 모드.\n타이머를 시작하면 게임이 시작됩니다.\n정보는 시간에 따라 공개되며, 추측으로는 추가되지 않습니다.\n선체 이름을 맞히면 타이머가 멈춥니다.",
    "ru": "Режим на время.\nЗабег начинается с запуска таймера.\nСведения раскрываются по времени; ответы не добавляют новых.\nНазовите корпус, чтобы остановить таймер.",
    "zh": "计时模式。\n开始计时后进入游戏。\n情报按时间释放，猜测不会额外揭示。\n猜中船名即可停止计时。"
  }
});
for (const [key, values] of Object.entries(RENAMES)) {
  for (const [lang, value] of Object.entries(values)) {
    if (MESSAGES[lang]) MESSAGES[lang][key] = value;
  }
}

Object.assign(RENAMES, {
  "mode.helpFree": {
    "en": "Free mode.\nOpen a shared killboard link or draw a random target.\nFree runs do not affect daily stats or daily progress.",
    "de": "Free-Modus.\nÖffne einen geteilten Killboard-Link oder ziehe ein zufälliges Ziel.\nFree-Läufe beeinflussen weder Tagesstatistik noch Tagesfortschritt.",
    "es": "Modo Libre.\nAbre un enlace de killboard compartido o elige un objetivo aleatorio.\nLas partidas libres no afectan a las estadísticas ni al progreso diario.",
    "fr": "Mode Libre.\nOuvrez un lien de killboard partagé ou tirez une cible aléatoire.\nLes parties libres n’affectent ni les statistiques ni la progression quotidienne.",
    "ja": "フリーモード。\n共有されたキルボードリンクを開くか、ランダムな目標を選びます。\nフリーのプレイはデイリー統計や進行に影響しません。",
    "ko": "자유 모드.\n공유된 킬보드 링크를 열거나 무작위 목표를 선택합니다.\n자유 모드 플레이는 일일 통계와 진행에 영향을 주지 않습니다.",
    "ru": "Свободный режим.\nОткройте общую ссылку на killboard или выберите случайную цель.\nСвободные забеги не влияют на ежедневную статистику и прогресс.",
    "zh": "自由模式。\n打开共享击杀链接，或随机抽取一个目标。\n自由模式不影响每日统计和每日进度。"
  }
});
for (const [key, values] of Object.entries(RENAMES)) {
  for (const [lang, value] of Object.entries(values)) {
    if (MESSAGES[lang]) MESSAGES[lang][key] = value;
  }
}

for (const [key, values] of Object.entries(MP_MESSAGES)) {
  for (const [lang, value] of Object.entries(values)) {
    if (MESSAGES[lang]) MESSAGES[lang][key] = value;
  }
}
