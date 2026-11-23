# 顾客 App：打包、签名与推送通知

本文记录顾客 App（`storify-customer-app`）在本机打 Android 正式包、签名，以及推送通知所需的全部配置。密码、私钥等机密只写"放在哪里"，不写内容。

## 一、签名密钥

正式包用 CodSIM 自己的密钥签名，**不能**用 React Native 自带的调试密钥（公开的密钥，会被 Play Protect、三星自动拦截判为"可能有害"）。

| 项目 | 值 |
|---|---|
| keystore 文件 | `C:\b\keys\codsim-release.keystore`（PKCS12；同内容另存为 `codsim-release.p12` 供 Expo 上传） |
| alias | `codsim` |
| 密码 | 只在密码管理器和 `~/.gradle/gradle.properties` 里，store 与 key 密码相同 |
| 证书 | `CN=codeman, OU=CodMove Ltd., O=codsim, L=Hong Kong, C=HK` |
| SHA-1 | `08:5C:28:4B:4D:66:2A:08:60:DF:D2:03:D9:3A:03:06:18:D2:3E:34` |
| SHA-256 | `80:1F:14:B1:1C:52:B0:B2:B8:6B:B8:8D:3C:51:3E:11:93:60:4A:28:42:B2:EF:50:9B:40:6F:23:FA:C6:91:F6` |

- **务必备份** keystore 和密码（离线 + 密码管理器）。丢失后已安装的用户无法再覆盖升级，只能卸载重装。
- Gradle 从用户目录的 `C:\Users\Administrator\.gradle\gradle.properties` 读取四个值（不在仓库里）：

  ```
  CODSIM_STORE_FILE=C:/b/keys/codsim-release.keystore
  CODSIM_KEY_ALIAS=codsim
  CODSIM_STORE_PASSWORD=…
  CODSIM_KEY_PASSWORD=…
  ```

