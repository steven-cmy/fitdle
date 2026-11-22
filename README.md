# FITDLE

FITDLE 是彭德保险（Pend Insurance）理赔评估终端：对照残骸装配单，确认受损舰船的真实型号。它有一个轻量在线服务和一个不计分的练习模式：

- 在线：EVE SSO 登录后玩每日、标准、装配审计、计时，并记录服务端结果；
- 练习：未登录或后端不可用时玩标准、装配审计、计时，不计分；
- 联机：登录后创建房间，房主选择玩法；当前支持标准/装配审计/计时竞速和仲裁复核（Arbitration）；
- 8 种界面语言；Photon UI 风格；服务端权威联机，无第三方信令或远程字体依赖。

## 自编译与自托管

### 环境要求

- Node.js 24 或更新版本
- npm
- Git
- 可访问 `sde.evetech.net`、`zkillboard.com`、`esi.evetech.net` 和 npm registry
- EVE 开发者应用（在线登录需要 client id/secret 和已注册的回调 URL）

### 首次构建

```bash
git clone https://gitlab.com/cmy/fitdle.git
cd fitdle
cp .env.example .env
# 编辑 .env 的“部署必需”区块
npm install
npm run prepare:sde
npm run build:catalog
npm run build:killpool
npm run build:weights -- --refresh
npm run build
npm test
```

`prepare:sde` 通过官方 SDE HTTP API 下载所需表，并把它们归一化到 `.cache/`。它不再下载或解压 zip，也不依赖 `tar`/`unzip`。

第一次 `npm run build:catalog` 用 SDE 生成 `data/catalog.json`；`build:killpool` 和
`build:weights` 都需要读取 catalog，因此权重和击杀池准备好后再执行一次 `npm run build`。

### 本地预览

```bash
npm start
```

默认静态预览地址为 `http://127.0.0.1:4173/`。没有在线服务时只能进入练习模式。

### 在线服务

在线服务是独立的 Node 进程，复用 `js/` 中的谜题引擎并提供 EVE SSO、在线目标、统计和房间：

```bash
npm install --prefix server
npm run build
npm run test:server
npm run server:start
```

服务读取仓库根目录的 `.env`，同时提供 `dist/`、`/api` 和 `/ws`。监听地址由 `PORT`/`HOST`
决定；默认 `8787`。用户访问的对外地址由 `PUBLIC_ORIGIN` 决定。

如果只部署 `dist/` 到静态托管，站点只能作为练习模式运行。完整在线/联机功能需要这个 Node 服务。

## 配置

复制 `.env.example` 为 `.env`。环境变量优先于 `.env`；`.env` 不提交。

### 1. 部署必需

```dotenv
PUBLIC_ORIGIN=https://fitdle.example.com
EVE_CLIENT_ID=...
EVE_CLIENT_SECRET=...
SESSION_SECRET=...
```

- `PUBLIC_ORIGIN`：用户实际访问的完整站点源，必须与 EVE 应用注册的回调 URL 主机一致，不要以 `/` 结尾。
- `API_ORIGIN`：仅前后端分离部署时设置；同域部署留空。
- `EVE_CLIENT_ID` / `EVE_CLIENT_SECRET`：EVE 开发者应用凭据；secret 只放服务端。
- `SESSION_SECRET`：随机会话/签名密钥。生成示例：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

以下值自动派生，不再单独配置：

| 派生项 | 规则 |
|---|---|
| OAuth 回调 | `${API_ORIGIN || PUBLIC_ORIGIN}/api/v1/auth/eve/callback` |
| 分享页/OG/canonical | `PUBLIC_ORIGIN` |
| 同域 API base | 空 |
| 分离 API base | `API_ORIGIN` |
| Cookie Secure | API origin 为 HTTPS |
| CORS | 分离部署时允许 `PUBLIC_ORIGIN`；同域不需要 |

因此**单域名部署只需要配置 `PUBLIC_ORIGIN`**，不需要再写 redirect URI、`SITE_URL`、`COOKIE_SECURE` 或 `ALLOWED_ORIGINS`。

### 2. 高级玩法设置

这些参数控制线索揭示节奏和目标 KB 时间权重。除非明确知道影响，否则保持默认值。修改后必须重新构建才会生效；揭示配置写入 `manifest.reveal`，KB 配置写入 manifest 顶层。

