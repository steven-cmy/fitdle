# FITDLE i18n glossary

Order of authority: official EVE wording of each language, then the usage of that
language's player community, then our own translation. When sources disagree, the
English wording decides. Memes of one language are not translated. Departments, memos
and roles are the project's own fiction; they may only use things that exist in EVE.

## Official names

Read from CCP's Static Data Export (build 3724492 and the release of 2026-11-24).

| English | zh | de | es | fr | ja | ko | ru | Source |
|---|---|---|---|---|---|---|---|---|
| Pend Insurance | 彭德保险 | Pend Insurance | Pend Insurance | Pend Insurance | ペンド保険会社 | 펜드 보험사 | Pend Insurance | SDE npcCorporation 1000113 |
| Secure Commerce Commission | 商业安全委员会 | Secure Commerce Commission | Comisión de Comercio Seguro | Secure Commerce Commission | 通商保護委員会 | 안전무역위원회 | Secure Commerce Commission | SDE npcCorporation 1000132 |
| High Slots | 高能量槽 | High Slots | Ranuras superiores | Emplacements haute puissance | ハイパワースロット | 하이 슬롯 | Разъёмы большой мощности | SDE attribute hiSlots |
| Medium Slots | 中能量槽 | Medium Slots | Ranuras medias | Emplacements intermédiaires | ミディアムスロット | 미디움 슬롯 | Разъёмы средней мощности | SDE attribute medSlots |
| Low Slots | 低能量槽 | Low Slots | Ranuras inferiores | Emplacements basse puissance | ローパワースロット | 로우 슬롯 | Разъемы малой мощности | SDE attribute lowSlots |
| Rig Slots | 改装件安装座 | Modifikationsslots | Ranuras de complementos | Emplacements d'optimisation | リグスロット | 리그 슬롯 | Разъёмы для модификаторов | SDE attribute rigSlots |
| Turret Hardpoints | 炮台安装数 | Montageplätze für Geschütztürme | Puntos montaje torreta | Points de fixation de tourelle | タレットハードポイント | 터렛 슬롯 | Точки монтажа орудийных установок | SDE attribute turretSlotsLeft |
| Launcher Hardpoints | 发射器安装数 | Montageplätze für Werfer | Puntos montaje lanzador | Points de fixation pour lanceur | ランチャーハードポイント | 런처 슬롯 | Точки монтажа пусковых установок | SDE attribute launcherSlotsLeft |
| Maximum Velocity | 最大速度 | Maximalgeschwindigkeit | Velocidad máxima | Vitesse maximale | 最高速度 | 최대 속도 | Максимальная скорость | SDE attribute maxVelocity |
| Signature Radius | 信号半径 | Signaturradius | Radio señal | Rayon de signature | シグネチャ半径 | 시그니처 반경 | Радиус сигнатуры | SDE attribute signatureRadius |
| Shield Capacity | 护盾容量 | Schildkapazität | Capacidad del escudo | Capacité du bouclier | シールド容量 | 실드량 | Запас прочности щитов | SDE attribute shieldCapacity |
| Armor Hitpoints | 装甲值 | Panzerung-HP | Vida blindaje | PV du blindage | アーマーヒットポイント | 장갑 내구도 | Запас прочности брони | SDE attribute armorHP |
| Structure Hitpoints | 结构值 | HP der Struktur | Vida estructura | PV de la structure | ストラクチャのヒットポイント | 내구도 | Запас прочности корпуса | SDE attribute hp |
| Capacitor Capacity | 电容容量 | Energiespeichergröße | Capacidad condensador | Charge de capaciteur | キャパシタ容量 | 캐패시터 용량 | Ёмкость накопителя | SDE attribute capacitorCapacity |
| Powergrid Output | 能量栅格输出 | Stromnetzleistung | Rendimiento sistema potencia | Puissance du réseau d'alimentation | パワーグリッド出力 | 파워그리드 | Мощность реактора | SDE attribute powerOutput |
| CPU Output | CPU输出 | CPU-Leistung | Rendimiento CPU | Puissance CPU | CPU 出力 | CPU | Мощность ЦПУ | SDE attribute cpuOutput |
| Calibration | 校准值 | Kalibrierung | Calibración | Étalonnage | キャリブレーション | 교정치 | Калибровка | SDE attribute upgradeCapacity |
| Maximum Targeting Range | 锁定范围上限 | Max. Zielaufschaltungsreichweite | Distancia-objetivo máxima | Portée maximale du système de ciblage | 最大ターゲット範囲 | 최대 타겟팅 거리 | Максимальная дальность захвата целей | SDE attribute maxTargetRange |
| Scan Resolution | 扫描分辨率 | Scanauflösung | Resolución escaneo | Résolution du balayage | スキャン分解能 | 스캔 정밀도 | Разрешающая способность системы захвата целей | SDE attribute scanResolution |
| Maximum Locked Targets | 目标锁定数上限加成 | Maximal erfassbare Ziele | Objetivos fijados máximos | Cibles verrouillées maximum | 最大ターゲットロック数 | 최대 타겟 수 | Максимальное количество захваченных целей | SDE attribute maxLockedTargets |
| Shield recharge time | 护盾回充时间 | Schildladezeit | Tiempo carga escudo | Temps de recharge du bouclier | シールドリチャージ時間 | 실드 충전 시간 | Влияние на время регенерации щитов | SDE attribute shieldRechargeRate |
| Drone Capacity | 无人机容量 | Drohnenkapazität | Capacidad drones | Capacité du hangar à drones | ドローン収容量 | 드론 적재량 | Объём отсека для дронов | SDE attribute droneCapacity |
| RADAR Sensor Strength | 雷达感应强度 | RADAR-Sensorstärke | Intensidad sensor radar | Puissance de détection radar | 電波センサー強度 | 레이더 센서 강도 | Эффективность радарной системы | SDE attribute scanRadarStrength |
| Ladar Sensor Strength | 光雷达感应强度 | Ladar-Sensorstärke | Intensidad sensor lidar | Puissance de détection ladar | 光学センサー強度 | 라이다 센서 강도 | Эффективность ладарной системы | SDE attribute scanLadarStrength |
| Magnetometric Sensor Strength | 磁力感应强度 | Magnetometrische Sensorstärke | Intensidad sensor magnetométrico | Puissance de détection magnétométrique | 磁気センサー強度 | 자기장 센서 강도 | Эффективность магнитометрической системы | SDE attribute scanMagnetometricStrength |
| Gravimetric Sensor Strength | 引力感应强度 | Gravimetrische Sensorstärke | Intensidad sensor gravimétrico | Puissance de détection gravimétrique | 重力センサー強度 | 중력장 센서 강도 | Эффективность гравиметрической системы | SDE attribute scanGravimetricStrength |
| Tech Level | 科技等级 | Tech-Level | Nivel de tecnología | Niveau technologique | テックレベル | 테크 레벨 | Техуровень | SDE attribute techLevel |
| Fighter Squadron Launch Tubes | 铁骑舰载机中队发射管 | Jägerstaffel-Startrohre | Tubos de lanzamiento de escuadrones de cazas | Tubes de lancement des escadrons de chasseurs | 戦闘機部隊離陸用トンネル | 파이터 편대 사출관 | Взлётные полосы истребителей | SDE attribute fighterTubes |
| Fighter Hangar Capacity | 铁骑舰载机挂舱容量 | Jägerhangarkapazität | Capacidad del hangar de cazas | Capacité du hangar de chasseur | 戦闘機ハンガー容量 | 파이터 격납고 크기 | Объём отсека для истребителей | SDE attribute fighterCapacity |
| Fuel Bay Capacity | 燃料舱容量 | Fassungsvermögen des Hangars für Treibstoffe | Capacidad del almacén de combustible | Capacité de la cuve de carburant | 燃料ベイの容量 | 연료실 적재량 | Вместимость топливного отсека | SDE attribute specialFuelBayCapacity |
| Officer | 官员 | Offizier | Oficial | Officier | 士官 | 장교급 | Командирские | SDE metaGroups |
| Abyssal | 深渊 | Abgrund | Abisal | Abîme | アビサル | 어비설 | Бездна | SDE metaGroups |
| Wreck | 残骸 | Wrack | Restos | Épave | 残骸 | 잔해 | Обломки корабля | SDE group 186 |
| Salvager | 打捞器 | Bergungsmodul | Recuperador | Récupérateur | サルベージャー | 샐비저 | Демонтажная установка | SDE group 1122 |
| Tractor Beam | 牵引光束 | Traktorstrahl | Rayo tractor | Rayon de tractage | トラクタービーム | 트랙터 빔 | Гравизахват | SDE group 650 |
| Mobile Tractor Unit | 移动式牵引装置 | Mobile Traktorstrahl-Einheit | Unidad tractora móvil | Unité de tractage mobile | 移動式トラクターユニット | 이동식 트랙터 장치 | Автономный блок сбора трофеев | SDE group 1250 |
| Capsule | 太空舱 | Kapsel | Cápsula | Capsule | カプセル | 캡슐 | Капсула | SDE group 29 |
| Corvette | 轻型护卫舰 | Corvette | Corbeta | Corvette | コルベット艦 | 코르벳 | Корветы | SDE group 237 |
| Freighter | 货舰 | Frachter | Carguero | Transport de fret | 超大型輸送艦 | 프레이터 | Фрейтер | SDE group 513 |
| Jump Freighter | 战略货舰 | Sprung-Frachter | Carguero de salto | Transport de fret hyperspatial | ジャンプドライブ搭載型輸送艦 | 점프 프레이터 | Джамп-фрейтер | SDE group 902 |
| Smart Bomb | 立体炸弹 | Smart Bomb | Bomba inteligente | Bombe de proximité | スマートボム | 스마트폭탄 | Импульсный излучатель | SDE group 72 |
| Warp Core Stabilizer | 跃迁稳定器 | Warpkern-Stabilisator | Estabilizador del núcleo de warp | Stabilisateur du réacteur de warp | ワープコア制御装置 | 워프 코어 안정기 | Стабилизатор квантового ядра | SDE group 315 |
| Shield Extender | 护盾扩展装置 | Schilderweiterung | Extensor de escudo | Extenseur de bouclier | シールドエクステンダー | 실드 확장장치 | Расширитель щита | SDE group 38 |
| Armor Plate | 装甲附甲板 | Panzerplatte | Placa de blindaje | Revêtement de blindage | アーマープレート | 장갑 플레이트 | Бронеплита | SDE group 329 |
| Cynosural Field Generator | 诱导力场发生器 | Cynosural Field Generator | Generador de campo cinosural | Générateur de champ cynosural | サイノシュラルフィールド・ジェネレーター | 사이노슈럴 필드 생성기 | Приводной маяк | SDE group 658 |
| Stasis Web | 能量滞停光束网 | Stasis Web | Red ralentizadora | Stase | ステイシスウェブ | 스테이시스 웹 생성기 | Генератор стазис-поля | SDE group 65 |
| Drake | 幼龙级 | Drake | La Drake | Drake | ドレイク | 드레이크 | Drake | SDE type 24698 |
| PLEX | 伊甸币 | PLEX | PLEX | PLEX | PLEX | PLEX | PLEX | SDE type 44992 |
| Quafe | 酷菲 | Quafe | Quafe | Quafe | クァフェ | 퀘이프 | Quafe | SDE type 3699 |
| Frozen Corpse | 冰冻的尸体 | Frozen Corpse | Cuerpo congelado | Cadavre gelé | 凍結した死体 | 얼어붙은 사체 | Frozen Corpse | SDE type 10041 |
| Frozen Food | 冷藏食品 | Frozen Food | Comida congelada | Nourriture congelée | 冷凍食品 | 냉동 식품 | Frozen Food | SDE type 3715 |
| Plastic Wrap | 包装塑料 | Plastic Wrap | Envoltura de plástico | Emballage plastique | プラスチックラップ | 플라스틱 랩 | Plastic Wrap | SDE type 3468 |
| Tripped Power Circuit | 堆砌的能源电路 | Tripped Power Circuit | Circuito eléctrico activado | Circuit d'alimentation disjoncté | 壊れたパワー回路 | 마모된 전력 회로 | Tripped Power Circuit | SDE type 25598 |
| Kill report - Victim | 击毁报告 - 受害者 | Abschussbericht - Opfer | Informe de muertes: víctima | Rapport de victime – Victime | キルレポート（犠牲者） | 킬 기록 - 피해자 | Отчёт о победе — жертва | SDE notification KillReportVictim |
| Kill report - Final blow | 击毁报告 - 最后一击 | Abschussbericht - Finaler Abschuss | Informe de muertes: golpe definitivo | Rapport de victimes – explosion finale | キルレポート（最終攻撃） | 킬 기록 - 결정타 | Отчёт о победе — последний выстрел | SDE notification KillReportFinalBlow |
| Insurance Payment | 保险支付 | Versicherungszahlung | Pago del seguro | Remboursement de l'assurance | 保険金の支払い | 보험 비용 | Выплачена сумма по страховке | SDE notification InsurancePayoutMsg |
| Insurance Invalidated | 保险无效 | Versicherung annulliert | Seguro invalidado | Contrat d'assurance invalidé | 無効な保険 | 보험 무효화 | Страховой контракт аннулирован | SDE notification InsuranceInvalidatedMsg |
| Corvette Replacement | 轻型护卫舰补给 | Ersatz-Corvette | Reemplazo de corbeta | Remplacement de corvette | コルベット艦の交換 | 대체용 코르벳 | Замена корвета | SDE notification InsuranceFirstShipMsg |
| Kill Right Available | 击毁权可用 | Abschussfreigabe verfügbar | Derecho de asesinato disponible | Permis de détruire disponible | 殺害許可有効 | 사살권 사용 가능 | Ваша ликвидация: доступ открыт | SDE notification KillRightAvailable |
| Clone Activation | 克隆激活 | Klonaktivierung | Activación de clon | Activation de clone | クローンの起動 | 클론 활성화 | Пробуждение клон-тела | SDE notification CloneActivationMsg2 |
| Jump Clone Deleted | 远距克隆被删除 | Sprungklon gelöscht | Clon de salto eliminado | Clone interstellaire supprimé | 削除されたジャンプクローン | 점프 클론 삭제됨 | Джамп-клон удалён | SDE notification JumpCloneDeletedMsg1 |
| Contract Collateral | 合同保证金 | Vertrag - Sicherheit | Garantía de contrato | Caution du contrat | 契約担保金 | 계약 담보금 | Залог за контракт | SDE accounting contract_collateral |
| Brokers Fee | 经纪人中介费 | Maklergebühr | Comisión | Frais de courtage | ブローカー料 | 중개인 수수료 | Гонорар брокера | SDE accounting brokers_fee |
| Player Donation | 玩家捐助 | Spieler-Spende | Donación de jugador | Don des joueurs | プレイヤーの寄付 | 플레이어 기부 | Сделанное игроком пожертвование | SDE accounting player_donation |

