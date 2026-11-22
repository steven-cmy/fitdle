# FITDLE

FITDLE 是一个 EVE Online 理赔评估解谜服务：Node 24 + Fastify + WebSocket + SQLite，前端为静态 `dist/`，支持 EVE SSO、在线每日目标、练习模式、权威联机房间和多语言界面。

仓库同时发布：

- 全栈 Docker 镜像：`registry.gitlab.com/cmy/fitdle`
- GitLab Pages 静态练习构建

## 1. 技术栈

| 组件 | 说明 |
|---|---|
| Node.js | 24+ |
| Web 服务 | Fastify、`@fastify/websocket`、`@fastify/static` |
| 数据库 | SQLite（`node:sqlite`），默认 `/data/fitdle.sqlite` |
| 前端 | 静态 ES modules、Photon 风格 CSS |
| 登录 | EVE SSO，仅 `publicData` scope |
| 外部数据 | 官方 SDE、zKillboard、ESI、EVE image service |
| 构建 | `dist/`、`data/`、SDE catalog、kill pool、usage weights |

## 2. 快速开始：GitLab 镜像

```bash
docker pull registry.gitlab.com/cmy/fitdle:1.0.1
cp .env.example .env
# 编辑 .env：PUBLIC_ORIGIN、EVE_CLIENT_ID、EVE_CLIENT_SECRET、SESSION_SECRET
docker run -d \
  --name fitdle \
  --restart unless-stopped \
  --env-file .env \
  -p 127.0.0.1:8787:8787 \
  -v fitdle-data:/data \
  registry.gitlab.com/cmy/fitdle:1.0.1
```

健康检查：

```bash
curl -fsS http://127.0.0.1:8787/api/v1/health
```

镜像启动时会读取运行时 `PUBLIC_ORIGIN`，把静态 HTML 中的分享页 canonical/OG 地址替换为当前域名。因此同一个镜像可用于不同域名；域名变更后需要重新创建容器，而不是只 restart。

Unraid：在环境变量中设置 `PUID=99`、`PGID=100`，挂载 `/mnt/user/appdata/fitdle:/data`。1.0.2+ 镜像会自动修正目录权限；1.0.1 需要对 appdata 目录执行一次 `chown -R 1000:1000`。

如果 GitLab Registry 要求认证：

```bash
docker login registry.gitlab.com
```

## 3. Docker Compose + `.env`

```bash
cp .env.example .env
# 编辑 .env
cp compose.example.yml compose.yml
docker compose pull
docker compose up -d
```

`compose.example.yml`：

```yaml
services:
  fitdle:
    image: registry.gitlab.com/cmy/fitdle:1.0.1
    env_file:
      - .env
    ports:
      - "127.0.0.1:8787:8787"
    environment:
      PUID: ${PUID:-1000}
      PGID: ${PGID:-1000}
    volumes:
      - fitdle-data:/data
    restart: unless-stopped

volumes:
  fitdle-data:
```

- `.env` 不打进镜像，也不提交。
- `env_file` 将配置注入容器；不要把 `.env` 复制进镜像。
- 默认 `DATABASE_PATH=/data/fitdle.sqlite`。如果 `.env` 覆盖它，必须仍指向 `/data` 下的路径，否则数据不会持久化。
- `PUID` / `PGID` 控制容器内服务进程的 UID/GID；入口脚本会先把 `/data` 和 `dist` 的权限交给这两个 ID，再降权启动。默认 `1000:1000`，Unraid 常用 `99:100`。
- PUID/PGID 需要 1.0.2 或更新镜像；1.0.1 镜像需先手工执行 `chown -R 1000:1000 /mnt/user/appdata/fitdle`。
- Compose 只绑定 `127.0.0.1:8787`，公网入口由反向代理提供。

## 4. 必需配置

```dotenv
PUBLIC_ORIGIN=https://fitdle.example.com
EVE_CLIENT_ID=...
EVE_CLIENT_SECRET=...
SESSION_SECRET=...
```