```dotenv
FITDLE_GAME_DAY_START_UTC=11:00
FITDLE_KB_SELECTION_START_DATE=2012-05-22
FITDLE_KB_RECENCY_HALF_LIFE_DAYS=365
FITDLE_KB_MAX_SCAN_PAGES=20
FITDLE_REVEAL_OPENING_BUDGET=9
FITDLE_REVEAL_OPENING_MAX_WEIGHT=13
FITDLE_REVEAL_OPENING_MIN_CLUES=3
FITDLE_REVEAL_OPENING_MAX_CLUES=7
FITDLE_REVEAL_CANDIDATE_FLOOR=6
FITDLE_REVEAL_QUEUE_WEIGHT_POWER=1.8
FITDLE_REVEAL_STANDARD_EQUIPMENT_BASE=4
FITDLE_REVEAL_STANDARD_EQUIPMENT_MAX=9
FITDLE_REVEAL_STANDARD_EQUIPMENT_DIVISOR=8
FITDLE_REVEAL_STANDARD_CARGO_BUDGET=6
FITDLE_REVEAL_AUDIT_EQUIPMENT_PER_MISS=1
FITDLE_REVEAL_AUDIT_OTHER_BASE=1
FITDLE_REVEAL_AUDIT_SHORTFALL_DIVISOR=2
FITDLE_REVEAL_AUDIT_CARGO_DIVISOR=10
```

无效值会让构建直接失败，不会悄悄回退到运行时的不同默认值。

### 3. 服务运行与基础设施

```dotenv
PORT=8787
HOST=0.0.0.0
# DATABASE_PATH=.cache/fitdle-online.sqlite
# STATIC_DIR=dist
ROOM_MAX_PLAYERS=8
ROOM_ARBITRATION_BIG_ROUNDS=1
ROOM_ARBITRATION_MAX_BIG_ROUNDS=5
ROOM_TIMED_DURATION_MINUTES=10
ROOM_TIMED_MAX_DURATION_MINUTES=60
FITDLE_DEV_AUTH=0
EVE_SDE_BASE=https://sde.evetech.net/tranquility
# EVE_SSO_METADATA_URL=https://login.eveonline.com/.well-known/oauth-authorization-server
# LOG_LEVEL=info
```

- `ROOM_MAX_PLAYERS`：联机房间总席位上限，默认 `8`，允许 `2..32`。席位包括观战和离线玩家；已有玩家重连不会新增席位。Arbitration 建议不要超过 16。
- `ROOM_ARBITRATION_BIG_ROUNDS`：Arbitration 默认大轮数（所有玩家各当一次庄家），默认 `1`。
- `ROOM_ARBITRATION_MAX_BIG_ROUNDS`：房主可设置的 Arbitration 大轮上限，默认 `5`。
- `ROOM_TIMED_DURATION_MINUTES`：Timed 房间默认时限（分钟），默认 `10`。
- `ROOM_TIMED_MAX_DURATION_MINUTES`：Timed 房间可设置的时间上限，默认 `60`。
- `PORT` 是服务监听端口；如果没有反向代理，它需要和 `PUBLIC_ORIGIN` 的端口一致。
- `HOST` 是监听地址；容器通常使用 `0.0.0.0`，仅本机调试可用 `127.0.0.1`。
- `DATABASE_PATH` 默认在 `.cache/`；容器部署建议指向持久化卷。
- `STATIC_DIR` 是服务提供的静态目录，默认 `dist`。
- `FITDLE_DEV_AUTH=1` 仅用于本地浏览器测试，生产必须为 `0`。
- `EVE_SDE_BASE` 默认官方 SDE API；一般不需要改。
- `EVE_SSO_METADATA_URL` 可覆盖 SSO 元数据地址；默认官方地址，通常留空。
- `LOG_LEVEL` 控制服务日志级别；默认 `info`。

每个高级玩法变量（`FITDLE_KB_*`、`FITDLE_REVEAL_*`）的独立说明见 `.env.example`；修改后必须重新构建。

## EVE SSO 应用配置

