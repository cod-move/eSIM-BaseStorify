# 官方源码插入点清单 & 升级流程

本仓库在官方 Storify 源码之上开发 eSIM 业务。原则：**eSIM 代码放在新目录里，官方文件只在下表登记的位置做最小改动**，以便官方升级时冲突最少、可逐项核对。

## 分支与标签

| 名称 | 用途 |
|---|---|
| `upstream` 分支 | 只放官方原版代码，任何人不得在上面直接开发 |
| `upstream/<版本>` 标签 | 每次导入官方版本时打的标签，当前基线：`upstream/storify-3.1.0`（Web 3.1.0 + 顾客 App 1.0.0 + 商户 App 1.0.0） |
| `main` 分支 | 官方代码 + eSIM 模块，通过 `git merge upstream` 获得官方更新 |

## 改动官方文件的规则

1. 能新建文件就不改官方文件。eSIM 代码放在这些目录（均为新增，不在官方代码里）：
   - Web：`lib/esim/`、`models/esim-*.model.ts`、`components/esim/`、`app/api/esim/`、`app/api/cron/esim-*/`、`app/[locale]/(store)/esim/`、`app/[locale]/admin/esim/`、`lib/storefront/sections/definitions/esim-*.tsx`、`locales/esim/`
   - 顾客 App：`src/features/esim/`
2. 必须改官方文件时：改动尽量只有「一行 import + 一行注册/调用」，逻辑全部放到 eSIM 目录里。
3. 每处改动用注释标记，便于搜索：`// [esim-patch] P<编号> <一句话说明>`（JSON 等不能写注释的文件在本表注明即可）。
4. 改完立刻在下表登记（文件路径用反引号包起来，`tools/check-patches.sh` 靠它核对）。
5. 不要格式化、重排官方文件的其他部分。

## 插入点清单

状态：`计划` = 方案中预计要改、尚未动手；`已改` = 已在 main 上修改。
位置写函数/常量名，不写行号（官方升级后行号会变）。

| 编号 | 状态 | 文件 | 位置 | 改动内容 | 升级后检查 |
|---|---|---|---|---|---|
| P1 | 计划 | `Storify-main-app/lib/storefront/sections/registry.ts` | `DEFINITIONS` 数组 | import 并加入 eSIM 区块定义 | 数组是否仍存在、区块类型契约 `SectionDefinition`（`sections/types.ts`）是否有破坏性变化；后台「添加区块」里能看到 eSIM 区块 |
| P2 | 计划 | `Storify-main-app/lib/storefront/themes/registry.ts` | `THEME_MANIFESTS` 数组 | 加入 eSIM 主题 manifest | `ThemeManifest`（`themes/types.ts`）、`ThemeTokenOverrides`（`themes/tokens.ts`）字段是否变化；后台主题列表可切换到 eSIM 主题 |
| P3 | 计划 | `Storify-main-app/lib/payments/finalize-order.ts` | `settleCapturedOrder` 末尾（`runAfterResponse(notifyShopper)` 附近） | 支付入账后异步调用 `esimOnOrderPaid(order)`（幂等） | 函数是否改名/拆分、所有网关是否仍汇合到这里；用每个已启用的网关各下一单测试开卡 |
| P4 | 计划 | `Storify-main-app/lib/orders/order-refund.ts`（及取消流程，待定） | 退款/取消成功后 | 调用 `esimOnOrderRefunded(order)` 回收或作废 eSIM | 退款、取消、售罄自动退款三条路径都触发 |
| P5 | 计划 | `Storify-main-app/components/layout/dashboard-sidebar.tsx` | 管理后台菜单配置 | 加「eSIM」菜单组 | 菜单结构/权限键是否变化 |
| P6 | 计划 | `Storify-main-app/config/permissions.config.ts` | 权限定义 | 加 eSIM 管理权限 | 员工角色里能分配 eSIM 权限 |
| P7 | 计划 | `Storify-main-app/contracts/mobile/shop/v1/home.ts` | `HOME_BLOCKS` 映射与 `HomeBlock` 联合类型 | 注册 eSIM 首页区块 schema | 修改后需在顾客 App 执行 `pnpm contracts:sync` |
| P8 | 计划 | `storify-customer-app/src/features/home/blocks/index.ts` | 区块渲染映射 | 注册 eSIM 区块组件 | App 首页渲染 eSIM 区块；老版本 App 忽略未知区块不崩溃 |
| P9 | 计划 | `Storify-main-app/lib/i18n/request.ts` | 加载 locale 消息处 | 合并 `locales/esim/<locale>.json`，不改官方 `locales/*.json` | 切换中英文 eSIM 文案正常 |
| P10 | 计划 | 订单行 / 购物车行模型（`Storify-main-app/models/cart.model.ts`、`Storify-main-app/models/order.model.ts`，待定） | 行项目 schema | **仅当**充值必须在行上记录 ICCID 时才改；优先用旁路集合避免此项 | 若已改：官方是否改动行 schema，合并时重点人工核对 |

> 新增插入点时按编号往后加；某项最终没改，就把状态改为 `取消` 并保留记录。

## 官方发布新版时的升级流程

前提：工作区干净（`git status` 无改动），在仓库根目录用 Git Bash 执行。

1. **导入到 upstream**（每个子项目分别执行，脚本不会动 main）：

   ```bash
   tools/import-upstream.sh Storify-main-app /c/path/to/storify-3.2.0 3.2.0
   ```

   子项目目录名固定为不带版本号的 `Storify-main-app`，官方压缩包里的目录名（如 `Storify-main-app-v3.2`）不要照搬——改目录名会让所有插入点变成「删除 + 新增」，无法合并。顾客/商户 App 的 `contracts:sync` 默认也是去 `../Storify-main-app` 找 Web 工程。
   根目录的 APK 如需更新，切到 upstream 的临时 worktree 手动替换并提交。

2. **看官方改了什么**：

   ```bash
   git diff --stat upstream/storify-3.1.0 upstream
   ```

   重点看本清单里「文件」列的那些文件有没有被官方改动，并阅读官方的更新说明（尤其是标记为 `Required if you set MONGODB_AUTO_INDEX=false` 的 `pnpm db:migrate` 步骤）。

3. **合并进 main**（建议先开分支）：

   ```bash
   git switch -c merge/upstream-3.2.0 main
   git merge upstream
   ```

   冲突应只出现在本清单登记的文件里。解决时保留官方新代码，再把 `[esim-patch]` 那几行重新放到对应位置。

4. **核对插入点**：

   ```bash
   tools/check-patches.sh
   ```

   确认没有「未登记」的官方文件改动，`[esim-patch]` 标记数量与「已改」条目一致。然后按上表「升级后检查」一列逐项手动验证。

5. **构建与回归**：Web 执行 `pnpm install && pnpm typecheck && pnpm lint && pnpm build`；顾客 App 执行 `pnpm contracts:sync && pnpm check`。测试下单 → 支付 → 开卡 → 退款全流程后再合并回 main。

## 升级记录

| 日期 | 官方版本 | upstream 标签 | 冲突文件 | 备注 |
|---|---|---|---|---|
| 2026-10-25 | Web 3.1.0 / 顾客 App 1.0.0 / 商户 App 1.0.0 | `upstream/storify-3.1.0` | — | 初始基线；Web 目录由 `Storify-main-app-v3.1` 改名为 `Storify-main-app`（提交 0b410e2，upstream 与 main 同步） |
