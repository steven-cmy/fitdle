# FITDLE

**v0.3.14**

FITDLE 是一个纯前端、无需登录的 EVE Online 每日击杀谜题。每天有一个目标击杀，
玩家通过逐步揭示的装配、属性和 zKillboard 情报识别被击毁的舰船。

- 普通、深渊、自由和计时模式；
- 8 种官方语言；
- 分享链接不剧透答案；
- 无需后端、账号或数据库，数据和进度只保存在浏览器本地。

## 自编译与自托管

### 环境要求

- Node.js 20 或更新版本
- npm
- Git

### 首次构建

```bash
git clone https://gitlab.com/cmy/fitdle.git
cd fitdle
npm install
npm run prepare:sde
npm run build:killpool
npm run build
npm run build:weights -- --refresh
npm run build
npm test
```

第一次 `npm run build` 用于生成 catalog，`build:weights` 需要读取它，因此权重准备好后
需要再执行一次 `npm run build`。

### 本地预览

```bash
npm start
```

默认地址为 `http://127.0.0.1:4173/`。部署时只需要发布 `dist/` 目录。

### 部署到静态托管

`dist/` 可以直接放到任何静态托管服务。为了让分享预览里的 Open Graph 图片使用正确域名，
构建时设置：

```bash
SITE_URL=https://your-domain.example npm run build
```

如果使用 GitLab Pages，CI 会自动使用 `CI_PAGES_URL`。自定义域名需要显式传入
`SITE_URL`。

### 更新数据

```bash
# 官方 SDE
npm run update:sde
npm run build:killpool
npm run build

# zKillboard 船型使用频率
npm run build:weights -- --refresh
npm run build

# 深渊 dogma 引擎
npm run update:dogma
npm run build
```

更新后建议执行 `npm test`，并手动打开一次深渊模式确认装配模拟正常。

## 鸣谢

- **Fenris Creations（原 CCP hf.）**：EVE Online、官方 SDE、ESI、舰船与装备图片、
  官方本地化文本。
- **zKillboard**：击杀、装配、损失价值、使用率与样本 KB 数据。
- **EVEShip.fit**：深渊模式使用的 dogma-engine 与配套 SDE。
- **EVE 社区与字体作者**：EVE Sans、Triglavian 字体及社区工具与资料。

本项目是非官方、非商业粉丝作品，与 Fenris Creations、CCP 和 zKillboard 均无隶属关系。

## 版权与许可

- EVE Online、EVE 标志、舰船模型、图标、名称、描述及相关知识产权归
  **Fenris Creations** 所有。
- zKillboard 数据归其各自所有者所有。
- FITDLE 源代码以 **MIT License** 发布；EVE 相关素材不包含在 MIT 授权范围内。

完整声明见 [NOTICE.md](NOTICE.md) 与 [LICENSE](LICENSE)。
