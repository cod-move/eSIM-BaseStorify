# 无感更新（宝塔面板 + pm2 + nginx 蓝绿部署）

## 原理

服务器上放两份程序：`blue` 跑在 3001 端口，`green` 跑在 3002 端口。nginx 只把访问转给其中「在线」的那一份。

每次部署，脚本会：

1. 在**不在线**的那一份里拉取 `main` 最新代码、安装依赖、编译。编译用较低的 CPU 优先级，线上那份照常服务。
2. 用 pm2 启动新版本，确认它能正常响应。
3. 改写 nginx 里那一行转发地址，然后重载 nginx。重载不会中断正在处理的请求。
4. 旧版本再运行约 5 分钟，等手上的请求和定时任务跑完，然后停掉。停掉的旧版本保留着，用于回滚。

编译失败或新版本起不来时，脚本会停下，线上继续用旧版本。

两份程序共用这些文件：`.env`、日志（`logs/`）、本地存储的上传文件（`public/uploads/`），都放在 `shared/` 目录里。

## 目录结构

```
/www/wwwroot/codsim/
├── deploy.env        部署设置
├── blue/             第一份代码（整个仓库）
├── green/            第二份代码（整个仓库）
├── shared/
│   ├── .env          两份共用的环境变量
│   ├── logs/         两份共用的日志
│   └── uploads/      两份共用的上传文件
├── current -> blue   指向在线那一份，由脚本维护
└── live              记录在线的是 blue 还是 green
```

---

## 日常使用（设置完成后）

在宝塔「终端」或 SSH 里执行：

```bash
bash /www/wwwroot/codsim/current/tools/deploy/bluegreen.sh deploy     # 部署 main 最新代码
bash /www/wwwroot/codsim/current/tools/deploy/bluegreen.sh status     # 查看哪一份在线、各是哪个提交
bash /www/wwwroot/codsim/current/tools/deploy/bluegreen.sh rollback   # 切回上一版
```

一次部署大约要 10～20 分钟，主要花在编译上，网站全程正常访问。

切换后会有约 5 分钟两份同时运行，然后脚本才结束。中途按 Ctrl+C 不影响已经完成的切换，只是旧版本不会被自动停掉，需要手动执行 `pm2 stop codsim-<旧的那份>`。

---

## 第一次设置（只做一次）

下面的命令都以 root 身份在宝塔「终端」或 SSH 里执行。`<…>` 是要换成你实际值的地方。

### 第 0 步：先记下现在的情况

1. 现网代码目录，例如 `/www/wwwroot/<现网目录>`。下文写作 `<现网目录>`。
2. 宝塔 Node 的路径：
   ```bash
   ls /www/server/nodejs/
   ```
   会看到类似 `v24.11.1` 的版本目录。下文的 `<node版本>` 就填它，这个版本要和现在网站用的一致。
3. 确认 pm2、pnpm、flock 都能用：
   ```bash
   export PATH=/www/server/nodejs/<node版本>/bin:$PATH
   pm2 -v; pnpm -v; command -v flock
   ```
   如果没有 pnpm，执行 `npm i -g pnpm`。
4. 服务器内存：`free -g`。编译要占约 6 GB，内存不到 8 GB 的话，编译时网站会变慢（不会中断）。
5. 在面板「网站」里找到这个站点，打开「设置 → 配置文件」，把内容复制保存一份，以备改错时恢复。

### 第 1 步：建两份代码和共用目录