## Official wording found in descriptions and services

| English | zh | de | es | fr | ja | ko | ru | Source |
|---|---|---|---|---|---|---|---|---|
| CONCORD | 统合部 | CONCORD | CONCORD | CONCORD | CONCORD | CONCORD | CONCORD | SDE npcCorporation 1000125; zh short form as in item descriptions |
| Jita / Uedama / Tama | 吉他 / 犹达玛 / 塔玛 | Jita / Uedama / Tama | Jita / Uedama / Tama | Jita / Uedama / Tama | ジタ / ウエダマ / タマ | 지타 / 우에다마 / 타마 | Jita / Uedama / Tama | SDE mapSolarSystems |
| Corporation | 军团 | Corporation | corporación | corporation | コーポレーション | 코퍼레이션 | корпорация | SDE notifications, item descriptions |
| Alliance | 联盟 | Allianz | alianza | alliance | アライアンス | 얼라이언스 | альянс | SDE notifications |
| Capsuleer | 克隆飞行员 | Kapselpilot | capsulista | capsulier | カプセラ | 캡슐리어 | капсулёр | SDE item descriptions |
| Hull | 船体 | Rumpf | casco | coque | 船体 | 선체 | корпус | SDE item descriptions (zh 船体 1266 uses, 舰体 20) |
| Cargo hold | 货柜舱 | Frachtraum | bodega | soute | カーゴホールド | 화물실 | трюм | SDE item descriptions |
| Module | 装备 | Modul | módulo | module | モジュール | 모듈 | модуль | SDE item descriptions |
| Fitting | 装配 | Ausrüstung | equipamiento | équipement | 装備 | 피팅 | оснащение | SDE stationServices 17 |
| Role Bonus | 特有加成 | Funktionsbonus | bonificación por función | bonus de rôle | 性能ボーナス | 역할 보너스 | особенности проекта | SDE subsystem descriptions |
| Drone bay | 无人机挂舱 | Drohnenhangar | muelle de drones | hangar à drones | ドローンベイ | 드론 격납고 | отсек для дронов | SDE item descriptions |
| Implant | 植入体 | Implantat | implante | implant | インプラント | 임플란트 | имплантат | SDE item descriptions |
| Jump clone | 远距克隆 | Sprungklon | clon de salto | clone interstellaire | ジャンプクローン | 점프 클론 | джамп-клон | SDE notifications |
| Low security | 低安 | Niedersicherheitsraum | seguridad baja | basse sécurité | ローセキュリティ | 로우 시큐리티 | лоусеки (community) | SDE item descriptions |

