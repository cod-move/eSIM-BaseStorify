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
| P3 | 已改 | `Storify-main-app/lib/payments/finalize-order.ts` | `settleCapturedOrder` 末尾，紧跟 `await runAfterResponse(notifyShopper);` 之后 | 动态 import `@/lib/esim/fulfillment`：`esimQueueOrder` 同步写开卡任务（只写库、幂等），有任务时用 `runAfterResponse` 调 `esimFulfilOrder` 购卡；整段 try/catch，绝不影响已入账的支付 | 函数是否改名/拆分、所有网关是否仍汇合到这里；用每个已启用的网关各下一单测试开卡 |
| P4 | 计划 | `Storify-main-app/lib/orders/order-refund.ts`（及取消流程，待定） | 退款/取消成功后 | 调用 `esimOnOrderRefunded(order)` 回收或作废 eSIM | 退款、取消、售罄自动退款三条路径都触发 |
| P5 | 计划 | `Storify-main-app/components/layout/dashboard-sidebar.tsx` | 管理后台菜单配置 | 加「eSIM」菜单组 | 菜单结构/权限键是否变化 |
| P6 | 计划 | `Storify-main-app/config/permissions.config.ts` | 权限定义 | 加 eSIM 管理权限 | 员工角色里能分配 eSIM 权限 |
| P7 | 计划 | `Storify-main-app/contracts/mobile/shop/v1/home.ts` | `HOME_BLOCKS` 映射与 `HomeBlock` 联合类型 | 注册 eSIM 首页区块 schema | 修改后需在顾客 App 执行 `pnpm contracts:sync` |
| P8 | 计划 | `storify-customer-app/src/features/home/blocks/index.ts` | 区块渲染映射 | 注册 eSIM 区块组件 | App 首页渲染 eSIM 区块；老版本 App 忽略未知区块不崩溃 |
| P9 | 计划 | `Storify-main-app/lib/i18n/request.ts` | 加载 locale 消息处 | 合并 `locales/esim/<locale>.json`，不改官方 `locales/*.json` | 切换中英文 eSIM 文案正常 |
| P10 | 已改（天数；充值 ICCID、激活日期待 Top-up） | 见下方「P10 明细」，共 13 个文件 | 购物车行、订单行 schema，加购、结账定价、建单复制、商品页 | 加通用 `lineAttributes` 对象，内容由 eSIM 模块（`lib/esim/cart`）校验、定价；目前只收 `days`（按天计价套餐的天数）。**同一规格只占一行**：同一规格换了天数再加购，就替换这一行的天数和数量（因为官方购物车、App、`productId-variantId` 的行 id 都只按商品 + 规格区分行） | 见「P10 明细」每行的检查项；整条链路：商品页选天数 → 加购 → 购物车显示「· N days」→ 三种结账（跳转网关、Stripe 卡、`POST /api/orders`）→ 订单行有 `lineAttributes` 且规格名是所选天数 → 开卡按天数购买 |
| P11 | 已改（Web 的「我的 eSIM」） | `Storify-main-app/components/account/account-nav-links.ts`（App 端位置待定） | `dashboardLinks` 数组「订单」项之后；lucide 导入里加 `Smartphone` | 加「我的 eSIM」入口（`/account/esims`，labelKey `esim.account.title`，兜底 "My eSIMs"）；「钱包」「推荐」入口待做 | 侧栏/手机端菜单仍显示该入口；`AccountNavLink` 结构是否变化 |
| P12 | 计划 | `Storify-main-app/models/store-credit.model.ts` | `STORE_CREDIT_SOURCES` | 加「充值」「推荐佣金」来源 | 枚举及读取它的报表是否变化 |
| P13 | 计划 | 订单详情页（顾客端 + 后台，位置待定） | 订单行展示处 | 显示开卡状态和 eSIM 入口 | 页面结构是否变化 |
| P14 | 计划 | 注册流程（`Storify-main-app/lib/auth/` 下，位置待定） | 创建用户后 | 记录推荐人 | 注册接口和社交登录注册都能记到推荐人 |
| P15 | 计划 | `Storify-main-app/lib/payments/checkout-gateways.ts` 的 `CHECKOUT_GATEWAY_IDS`，以及引用网关枚举的约 30 个文件 | 网关枚举 | 一次性加入通用「扩展支付」网关，后面挂 eSIM 的网关插件 | 官方新增或改名网关时逐个核对引用点；用扩展支付各下一单、各退一单 |
| P16 | 计划 | `Storify-main-app/lib/auth/auth.ts` | 邮箱密码登录的密码校验 | 新方式校验失败且是 bcrypt 格式时用 bcrypt 校验，通过后按新方式重新加密 | 旧系统导入的用户能登录，登录后哈希已换成新格式 |