```bash
mkdir -p /www/wwwroot/codsim && cd /www/wwwroot/codsim

cat > deploy.env <<'EOF'
REPO=<仓库地址，和现网目录用的一样，可用 git -C <现网目录> remote get-url origin 查看>
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

复制现网的环境变量和上传文件：

```bash
cp <现网目录>/Storify-main-app/.env /www/wwwroot/codsim/shared/.env
cp -a <现网目录>/Storify-main-app/public/uploads/. /www/wwwroot/codsim/shared/uploads/ 2>/dev/null || true
```

> `.env` 里的 `BETTER_AUTH_URL`、`NEXT_PUBLIC_APP_URL` 等保持现网的值，不用改。

### 第 2 步：nginx 先指向现在的进程

1. 新建切换用的文件。先指向现在跑在 3000 端口的宝塔 Node 项目，以后部署脚本会自动改写这一行：
   ```bash
   echo 'server 127.0.0.1:3000;' > /www/server/nginx/conf/codsim-active.conf
   ```
   这个文件必须放在 `/www/server/nginx/conf/`，不能放到 `/www/server/panel/vhost/nginx/`。后者目录下的文件会被 nginx 自动加载，这一行单独加载会让 nginx 报错。

2. 在面板打开「网站 → 这个站点 → 设置 → 配置文件」，在**文件最开头**（第一个 `server {` 之前）加上：
   ```nginx
   upstream codsim_app {
       include /www/server/nginx/conf/codsim-active.conf;
       keepalive 32;
   }
   ```

3. 在同一个文件里找到转发到 3000 端口的那段，一般在 `location /` 或宝塔生成的反向代理段里，形如：
   ```nginx
   proxy_pass http://127.0.0.1:3000;
   ```
   改成：
   ```nginx
   proxy_pass http://codsim_app;
   proxy_http_version 1.1;
   proxy_set_header Connection "";
   ```
   这段里已有的 `proxy_http_version` 或 `proxy_set_header Connection` 如果和上面重复，删掉原来的那一行。其他 `proxy_set_header`（Host、X-Real-IP、X-Forwarded-For 等）保持不变。

   如果配置文件里找不到 `proxy_pass`，说明转发写在宝塔的另一个文件里（例如「反向代理」功能生成的 `/www/server/panel/vhost/nginx/proxy/<站点>/*.conf`），去那里改。

4. 保存。面板会自动检查并重载 nginx；报错的话，按第 0 步备份的内容恢复，并把报错信息发给我。

5. 打开网站检查。现在访问的还是原来的进程，只是改成经过 `codsim_app` 转发。

### 第 3 步：第一次部署

```bash
bash /www/wwwroot/codsim/blue/tools/deploy/bluegreen.sh deploy
```

第一次部署时，脚本会：在 blue 里编译，用 pm2 启动在 3001 端口，确认能响应后，把 nginx 切到 3001。这时访客已经在用新的 blue 了。

确认一下：

```bash
bash /www/wwwroot/codsim/current/tools/deploy/bluegreen.sh status
cat /www/server/nginx/conf/codsim-active.conf      # 应该是 server 127.0.0.1:3001;
```

打开网站，随便点几个页面，确认正常。

### 第 4 步：停掉原来的宝塔 Node 项目

1. 在面板「网站 → Node项目」里，对原来的项目点「**停止**」，不要点「删除」。
2. 马上打开网站检查能不能访问。如果宝塔在停止时改动了站点配置文件，打开配置文件检查第 2 步加的内容还在不在，不在就重新加上。
3. 确认 3000 端口已经空出来：
   ```bash
   ss -ltnp | grep ':3000 ' || echo "3000 已空出"
   ```
4. 在原项目的设置里关闭「开机启动」和「守护进程」之类的自动拉起选项，避免它重新占用 3000 端口。

以后**不要再在面板里改这个 Node 项目的设置**，宝塔可能会重新生成站点配置，覆盖掉第 2 步的修改。先不要删除这个项目；删除前要确认站点和 SSL 证书不会被一起删掉。

### 第 5 步：本机 3000 端口交给 nginx

定时任务和其他本机脚本都访问 `http://127.0.0.1:3000`。让 nginx 接管这个端口、转给在线的那一份，这些调用就永远不用跟着切换。

在站点配置文件里，第 2 步加的 `upstream` 下面，再加一段：

```nginx
server {
    listen 127.0.0.1:3000;
    location / {
        proxy_pass http://codsim_app;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_read_timeout 900s;    # 目录同步等任务要跑好几分钟
    }
}
```

保存后检查：

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/settings/public    # 应该是 200
```

第 4 步和这一步之间，定时任务会有几秒钟连不上，下一轮会自动补上，访客不受影响。

### 第 6 步：定时任务改用 current 目录

定时任务调用 `tools/cron/run-cron.sh` 时，第一个参数是应用目录，脚本会从这个目录读取 `.env` 里的 `CRON_SECRET`。把它改成始终指向在线那一份的 `current`：

```
/www/wwwroot/codsim/current/Storify-main-app
```

- **用面板「计划任务」配置的**：逐个编辑任务脚本，把里面的 `<现网目录>` 改成 `/www/wwwroot/codsim/current`，其他（地址 `http://127.0.0.1:3000`、任务路径、超时）不变。
- **用 crontab 配置的**：重新生成一份：
  ```bash
  CRON_SKIP=esim-fulfillment bash /www/wwwroot/codsim/current/tools/cron/server-crontab.sh /www/wwwroot/codsim/current/Storify-main-app > /tmp/storify.cron
  ```
  `esim-fulfillment` 那几行（每 10 秒一次）也改用 `/www/wwwroot/codsim/current/...` 的路径，然后用 `crontab /tmp/storify.cron` 安装。

改完看一下日志里定时任务的记录是否正常：

```bash
tail -n 20 /www/wwwroot/codsim/shared/logs/cron.log
```

### 第 7 步：pm2 开机自启

```bash
export PATH=/www/server/nodejs/<node版本>/bin:$PATH
pm2 startup        # 按提示执行它打印的那条命令（如果有）
pm2 save
```

服务器重启后，pm2 会自动拉起在线的那一份。nginx 的转发记录在 `codsim-active.conf` 里，重启后不变。

旧的 `<现网目录>` 确认不再需要后（建议观察几天），可以删除。

---

## 注意事项

- **两份代码目录只用于部署。** 脚本每次会把代码强制重置到远端 `main` 的最新提交，不要在 `blue/`、`green/` 里手动改代码，改了也会被覆盖。
- **改环境变量**：只改 `shared/.env`，然后部署一次让它生效。如果只是改配置、不改代码，也可以直接对在线那份执行 `pm2 restart codsim-<在线那份> --update-env`，但这样会有几秒中断。
- **已经打开的网页**：它们还会请求旧版本的 JS 文件。部署时会把旧版的这些文件复制到新版本里，所以不会出现加载失败。
- **回滚**：`rollback` 会启动上一版，确认能响应后把 nginx 切回去。切回的版本里没有最近那次的代码改动；如果那次部署包含数据库结构变化，回滚前先确认旧代码能兼容。
- **部署失败时**：看终端里最后一行 `ERROR:` 的说明。线上那份不受影响，可以修好问题后重新部署。
