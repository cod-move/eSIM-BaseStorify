# 服务器上的定时任务

`Storify-main-app/vercel.json` 的 `crons` 列出全部定时任务（Storify 自带的 + eSIM 的 4 个）。
每个任务是 `GET /api/cron/<名称>`，带 `Authorization: Bearer $CRON_SECRET`。
自建服务器上由系统调度去调用，时间按 UTC。

| 脚本 | 作用 |
|---|---|
| `run-cron.sh <应用目录> <地址> <任务路径> [超时秒]` | 跑一次任务：密钥每次从 `<应用目录>/.env` 读取；同一任务上次未结束就跳过；每次一行日志到 `<应用目录>/logs/cron.log` |
| `server-crontab.sh <应用目录> [地址]` | 按 `vercel.json` 生成整份 crontab；`CRON_SKIP="esim-fulfillment"` 跳过由 loop.sh 跑的任务 |
| `loop.sh <间隔秒> <应用目录> <地址> <任务路径> [超时秒]` | 每隔 N 秒跑一次（给需要比一分钟更频繁的任务），交给 supervisor/systemd 常驻 |

地址默认 `http://127.0.0.1:3000`，直连 Next，不走 Nginx（代理 60 秒超时会切断 5 分钟的目录同步）。

先在 `.env` 设置 `CRON_SECRET`（至少 16 位随机串，例如 `openssl rand -hex 32`），重启应用。

## 方案一：全部用 crontab（esim-fulfillment 每 10 秒）

```bash
CRON_SKIP=esim-fulfillment bash tools/cron/server-crontab.sh /srv/codsim/Storify-main-app > /tmp/storify.cron
```

再在 `/tmp/storify.cron` 末尾加 6 行（cron 最小一分钟，用 sleep 错开，脚本自带防重叠）：

```cron
* * * * *            /srv/codsim/tools/cron/run-cron.sh /srv/codsim/Storify-main-app http://127.0.0.1:3000 /api/cron/esim-fulfillment 90
* * * * * sleep 10;  /srv/codsim/tools/cron/run-cron.sh /srv/codsim/Storify-main-app http://127.0.0.1:3000 /api/cron/esim-fulfillment 90
* * * * * sleep 20;  /srv/codsim/tools/cron/run-cron.sh /srv/codsim/Storify-main-app http://127.0.0.1:3000 /api/cron/esim-fulfillment 90
* * * * * sleep 30;  /srv/codsim/tools/cron/run-cron.sh /srv/codsim/Storify-main-app http://127.0.0.1:3000 /api/cron/esim-fulfillment 90
* * * * * sleep 40;  /srv/codsim/tools/cron/run-cron.sh /srv/codsim/Storify-main-app http://127.0.0.1:3000 /api/cron/esim-fulfillment 90
* * * * * sleep 50;  /srv/codsim/tools/cron/run-cron.sh /srv/codsim/Storify-main-app http://127.0.0.1:3000 /api/cron/esim-fulfillment 90
```

```bash
crontab /tmp/storify.cron
```

## 方案二：crontab + supervisor（推荐）

其他任务仍由 crontab 跑，esim-fulfillment 交给 supervisor 常驻循环，进程挂了会自动拉起：

```bash
CRON_SKIP=esim-fulfillment bash tools/cron/server-crontab.sh /srv/codsim/Storify-main-app > /tmp/storify.cron
crontab /tmp/storify.cron
```

`/etc/supervisor/conf.d/esim-fulfillment.conf`（CentOS 为 `/etc/supervisord.d/esim-fulfillment.ini`）：

```ini
[program:esim-fulfillment]
command=/bin/bash /srv/codsim/tools/cron/loop.sh 10 /srv/codsim/Storify-main-app http://127.0.0.1:3000 /api/cron/esim-fulfillment 90
user=www
autostart=true
autorestart=true
stopsignal=TERM
stdout_logfile=/var/log/supervisor/esim-fulfillment.log
stderr_logfile=/var/log/supervisor/esim-fulfillment.log
```

```bash
supervisorctl reread && supervisorctl update && supervisorctl status esim-fulfillment
```

`user` 换成能读 `.env`、能写 `logs/` 的用户。

## 检查

```bash
tail -f /srv/codsim/Storify-main-app/logs/cron.log
```

每行：时间、任务、HTTP 状态、耗时。200 为成功；401 说明脚本读到的密钥和运行中的应用不一致（应用跑在 Docker 里时，密钥在容器环境变量里，需在 crontab / supervisor 的 command 前写 `CRON_SECRET=...`）。
后台 eSIM → 定时任务 也能看到每个任务的最近运行时间。

`CRON_TZ=UTC` 只有 cronie（CentOS/RHEL）认；Debian/Ubuntu 把服务器时区设为 UTC，或接受每天一次的任务按本地时间跑。
`vercel.json` 改过的版本部署后，重新生成 crontab。
