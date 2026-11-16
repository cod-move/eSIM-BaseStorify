# 无感更新部署（宝塔面板 + 反向代理 + pm2 蓝绿）

## 原理

服务器上放两份程序：`blue` 跑在 3001 端口，`green` 跑在 3002 端口，由 pm2 运行。同一时间只有一份「在线」。

```
访客 ──HTTPS──▶ 宝塔站点（反向代理到 http://127.0.0.1:3000）
                        │
定时任务 ───────────────┤
                        ▼
          nginx 本机 3000 端口（codsim-upstream.conf）
                        │  转给 codsim-active.conf 里写的那一份
                        ▼
          blue :3001  或  green :3002
```

- 宝塔站点只负责域名、SSL 证书和反向代理，目标固定是 `http://127.0.0.1:3000`，以后不用再改。
- 本机 3000 端口由 nginx 监听，转给在线的那一份。部署脚本只改写 `codsim-active.conf` 里的一行，然后重载 nginx。
- 定时任务也访问 `http://127.0.0.1:3000`，所以切换版本时不用改它们。

每次部署，脚本会：

1. 在**不在线**的那一份里拉取 `main` 最新代码、安装依赖、编译。编译用较低的 CPU 优先级，线上那份照常服务。
2. 用 pm2 启动新版本，确认它能正常响应。
3. 改写 `codsim-active.conf` 并重载 nginx。重载不会中断正在处理的请求。
4. 旧版本再运行约 5 分钟，等手上的请求和定时任务跑完，然后停掉。停掉的旧版本保留着，用于回滚。

编译失败或新版本起不来时，脚本会停下，线上继续用旧版本。

## 目录和文件

```
/www/wwwroot/codsim/
├── deploy.env        部署设置
├── blue/             第一份代码（整个仓库）
├── green/            第二份代码（整个仓库）
├── shared/
│   ├── .env          两份共用的环境变量
│   ├── logs/         两份共用的日志（cron.log 在这里）
│   └── uploads/      两份共用的上传文件
├── current -> green  指向在线那一份，由脚本维护
└── live              记录在线的是 blue 还是 green

/www/server/panel/vhost/nginx/codsim-upstream.conf   本机 3000 端口的转发（nginx 自动加载）
/www/server/nginx/conf/codsim-active.conf            在线那一份的端口，由脚本改写
```

---

## 日常使用

在宝塔「终端」或 SSH 里执行：

```bash
bash /www/wwwroot/codsim/current/tools/deploy/bluegreen.sh deploy     # 部署 main 最新代码
bash /www/wwwroot/codsim/current/tools/deploy/bluegreen.sh status     # 查看哪一份在线、各是哪个提交
bash /www/wwwroot/codsim/current/tools/deploy/bluegreen.sh rollback   # 切回上一版
```

一次部署大约要 10～20 分钟，主要花在编译上，网站全程正常访问。

切换后会有约 5 分钟两份同时运行，然后脚本才结束。中途按 Ctrl+C 不影响已经完成的切换，只是旧版本不会被自动停掉，需要手动执行 `pm2 stop codsim-<旧的那份>`。

部署完成后，重启 esim-fulfillment 常驻任务（见第 6 步），让它用上新代码：

```bash
/www/server/panel/pyenv/bin/supervisorctl -c /etc/supervisor/supervisord.conf restart esim-fulfillment:*
```

---

## 第一次设置（新服务器）

下面的命令都以 root 身份在宝塔「终端」或 SSH 里执行。`<…>` 是要换成你实际值的地方。

### 第 0 步：准备

1. 在宝塔「软件商店」装好 **Nginx** 和 **Node.js 版本管理器**。用版本管理器装一个 Node（版本和项目要求一致），记下目录：
   ```bash
   ls /www/server/nodejs/
   ```
   会看到类似 `v24.11.1` 的目录，下文的 `<node版本>` 就填它。
2. 装 pm2、pnpm，并确认 flock 可用：
   ```bash
   export PATH=/www/server/nodejs/<node版本>/bin:$PATH
   npm i -g pm2 pnpm
   pm2 -v; pnpm -v; command -v flock
   ```
3. 服务器内存：`free -g`。编译要占约 6 GB，内存不到 8 GB 的话，编译时网站会变慢（不会中断）。
4. 本机 3000 端口必须空着（下面要交给 nginx）：
   ```bash
   ss -ltnp | grep ':3000 ' || echo "3000 空着"
   ```
   如果被宝塔「Node项目」占着，先看文末「从宝塔 Node 项目迁移过来」。

### 第 1 步：建两份代码和共用目录

```bash
mkdir -p /www/wwwroot/codsim && cd /www/wwwroot/codsim

cat > deploy.env <<'EOF'
REPO=<仓库地址>
BRANCH=main
BLUE_PORT=3001
GREEN_PORT=3002
PM2_PREFIX=codsim
NODE_BIN=/www/server/nodejs/<node版本>/bin
NGINX=/www/server/nginx/sbin/nginx
ACTIVE_CONF=/www/server/nginx/conf/codsim-active.conf
EOF

git clone --branch main "$(grep ^REPO= deploy.env | cut -d= -f2-)" blue
bash blue/tools/deploy/bluegreen.sh init         # 再克隆出 green，并建 shared 目录
```