- 插件 `storify-customer-app/plugins/with-release-signing.js` 把这四个值写进生成的 `android/app/build.gradle`。缺任何一个时 release 编译直接失败，不会退回调试密钥。
- 插件 `plugins/with-no-overlay-permission.js` 从正式包移除 `SYSTEM_ALERT_WINDOW`（"显示在其他应用上层"，App 用不到，且是恶意软件常见权限）。
- 换过签名后，旧签名（1.0.1 及更早，调试密钥）的安装必须先卸载。
- 新电脑生成密钥的命令（只在丢失、需要重建时用，换密钥等于换应用身份）：

  ```bash
  keytool -genkeypair -v -storetype PKCS12 -keystore /c/b/keys/codsim-release.keystore -alias codsim -keyalg RSA -keysize 2048 -validity 10000
  ```

  `keytool` 在 `C:\Android\jdk17\bin\`。

## 二、本机打包

编译目录在 `C:\b\app`（路径短，避开 Windows 路径长度限制），源码从仓库同步过去。

1. **改版本号**：`storify-customer-app/app.json` 的 `expo.version` 和 `expo.android.versionCode`（每次发版 versionCode +1）。
2. **同步源码**（退出码 1 表示有文件复制，正常）：

   ```bash
   robocopy 'C:\Users\Administrator\Documents\eSIM-BaseStorify\storify-customer-app' 'C:\b\app' //MIR //XD android .expo node_modules //XF .env.local
   ```

   `C:\b\app\.env.local` 是编译目录自己的（`EXPO_PUBLIC_API_URL` 必须是 https 线上地址），不会被覆盖。
3. **重新生成 android 目录**：只在 `app.json`、`app.config.ts`、`plugins/`、原生依赖或版本号变化时需要：

   ```bash
   cd /c/b/app && CI=1 npx expo prebuild --platform android --no-install
   ```

   只改 JS/TS 代码时可跳过。prebuild 后原生库全部重编，时间会长很多（见下面"编译慢"）。
4. **编译**（约 10 分钟；prebuild 之后可能接近 1 小时）：

   ```bash
   cd /c/b/app/android && JAVA_HOME=/c/Android/jdk17 ./gradlew assembleRelease -PreactNativeArchitectures=armeabi-v7a,arm64-v8a --no-daemon
   ```

5. **产物**：`C:\b\app\android\app\build\outputs\apk\release\app-release.apk`，复制为仓库根目录 `codsim-<版本>.apk`。
6. **检查**（build-tools 在 `C:\Android\sdk\build-tools\36.0.0`）：

   ```bash
   apksigner verify --print-certs app-release.apk   # 证书应为 CN=codeman, O=codsim
   aapt2 dump badging app-release.apk | head -1     # 版本号
   aapt2 dump permissions app-release.apk           # 不应有 SYSTEM_ALERT_WINDOW
   ```

7. **网站下载**：网站的 App 下载区读 `ESIM_APP_ANDROID_APK_URL`、`ESIM_APP_ANDROID_VERSION`（见 `Storify-main-app/lib/esim/storefront/app-download.ts`），发新版时更新文件和版本号。

**编译慢 / "Unable to delete directory … libc++_shared.so"**：Windows Defender 扫描新生成的原生库时会锁文件。直接重试即可，每次会接着上次的进度往下编。把 `C:\b` 加入 Defender 排除项可以根治（需要管理员自己设置）。

## 三、推送通知

### 工作方式

网站通过 Expo 推送服务发送（`Storify-main-app/lib/notifications/push-native.ts`），Expo 再转发给 Google FCM。网站服务器不需要 Firebase 密钥。

1. App 登录后申请通知权限，拿到 Expo 推送令牌（`ExponentPushToken[…]`），注册到网站，存在 `pushsubscriptions` 集合（`platform: android`, `app: shop`）。
2. 网站上的事件（客服回复、订单、eSIM 开卡成功 / 流量快用完 / 快到期 / 未安装提醒）会生成站内通知，同时推送到该用户的所有设备。
3. Expo 返回 ticket；15 分钟后 cron（`/api/cron/email-deliveries`）读取 receipt，已卸载的设备会自动停用。

### 需要的配置

| 位置 | 内容 |
|---|---|
| Expo 项目 | CodSIM，项目 ID `61cb58f8-ce06-4086-8343-1f77cb7a7239`，写在 `app.json` 的 `expo.extra.eas.projectId` |
| Firebase 项目 | `codsim-esimconnect`，Android 应用包名 `cc.codsim.app`，填上面的 SHA-1 |
| `storify-customer-app/google-services.json` | 从 Firebase 下载，已提交到仓库（不是机密），`app.json` 的 `android.googleServicesFile` 指向它 |
| Expo → Credentials → Android → **`cc.codsim.app`** | ① Android upload keystore：上传 `codsim-release.p12`，alias `codsim`；② **FCM V1 service account key**：Firebase「项目设置 → 服务账号 → 生成新的私钥」下载的 JSON（含 `private_key`，机密，不进仓库） |
| 网站后台（可选） | 若在 Expo 开启 push security，把 access token 填到「设置 → 移动 App」或环境变量 `EXPO_ACCESS_TOKEN` |

**踩过的坑**：

- Expo 凭据里的 Android 应用标识必须是完整包名 **`cc.codsim.app`**。曾经误建成 `codsim`，结果推送全部失败，报错 "Unable to retrieve the FCM server key for the recipient's app"。
- 上传 FCM 密钥时不要传 `google-services.json`（会提示 `private_key: Required`），也不要传到 "Google Service Account Key for Play Store submissions" 那一栏（那是 Expo 自动上传 Google Play 用的，目前不需要）。
- 设置了项目 ID 后 Expo 在线更新（OTA）也随之开启：App 启动时在后台检查 `u.expo.dev`，不阻塞启动，没发布更新就用包内代码。
- 改 Expo / Firebase 后台配置不需要重编 APK；改 `google-services.json` 或项目 ID 需要 prebuild + 重编。

### App 什么时候请求通知权限

- **支付成功页**：已登录用户第一次付款成功后弹说明卡片，只问一次（Storify 原有逻辑）。
- **我的 eSIM**：有 eSIM 或号码卡的已登录用户，通知没开时弹说明卡片；关掉后每 3 天再问一次（`ESIM_PUSH_ASK_EVERY_MS`，在 `src/features/esim/esim-push-moment.tsx`）。安卓拒绝两次后系统不再弹授权框，此时按钮直接打开系统设置。
- **账户 → 设置 / 通知偏好**：用户随时可以自己开启。

### 收不到通知时怎么查

1. 在数据库 `pushsubscriptions` 里按用户 ID 找 `platform: android` 的记录：
   - 没有记录：App 没拿到令牌（没登录、没开通知权限，或 APK 编译时没有项目 ID）。
   - 有记录且 `failureReason` 有值：就是 Expo 返回的错误，按错误处理（例如上面的 FCM 密钥问题）。
   - `isActive: false`：设备已卸载或令牌失效，App 重新登录后会重新注册。
2. `notifications` 集合里有这条通知，说明网站侧已经触发。
3. 用户在 App「通知偏好」里关掉了某类通知时，该类不推送，只留站内通知。
4. 手机系统设置里 App 的通知被关、或省电策略限制后台，也会收不到。

## 四、其他依赖签名指纹的地方

换签名密钥后，以下位置要更新 SHA-1：

- Firebase 项目里 `cc.codsim.app` 的 SHA 证书指纹。
- Google 登录的 Android OAuth 客户端（Google Cloud Console），否则 App 内 Google 登录失败。
- 上架 Google Play 后，还要加上 Play 的应用签名密钥指纹（Play Console → 应用完整性）。