| 变量 | 必需 | 说明 |
|---|---|---|
| `PUBLIC_ORIGIN` | 是 | 用户实际访问的 HTTPS origin，不要带末尾 `/`；决定 OAuth 回调、Cookie、CORS、分享页 canonical/OG |
| `EVE_CLIENT_ID` | 在线登录 | EVE 开发者应用 Client ID |
| `EVE_CLIENT_SECRET` | 在线登录 | 仅服务端使用，不要放进镜像或前端 |
| `SESSION_SECRET` | 是 | 会话签名和每日目标派生；用随机值 |
| `DATABASE_PATH` | 否 | 默认 `/data/fitdle.sqlite` |
| `PORT` | 否 | 默认 `8787` |
| `HOST` | 否 | 默认 `0.0.0.0` |
| `PUID` | 否 | 容器运行 UID，默认 `1000`；Unraid 常用 `99` |
| `PGID` | 否 | 容器运行 GID，默认 `1000`；Unraid 常用 `100` |
| `FITDLE_DEV_AUTH` | 否 | 生产必须为 `0` |
| `ROOM_MAX_PLAYERS` | 否 | 默认 `8`，范围 `2..32` |
| `ROOM_ARBITRATION_BIG_ROUNDS` | 否 | 默认 `1` |
| `ROOM_ARBITRATION_MAX_BIG_ROUNDS` | 否 | 默认 `5` |
| `ROOM_TIMED_DURATION_MINUTES` | 否 | 默认 `10` |
| `ROOM_TIMED_MAX_DURATION_MINUTES` | 否 | 默认 `60` |
| `ROOM_RECONNECT_GRACE_MS` | 否 | 掉线宽限，默认 `60000`，范围 `5000..300000` |

生成 `SESSION_SECRET`：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

EVE SSO 回调地址必须精确为：

```text
https://fitdle.example.com/api/v1/auth/eve/callback
```

即 `${PUBLIC_ORIGIN}/api/v1/auth/eve/callback`。

## 5. Nginx 反向代理

示例为同机 Nginx；上游为 `127.0.0.1:8787`。WebSocket 必须单独设置 upgrade。

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

upstream fitdle {
    server 127.0.0.1:8787;
    keepalive 16;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name fitdle.example.com;

    ssl_certificate     /etc/letsencrypt/live/fitdle.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fitdle.example.com/privkey.pem;
    client_max_body_size 8m;

    location / {
        proxy_pass http://fitdle;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws {
        proxy_pass http://fitdle;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
    }
}
```

`map` 必须放在 Nginx 的 `http {}` 上下文，不能写进 `server {}`。

如果服务只在 Docker 网络内，将 upstream 改为 `server fitdle:8787;`，并让 Nginx 与 fitdle 在同一 Docker network。

## 6. linuxserver SWAG

SWAG 负责 HTTPS 证书和 80/443；FITDLE 不发布公网端口。

将以下文件放到 SWAG 的 `/config/nginx/proxy-confs/fitdle.subdomain.conf`：

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name fitdle.*;

    include /config/nginx/ssl.conf;
    client_max_body_size 8m;

    location /ws {
        include /config/nginx/proxy.conf;
        include /config/nginx/resolver.conf;
        set $upstream_app fitdle;
        set $upstream_port 8787;
        set $upstream_proto http;
        proxy_pass $upstream_proto://$upstream_app:$upstream_port;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
    }

    location / {
        include /config/nginx/proxy.conf;
        include /config/nginx/resolver.conf;
        set $upstream_app fitdle;
        set $upstream_port 8787;
        set $upstream_proto http;
        proxy_pass $upstream_proto://$upstream_app:$upstream_port;
    }
}
```

SWAG Compose 片段：

```yaml
services:
  fitdle:
    image: registry.gitlab.com/cmy/fitdle:1.0.1
    env_file:
      - .env
    volumes:
      - fitdle-data:/data
    networks:
      - swag
    restart: unless-stopped

  swag:
    image: lscr.io/linuxserver/swag:latest
    cap_add:
      - NET_ADMIN
    environment:
      PUID: 1000
      PGID: 1000
      TZ: Etc/UTC
      URL: example.com
      SUBDOMAINS: fitdle
      VALIDATION: http
    volumes:
      - ./swag:/config
    ports:
      - "80:80"
      - "443:443"
    networks:
      - swag
    restart: unless-stopped

volumes:
  fitdle-data:

networks:
  swag:
```