放好环境变量（新服务器按 `Storify-main-app/.env.example` 填写；从旧服务器搬过来就直接复制）：

```bash
cp <旧的 .env> /www/wwwroot/codsim/shared/.env
cp -a <旧的上传目录>/. /www/wwwroot/codsim/shared/uploads/ 2>/dev/null || true
```

`.env` 里必须有 `CRON_SECRET`（至少 16 位随机串，例如 `openssl rand -hex 32` 生成），定时任务靠它鉴权。

### 第 2 步：nginx 本机 3000 端口

1. 新建切换用的文件，先指向 blue：
   ```bash
   echo 'server 127.0.0.1:3001;' > /www/server/nginx/conf/codsim-active.conf
   ```
   这个文件只有一行，必须放在 `/www/server/nginx/conf/`。不能放到 `/www/server/panel/vhost/nginx/`，那里的文件会被 nginx 自动加载，单独这一行会让 nginx 报错。

2. 新建本机 3000 端口的转发。这个文件放在 `/www/server/panel/vhost/nginx/`，nginx 会自动加载它，宝塔改站点设置时也不会动它：
```bash
cat > /www/server/panel/vhost/nginx/codsim-upstream.conf <<'EOF'
# 本机 3000 端口：转给在线的 blue / green（由 tools/deploy/bluegreen.sh 切换）。
# 宝塔站点的反向代理和定时任务都指向这里。
map $http_upgrade $codsim_connection {
    default upgrade;
    ""      "";
}

upstream codsim_app {
    include /www/server/nginx/conf/codsim-active.conf;
    keepalive 32;
}

server {
    listen 127.0.0.1:3000;
    server_name _;
    client_max_body_size 50m;

    location / {
        proxy_pass http://codsim_app;
        proxy_http_version 1.1;
        proxy_set_header Connection $codsim_connection;
        proxy_set_header Upgrade $http_upgrade;
        # 原样转交外层（宝塔站点）带来的访客信息
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $http_x_real_ip;
        proxy_set_header X-Forwarded-For $http_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
        proxy_buffering off;          # 流式返回（AI 写作等）不被攒着
        proxy_read_timeout 900s;      # 目录同步等任务要跑好几分钟
    }
}
EOF
```

3. 检查并重载：
   ```bash
   /www/server/nginx/sbin/nginx -t && /www/server/nginx/sbin/nginx -s reload
   ```
   这时访问 3000 会返回 502，因为程序还没启动，属于正常。

### 第 3 步：第一次部署

```bash
bash /www/wwwroot/codsim/blue/tools/deploy/bluegreen.sh deploy
```

脚本会在 blue 里编译，用 pm2 启动在 3001 端口，确认能响应后切换 nginx。完成后检查：

```bash
bash /www/wwwroot/codsim/current/tools/deploy/bluegreen.sh status
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/settings/public    # 应该是 200
```

### 第 4 步：宝塔站点 + 反向代理

1. 「网站 → 添加站点」：填域名（例如 `www.example.com` 和 `example.com`），PHP 版本选「纯静态」，不建数据库。根目录随意（例如 `/www/wwwroot/codsim-site`），不会用到。
2. 站点「设置 → SSL」：申请或部署证书，打开「强制 HTTPS」。
3. 站点「设置 → 反向代理 → 添加反向代理」：
   - 目标 URL：`http://127.0.0.1:3000`
   - 发送域名：`$host`
   - 缓存：**关闭**（网页内容因人而异，不能缓存）
4. 保存后，在反向代理的「配置文件」里确认有这几行，缺的补上：
   ```nginx
   proxy_set_header Host $host;
   proxy_set_header X-Real-IP $remote_addr;
   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   proxy_set_header X-Forwarded-Proto $scheme;
   ```
5. 如果网站要上传较大的文件，在站点「配置文件」里把 `client_max_body_size` 调大（第 2 步的文件里是 50m，两边取一致）。
6. 打开网站，随便点几个页面，确认正常。

`.env` 里的 `BETTER_AUTH_URL`、`NEXT_PUBLIC_APP_URL` 要写成这个站点的 HTTPS 地址。改了 `.env` 要重新部署一次才生效。

### 第 5 步：定时任务

所有定时任务都访问 `http://127.0.0.1:3000`，应用目录统一用 `/www/wwwroot/codsim/current/Storify-main-app`。

生成 crontab（esim-fulfillment 每 10 秒一次，交给第 6 步的常驻任务，这里跳过）：