## Community and own wording

| English | zh | de | es | fr | ja | ko | ru | Source |
|---|---|---|---|---|---|---|---|---|
| Claims Assessor | 理赔评估员 | Schadenssachbearbeiter | perito de siniestros | expert en sinistres | 損害査定員 | 손해사정인 | оценщик убытков | project role, own wording |
| Claim (insurance) | 案卷 / 理赔 | Akte / Anspruch | expediente | dossier | 案件 / 請求 | 청구건 | дело | own wording; ja クレーム means a complaint, so it is avoided |
| Local | LOCAL | LOCAL | LOCAL | LOCAL | LOCAL | LOCAL | LOCAL | EVE channel name, kept as the room label |
| Subspace Communication Beacon | 亚空间通讯信标 | Subraum-Kommunikationsbake | baliza de comunicaciones subespaciales | balise de communication subspatiale | サブスペース通信ビーコン | 아공간 통신 비컨 | маяк подпространственной связи | client message for wormhole Local; wording approved by the project |
| SRP, FC, doctrine, fit, ping, TiDi, KB | SRP、FC、制式、装配、集结令、时间膨胀、KB | SRP, FC, Doktrin, Fit, Ping, TiDi, KB | SRP, FC, doctrina, ping, TiDi, KB | SRP, FC, doctrine, ping, TiDi, KB | SRP、FC、ドクトリン、TiDi、KB | SRP, FC, 독트린, 핑, TiDi, KB | SRP, ФК, доктрина, фит, пинг, TiDi, KB | community usage |
| Drake (SRP memos) | 幼龙 | Drake | Drake | Drake | ドレイク | 드레이크 | Drake | zh community short form; the ship name elsewhere is 幼龙级 |
| Host / Dealer / Spectator | 房主 / 庄家 / 观战 | Host / Geber / Zuschauer | anfitrión / repartidor / espectador | hôte / donneur / spectateur | ホスト / ディーラー / 観戦者 | 호스트 / 딜러 / 관전자 | хост / дилер / наблюдатель | room roles, own wording |
| Standard / Audit / Timed / Arbitration | 标准 / 审计 / 计时 / 仲裁复核 | Standard / Audit / Zeit / Schiedsverfahren | estándar / auditoría / crono / arbitraje | standard / audit / chrono / arbitrage | 標準 / 監査 / タイム / 仲裁 | 표준 / 감사 / 타임 / 중재 | стандарт / аудит / на время / арбитраж | gameplay names, own wording |
| Trainee review (practice) | 见习评估 | Praktikum | prácticas | entraînement | 研修査定 | 수습 검토 | стажировка | own wording |

## Ambiguous or deliberate

- Pend Insurance: the corporation record says 彭德保险; one item description (Log
  Fragment 7) says 彭德保险集团. Russian uses the English name in the corporation
  record and «Купол» in that item. The corporation record wins.
- Kill report: notification names differ per language (es "informe de muertes", ru
  "отчёт о победе"). English keeps "killmail", as zKillboard and the community do.
- Insurance payment: ko 보험 비용 reads as a cost; the interface uses 보험금.
- Hull: de also uses "Hülle" in descriptions; the interface uses "Rumpf" throughout.
- German, Russian and partly French/Spanish SDE keep many item names in English. Those
  names stay English (Tripped Power Circuit, Frozen Corpse, Plastic Wrap).
- The SCC abbreviation is CCS in Spanish (corporation description).

## Rules

- New icons, badges, decorative effects and non-Photon visual treatments require
  explicit user approval.
- Correct findings here before release.