`SUBDOMAINS=fitdle` 对应 `fitdle.example.com`；`VALIDATION` 按 SWAG 的证书方式调整（测试可用 `http`，生产建议 `dns` 或 `duckdns`）。证书生效后访问 `https://fitdle.example.com`。

## 7. 镜像 tag、升级与备份

发布的 tag：

- `1.0.1`：固定版本
- `v1.0.1`：带 `v` 的版本
- `latest`：最新默认分支构建
- `<commit-sha>`：可追溯构建

生产建议固定版本 tag，不要依赖 `latest`。

升级：

```bash
docker compose pull
docker compose up -d
```

升级保留 `fitdle-data` volume。SQLite 文件在 `/data/fitdle.sqlite`；备份前停止容器，复制 volume 或 `/data` 目录。

回滚：

```bash
# 修改 compose 中的 image tag 到上一个版本
docker compose up -d
```

## 8. 本地源码构建

要求 Node 24+、npm、Git，并能访问 SDE、zKillboard、ESI 和 npm registry。

```bash
git clone https://gitlab.com/cmy/fitdle.git
cd fitdle
cp .env.example .env
npm install
npm run prepare:sde
npm run build:catalog
npm run build:killpool
npm run build:weights -- --refresh
npm run build
npm test
```

启动完整服务：

```bash
npm install --prefix server
npm run test:server
npm run server:start
```

本地静态预览：

```bash
npm start
# http://127.0.0.1:4173/
```

本地构建 Docker 镜像：

```bash
docker build \
  --build-arg PUBLIC_ORIGIN=https://fitdle.example.com \
  -t fitdle:local .
```

传入实际 `PUBLIC_ORIGIN` 时，镜像不再需要运行时替换；不传时使用占位符，由容器启动时注入。

## 9. 数据更新

```bash
# 官方 SDE
npm run update:sde
npm run build:killpool
npm run build

# zKillboard 船型使用频率
npm run build:weights -- --refresh
npm run build

# dogma engine
npm run update:dogma
npm run build
```

镜像用户直接拉取新版本镜像即可；数据已在镜像构建阶段生成。

## 10. 健康检查与故障排查

- 健康端点：`GET /api/v1/health`
- 服务元信息：`GET /api/v1/meta`
- 日志：`docker logs -f fitdle`

常见问题：

| 现象 | 检查 |
|---|---|
| OAuth 登录 401/回调错误 | `PUBLIC_ORIGIN` 与 EVE 应用注册回调完全一致；使用 HTTPS |
| WebSocket 连接失败 | 反代 `/ws` 是否设置 `Upgrade`/`Connection`，`proxy_read_timeout` 是否足够 |
| 分享卡片指向旧域名 | 修改 `PUBLIC_ORIGIN` 后重新创建容器；仅 restart 不会重新渲染 HTML |
| 数据重启丢失 | `DATABASE_PATH` 是否在 `/data` 下，Compose 是否挂载 `fitdle-data:/data` |
| `unable to open database file` | 确认 `/data` 或 `DATABASE_PATH` 父目录可写；镜像启动时会以 root 修复该目录权限后降权为 `node`。只读挂载或指向不存在/不可写路径会导致启动失败 |
| 镜像拉取 401 | 执行 `docker login registry.gitlab.com` |
| 页面只显示练习模式 | 容器未配置 SSO 凭据或服务端未启动；检查 `.env` 与 `/api/v1/meta` |

## 11. 静态 Pages（可选）

GitLab Pages 只发布 `dist/` 静态练习构建，不包含登录、在线统计或联机房间。完整在线功能使用本文档的 Docker 镜像。

## 12. 许可与数据来源

- FITDLE 源代码：MIT License，见 [LICENSE](LICENSE)。
- EVE Online、Pend Insurance、Secure Commerce Commission 及相关素材归 Fenris Creations 所有；本项目为非官方、非商业粉丝作品。
- 数据来源：官方 EVE SDE、zKillboard、EVE ESI、EVE image service、EVEShip.fit dogma-engine。
- 完整声明见 [NOTICE.md](NOTICE.md)。
