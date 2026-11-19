# FITDLE

**v0.4.33**

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
npm run build:catalog
npm run build:killpool
npm run build:weights -- --refresh
npm run build
npm test
```

第一次 `npm run build:catalog` 用 SDE 生成 `data/catalog.json`；`build:killpool` 和
`build:weights` 都需要读取 catalog，因此权重和击杀池准备好后再执行一次 `npm run build`。

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

## 容器部署

仓库提供两种容器用法：单容器直接提供网站，以及适合定时任务的一次性全量构建容器。
容器构建阶段需要访问官方 SDE、zKillboard 和 npm registry，耗时取决于网络和 zKillboard
的响应速度。

### 方案一：单容器 All-in-One

镜像在构建阶段完成 SDE、击杀池、使用率权重和 `dist/` 的生成，运行阶段只包含静态产品和
一个零依赖 Node 静态服务器。启动容器并映射端口即可访问，不需要额外挂载数据卷。

```bash
# 在仓库根目录构建；把 SITE_URL 换成实际对外地址
docker build \
  --build-arg SITE_URL=https://fitdle.example.com \
  -t fitdle:local .

# 容器内监听 4173，映射到宿主机 8080
docker run -d \
  --name fitdle \
  --restart unless-stopped \
  -p 8080:4173 \
  fitdle:local
```

访问 `http://<宿主机>:8080/`。

`SITE_URL` 是构建参数，不是运行参数。它决定分享页 Open Graph 图片和 canonical URL 的
绝对地址；不设置时会回退到本地地址，外部分享预览可能不正确。

更新时重新拉取代码、构建镜像并替换容器：

```bash
git pull
docker build --build-arg SITE_URL=https://fitdle.example.com -t fitdle:local .
docker stop fitdle
docker rm fitdle
docker run -d --name fitdle --restart unless-stopped -p 8080:4173 fitdle:local
```

### 方案二：一次性全量构建容器

这个容器不长期运行。每次启动都会从仓库重新克隆最新版本，重新下载并生成 SDE、击杀池、
使用率权重和静态产物，测试通过后把最新的 `dist/` 写入挂载卷。

先构建构建器镜像：

```bash
docker build -f Dockerfile.oneshot -t fitdle-build:local .
```

手动执行一次全量构建：

```bash
docker run --rm \
  -e PUID=99 \
  -e PGID=100 \
  -e SITE_URL=https://fitdle.example.com \
  -v /mnt/user/appdata/fitdle:/out \
  fitdle-build:local
```

执行完成后，静态网站根目录就是挂载卷：

```text
/mnt/user/appdata/fitdle/index.html
/mnt/user/appdata/fitdle/share/...
/mnt/user/appdata/fitdle/data/...
```

可以用任意静态服务器或反向代理直接指向该目录。

#### UID / GID 与文件权限

- `PUID`：产物所有者 UID，默认 `99`
- `PGID`：产物所有者 GID，默认 `100`
- Unraid 常见的 `nobody:users` 对应 `PUID=99`、`PGID=100`
- 其他系统可用 `id nobody` 或 `id <用户名>` 查询后传入

容器在构建成功并跑完测试后才会替换输出目录，随后执行：

- 目录权限 `0755`
- 普通静态文件权限 `0644`
- 递归 `chown` 到 `PUID:PGID`

输出卷会被清空并替换为最新 `dist/`，请使用**专用于 FITDLE 的卷**，不要指向包含其他文件的
目录。

#### 定时执行

Linux cron 示例：

```cron
0 4 * * * docker run --rm -e PUID=99 -e PGID=100 -e SITE_URL=https://fitdle.example.com -v /mnt/user/appdata/fitdle:/out fitdle-build:local >> /var/log/fitdle-build.log 2>&1
```

Unraid 可在 User Scripts 中放置同样的 `docker run --rm ...` 命令并设置计划任务。

可选环境变量：

- `FITDLE_REPO`：仓库地址，默认 `https://gitlab.com/cmy/fitdle.git`
- `FITDLE_REF`：分支或标签，默认 `main`
- `OUTPUT_DIR`：容器内输出目录，默认 `/out`
- `SITE_URL`：对外站点地址，影响分享预览

#### 自动发布构建器镜像

构建器镜像独立于软件本体版本。只有 `docker/BUILDER_VERSION` 变化时，GitLab CI 才会
构建并推送一次性构建器镜像；普通软件版本发布不会产生新的构建器版本。

镜像地址：

```text
registry.gitlab.com/cmy/fitdle/builder:<builder-version>
registry.gitlab.com/cmy/fitdle/builder:latest
```

`<builder-version>` 来自 `docker/BUILDER_VERSION`。修改 `Dockerfile.oneshot` 或
`docker/oneshot-entrypoint.sh` 后，需要同时更新该文件，镜像才会重新发布；只更新软件本体
不会触发构建器发布。

发布流程：

1. `publish:builder` 在 `docker/BUILDER_VERSION` 变化时用 Kaniko 构建 `Dockerfile.oneshot`；
2. 推送构建器版本标签和 `latest`；
3. 软件本体的 `release` 与构建器发布相互独立，构建器未变化时仍可正常发布软件。

首次使用前确认项目的 **Settings → General → Visibility, project features, permissions**
中 Container Registry 已启用。镜像默认跟随项目可见性；如果项目是私有的，拉取前需要
`docker login registry.gitlab.com`，或把镜像设为公开。

在合并发布 MR 前，可以先手动运行一次冒烟测试任务：

```text
publish:builder:test
```

它只推送 `:test` 标签，用来验证 Dockerfile 和 CI 的 Registry 登录，不会触发正式发布。

拉取并运行构建器：

```bash
docker pull registry.gitlab.com/cmy/fitdle/builder:latest

docker run --rm \
  -e PUID=99 \
  -e PGID=100 \
  -e SITE_URL=https://fitdle.example.com \
  -v /mnt/user/appdata/fitdle:/out \
  registry.gitlab.com/cmy/fitdle/builder:latest
```

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