```bash
crontab -l > /root/crontab.bak 2>/dev/null || true                    # 备份已有的
CRON_SKIP=esim-fulfillment bash /www/wwwroot/codsim/current/tools/cron/server-crontab.sh \
  /www/wwwroot/codsim/current/Storify-main-app > /tmp/storify.cron
cat /tmp/storify.cron                                                    # 看一眼
crontab /tmp/storify.cron                                                # 安装
```

`server-crontab.sh` 只是把任务表**打印**出来（重定向到文件时终端没有输出），要用 `crontab` 安装才生效。安装会**替换**整个 crontab：如果 `/root/crontab.bak` 里还有别的任务，先把它们追加到 `/tmp/storify.cron` 再安装。

以后 `vercel.json` 里的定时任务有增减时，重新生成一次。

### 第 6 步：esim-fulfillment 常驻任务（每 10 秒）

在宝塔「软件商店」装「**进程守护管理器**」，添加守护进程：

- 名称：`esim-fulfillment`
- 启动用户：`root`
- 运行目录：`/www/wwwroot/codsim/current/`
- 启动命令：
  ```
  /bin/bash /www/wwwroot/codsim/current/tools/cron/loop.sh 10 /www/wwwroot/codsim/current/Storify-main-app http://127.0.0.1:3000 /api/cron/esim-fulfillment 90
  ```

几分钟后检查定时任务日志，记录应该都是 `200`：

```bash
tail -n 20 /www/wwwroot/codsim/shared/logs/cron.log
```

### 第 7 步：pm2 开机自启

```bash
export PATH=/www/server/nodejs/<node版本>/bin:$PATH
pm2 startup        # 按提示执行它打印的那条命令（如果有）
pm2 save
```

服务器重启后，pm2 会自动拉起在线的那一份；nginx 的转发记录在 `codsim-active.conf` 里，重启后不变。

---

## 从宝塔 Node 项目迁移过来

如果网站原来是用宝塔「Node项目」跑的（占着 3000 端口），按下面的顺序做，访客只会有几秒钟连不上：

1. 第 0、1 步照做（`.env` 和上传文件从原项目目录复制）。
2. 第 2 步只做第 1 小步（建 `codsim-active.conf`），**先不要**建 `codsim-upstream.conf`，因为 3000 还被占着。
3. 第 3 步照做，但只看 `status` 和 `curl http://127.0.0.1:3001/api/settings/public`，这时网站还在用原项目。
4. 在面板「网站 → Node项目」里对原项目点「**停止**」（不要点删除），关掉它的开机启动和守护。马上执行第 2 步的第 2、3 小步（建 `codsim-upstream.conf` 并重载 nginx）。
5. 原项目的站点本来就反向代理到 `127.0.0.1:3000`，这时已经自动转到 blue 了。打开网站检查。
6. 把原来的定时任务和 esim-fulfillment 常驻任务里的旧目录改成 `/www/wwwroot/codsim/current`（第 5、6 步），然后做第 7 步。改 crontab 时，可以直接替换目录：
   ```bash
   crontab -l > /root/crontab.bak
   sed 's#<旧目录>#/www/wwwroot/codsim/current#g' /root/crontab.bak > /tmp/storify.cron
   diff /root/crontab.bak /tmp/storify.cron      # 核对：只有目录变了
   crontab /tmp/storify.cron
   ```
   常驻任务在「进程守护管理器」里改完启动命令后，要**重启**这个任务才会用新目录（只保存配置不会影响正在运行的进程）。

确认几天没有问题后，可以在面板里删除原 Node 项目（删除前确认不会连同站点和 SSL 证书一起删掉）和旧代码目录。

> 已经按旧版文档设置好的服务器（`upstream` 和 3000 端口那段直接写在站点配置文件里），效果与本文相同，不用改。以后不要再给这个站点添加宝塔「反向代理」，否则会和手写的转发冲突。

---

## 注意事项

- **两份代码目录只用于部署。** 脚本每次会把代码强制重置到远端 `main` 的最新提交，不要在 `blue/`、`green/` 里手动改代码，改了也会被覆盖。
- **改环境变量**：只改 `shared/.env`，然后部署一次让它生效。如果只是改配置、不改代码，也可以直接对在线那份执行 `pm2 restart codsim-<在线那份> --update-env`，但这样会有几秒中断。
- **已经打开的网页**：它们还会请求旧版本的 JS 文件。部署时会把旧版的这些文件复制到新版本里，所以不会出现加载失败。
- **回滚**：`rollback` 会启动上一版，确认能响应后把 nginx 切回去。切回的版本里没有最近那次的代码改动；如果那次部署包含数据库结构变化，回滚前先确认旧代码能兼容。
- **部署失败时**：看终端里最后一行 `ERROR:` 的说明。线上那份不受影响，可以修好问题后重新部署。
- **后台提示「Background jobs have stopped」**：说明定时任务连不上 `127.0.0.1:3000` 或鉴权失败。看 `shared/logs/cron.log`：`000` 是 3000 端口没人监听（检查 `codsim-upstream.conf` 和 nginx），`401` 是 `CRON_SECRET` 不一致。