在 [EVE Developer Portal](https://developers.eveonline.com/) 登录后进入 **Applications → Create New Application**，按当前 [SSO 文档](https://developers.eveonline.com/docs/services/sso/) 配置：

1. 填写 Name 和 Description。
2. Connection Type 选择 **Authentication & API Access**。
3. Permissions 只勾选 **publicData**。FITDLE 只使用角色名作为账号键，不请求资产、邮件、位置等 scope。
4. Callback URL 精确填写：

```text
${API_ORIGIN || PUBLIC_ORIGIN}/api/v1/auth/eve/callback
```

例如本地测试：

```text
http://127.0.0.1:8790/api/v1/auth/eve/callback
```

生产环境使用 HTTPS 域名，不要使用 localhost。回调 URL 必须与应用注册完全一致，包括路径和末尾斜杠。

5. 创建后复制 Client ID 和 Client Secret 到 `.env`。

补充说明：

- EVE 当前文档将服务端 Web 应用（confidential）与移动/桌面 PKCE 应用区分。FITDLE 是服务端 Web 应用，保留 client secret，并同时使用 `state` + PKCE。
- 授权端点、token 端点和 JWKS 从 `https://login.eveonline.com/.well-known/oauth-authorization-server` 获取；服务端不会硬编码 token 地址。
- 修改应用 scopes 会使已有 refresh token 失效，需要重新授权登录。
- 读取角色名与角色 ID；角色 ID 仅用于渲染官方头像，账号仍以角色名为键，不合并小号。未登录用户不会产生在线积分。
- 官方 SSO 登录按钮资源见 [Single Sign-On 文档](https://developers.eveonline.com/docs/services/sso/#log-in-with-eve-online-buttons)。

## 更新数据

```bash
# 官方 SDE HTTP API（强制检查最新 release）
npm run update:sde
npm run build:killpool
npm run build

# zKillboard 船型使用频率
npm run build:weights -- --refresh
npm run build

# 装配审计 dogma 引擎
npm run update:dogma
npm run build
```

SDE 缓存位于：

```text
.cache/sde-source/*.jsonl
.cache/sde-meta.json
.cache/normalized.json
```

`check:sde-cache` 会比较本地 release 和官方 latest；如果只是网络失败，会保留完整旧缓存继续构建。

更新后建议执行 `npm test`，并手动打开一次装配审计模式确认装配模拟正常。

## 部署到静态托管

`dist/` 可以直接放到任何静态托管服务，但这时只有练习模式，没有登录、在线计分或联机房间。分享页的 Open Graph 绝对地址来自 `PUBLIC_ORIGIN`；如果使用 GitLab Pages，CI 会回退到 `CI_PAGES_URL`。

```bash
PUBLIC_ORIGIN=https://your-domain.example npm run build
```

## 容器部署

仓库只提供一个 all-in-one 服务镜像：构建阶段生成 SDE 数据和 `dist/`，运行阶段同时提供静态站点、`/api` 和 `/ws`。旧的一次性构建器镜像已正式弃用并停止发布。

容器构建需要访问官方 SDE、zKillboard、ESI 和 npm registry，耗时取决于网络。

### 构建与运行

```bash
docker build \
  --build-arg PUBLIC_ORIGIN=https://fitdle.example.com \
  -t fitdle:local .

docker run -d \
  --name fitdle \
  --restart unless-stopped \
  --env-file .env \
  -e PORT=8787 \
  -p 8787:8787 \
  -v fitdle-data:/data \
  fitdle:local
```

`PUBLIC_ORIGIN` 是构建参数，也是运行变量：构建期决定分享页/OG 地址，运行期决定 OAuth 回调和 Cookie。`EVE_CLIENT_ID`、`EVE_CLIENT_SECRET`、`SESSION_SECRET` 只在运行时通过 `--env-file` 注入，不会打进镜像。

部署用的 `.env` 中 `PORT` 应为 `8787`；本地测试 `.env` 可以使用 `8790`，通过上面的 `-e PORT=8787` 覆盖容器监听端口，同时保持 `PUBLIC_ORIGIN` 指向容器外部实际地址。

`/data` 保存 SQLite 数据库，请使用 named volume 或专用挂载目录。容器内默认：

```text
PORT=8787
HOST=0.0.0.0
STATIC_DIR=dist
DATABASE_PATH=/data/fitdle.sqlite
```

访问 `http://<宿主机>:8787/`。健康检查：

```bash
curl http://127.0.0.1:8787/api/v1/health
```

更新时重新构建镜像并替换容器；保留 `/data` 卷。

### 反向代理

生产环境建议在反向代理后使用 HTTPS，并把 `PUBLIC_ORIGIN` 设置为外部 HTTPS 地址。服务端根据 `PUBLIC_ORIGIN` 推导安全 Cookie 和 OAuth 回调；`PORT` 只是内部监听端口。

## 鸣谢

- **Fenris Creations（原 CCP hf.）**：EVE Online、官方 SDE、ESI、舰船与装备图片、官方本地化文本。
- **zKillboard**：击杀、装配、损失价值、使用率与样本 KB 数据。
- **EVEShip.fit**：装配审计模式使用的 dogma-engine 与配套 SDE。
- **EVE 社区与字体作者**：EVE Sans、Triglavian 字体及社区工具与资料。

本项目是非官方、非商业粉丝作品，与 Fenris Creations、CCP 和 zKillboard 均无隶属关系。

## 版权与许可

- EVE Online、EVE 标志、舰船模型、图标、名称、描述及相关知识产权归 **Fenris Creations** 所有。
- **彭德保险集团（Pend Insurance）** 与 **商业安全委员会（Secure Commerce Commission）** 的名称、标志及相关权利同样归 **Fenris Creations** 所有。
- FITDLE 是**非官方、非商业粉丝作品**，与 Fenris Creations、CCP 及 zKillboard 均无隶属关系，也未获其认可或赞助。
- zKillboard 数据归其各自所有者所有。
- FITDLE 源代码以 **MIT License** 发布；EVE 相关素材不包含在 MIT 授权范围内。

完整声明见 [NOTICE.md](NOTICE.md) 与 [LICENSE](LICENSE)。