> 新增插入点时按编号往后加；某项最终没改，就把状态改为 `取消` 并保留记录。

### P10 明细

路径都在 `Storify-main-app/` 下。每处都带 `// [esim-patch] P10`（JSX 里写成 `{/* [esim-patch] P10 … */}`）。

| 文件 | 位置 | 改动 | 升级后检查 |
|---|---|---|---|
| `types/index.ts` | `CartItem`、订单行接口，`quoteId` 之后 | 加 `lineAttributes?: Record<string, unknown>` | 两个接口是否改名或拆分 |
| `models/cart.model.ts` | `CartItemSchema`，`quoteId` 之后 | 加 `lineAttributes`（Mixed） | 行 schema 是否改结构 |
| `models/order.model.ts` | 订单行 schema，`quoteId` 之后 | 同上 | 同上；子订单行是否仍用同一 schema |
| `lib/validations/index.ts` | `CartAddByIdSchema` | 加 `lineAttributes` 可选对象 | 加购请求体是否仍用这个 schema |
| `lib/cart/cart-service.ts` | 导入；`CartLineInput`、`MutableCartItem`；`putLine` 定价处和新旧行赋值处 | 调 `esimCartLine(line)` 取天数、单价、带天数的规格名；天数不同就替换数量 | `putLine` 是否仍是加购和 App upsert 的唯一入口；同一规格是否仍只占一行 |
| `lib/checkout/prepare-checkout.ts` | 导入；逐行定价循环之前；`livePrice` 表达式 | `esimLinePrices(items)` 先算好，`livePrice` 优先取它 | 跳转网关结账是否仍在这里按实时价重定价 |
| `lib/checkout/stripe-card-intent.ts` | 同上 | 同上 | Stripe 卡支付是否仍在这里重定价 |
| `app/api/orders/route.ts` | 导入；本地购物车行类型；`resolveCurrentItemPrice` 之前和其中；订单行 `quoteId` 之后；两处 `orderLineVariantSnapshot` | 同上定价；订单行复制 `lineAttributes`；规格快照套 `withLineDays` | 建单是否仍走这三处 |
| `lib/checkout/checkout-order-document.ts` | 导入；`CheckoutCartItem`；`variantSnapshotByLine`；订单行 `quoteId` 之后 | 复制 `lineAttributes`；规格快照套 `withLineDays` | 订单文档是否仍由这里组装 |
| `lib/payments/stripe-orders.ts` | 导入；行类型；`getVariantSnapshot`；订单行 `quoteId` 之后和末尾快照展开处 | 同上 | Stripe 订单是否仍从购物车行组装 |
| `hooks/use-cart.tsx` | `addItem` 的请求体 | 带上 `item.lineAttributes` | 加购是否仍走 `POST /api/cart/items` |
| `components/products/product-purchase.tsx` | `useProductPurchaseState`：新 state、`displayedPrice`、`cartLine()`、返回值 | `lineOptions` / `setLineOptions`：所选规格的行属性和对应单价 | 购买状态 hook 和 `cartLine()` 是否改名或改结构 |
| `components/products/product-purchase-rows.tsx` | 导入；`PurchaseVariantsRow` 选项列表之后 | 渲染 `EsimDayPicker`（不是按天计价的规格时什么也不画） | 规格行组件是否仍存在；主题自定义商品页时是否还用它 |

不需要改的地方（已核对）：
- `GET /api/cart`（`getCartView`）直接显示行上存的价格，而加购时已经按天数定价。
- 改数量（`setCartItemQuantity`）不重新定价。
- 游客购物车并入账户时，保留账户行的天数，结账时再重定价。
- 旧的 `POST /api/cart` 没有调用方，而且结账时 eSIM 行反正会重新定价。
- 结账重试指纹（`checkoutAttemptFingerprint`）里有价格，天数变了价格就变。做 Top-up 时，充值 ICCID 不影响价格，要把 `lineAttributes` 加进这个指纹。

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
