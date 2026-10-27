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
   - Web 移动接口：`contracts/mobile/shop/v1/esim.ts`（不进 `index.ts`，按路径引用）、`app/api/mobile/shop/v1/[locale]/me/esims/`、`app/api/mobile/shop/v1/[locale]/esim/`、`lib/esim/mobile/`
   - 顾客 App：`src/features/esim/`、`src/api/endpoints/esims.ts`、`src/api/query-keys/esims.ts`、`src/app/(tabs)/(1-home,2-search,3-categories,4-cart,5-account)/account/esims/`、`…/esim/`（目的地，路径与网站相同）、`src/contracts/mobile/shop/v1/esim.ts`（从 Web 复制）
2. 必须改官方文件时：改动尽量只有「一行 import + 一行注册/调用」，逻辑全部放到 eSIM 目录里。
3. 每处改动用注释标记，便于搜索：`// [esim-patch] P<编号> <一句话说明>`（JSON 等不能写注释的文件在本表注明即可）。
4. 改完立刻在下表登记（文件路径用反引号包起来，`tools/check-patches.sh` 靠它核对）。
5. 不要格式化、重排官方文件的其他部分。

## 插入点清单

状态：`计划` = 方案中预计要改、尚未动手；`已改` = 已在 main 上修改。
位置写函数/常量名，不写行号（官方升级后行号会变）。

| 编号 | 状态 | 文件 | 位置 | 改动内容 | 升级后检查 |
|---|---|---|---|---|---|
| P1 | 已改 | `Storify-main-app/lib/storefront/sections/registry.ts` | 导入区；`DEFINITIONS` 数组里 `becomeVendor` 之后 | 导入 `ESIM_SECTIONS`（`lib/esim/storefront/sections`），在数组里展开：7 个 `esim-*` 区块（目的地搜索、热门目的地、国家/地区/全球、套餐选择器、使用流程、安装指引、机型检查） | 数组是否仍存在、区块类型契约 `SectionDefinition`（`sections/types.ts`）是否有破坏性变化；后台「添加区块」里能看到 eSIM 区块 |
| P2 | 已改 | `Storify-main-app/lib/storefront/themes/registry.ts` | 导入区；`THEME_MANIFESTS` 数组最后一项（不放第一项：`themes/key-colors.ts` 用 `THEME_MANIFESTS[0]` 兜底） | 导入并加入 `esimTheme`（`lib/esim/storefront/theme.ts`，id `esim-travel`）：设计变量 + 用 eSIM 区块搭的首页预设，商品页和页头页脚沿用 Classic 的预设 | `ThemeManifest`（`themes/types.ts`）、`ThemeTokenOverrides`（`themes/tokens.ts`）字段是否变化；后台主题列表可切换到 eSIM 主题 |
| P3 | 已改 | `Storify-main-app/lib/payments/finalize-order.ts` | `settleCapturedOrder` 末尾，紧跟 `await runAfterResponse(notifyShopper);` 之后 | 动态 import `@/lib/esim/fulfillment`：`esimQueueOrder` 同步写开卡任务（只写库、幂等），有任务时用 `runAfterResponse` 调 `esimFulfilOrder` 购卡；整段 try/catch，绝不影响已入账的支付 | 函数是否改名/拆分、所有网关是否仍汇合到这里；用每个已启用的网关各下一单测试开卡 |
| P4 | 计划 | `Storify-main-app/lib/orders/order-refund.ts`（及取消流程，待定） | 退款/取消成功后 | 调用 `esimOnOrderRefunded(order)` 回收或作废 eSIM | 退款、取消、售罄自动退款三条路径都触发 |
| P5 | 已改 | `Storify-main-app/components/layout/dashboard-sidebar.tsx` | 导入区；`adminNavGroups` 里「商品」项之后 | 插入 `ESIM_ADMIN_NAV`（`lib/esim/admin/nav.ts`）：eSIM 菜单组（套餐库、定价、供应商），图标名取侧栏 `iconMap` 里已有的 | `adminNavGroups` / `NavItem` 结构是否变化、`iconMap` 是否还有 Globe/ListTree/Percent/Landmark；受限团队成员只在有 eSIM 权限时看到这一组 |
| P6 | 已改 | `Storify-main-app/config/team-permissions.config.ts`、`Storify-main-app/config/team-permission-groups.ts`、`Storify-main-app/lib/access/team-route-permissions.ts` | `ADMIN_AREA_PERMISSIONS` 末尾；`TEAM_PERMISSION_GROUPS` 的 selling 组「Quotes」之后；`TEAM_PAGE_RULES` 的 `/admin/quotes` 之后 | 加 `view_esim` / `manage_esim`（`lib/esim/admin/permissions.ts`）、角色编辑器里的「eSIM」一行、`/admin/esim` 页面规则；eSIM 的 API 路由自己用 `withApi` 的 `teamPermissions` 声明权限，不改官方 API 规则表 | 三个文件的结构是否变化；在团队角色里勾选/取消 eSIM 权限后，受限成员能否进入 `/admin/esim` 和调用 `/api/esim/admin/*` |
| P7 | 计划 | `Storify-main-app/contracts/mobile/shop/v1/home.ts` | `HOME_BLOCKS` 映射与 `HomeBlock` 联合类型 | 注册 eSIM 首页区块 schema | 修改后需在顾客 App 执行 `pnpm contracts:sync` |
| P8 | 计划 | `storify-customer-app/src/features/home/blocks/index.ts` | 区块渲染映射 | 注册 eSIM 区块组件 | App 首页渲染 eSIM 区块；老版本 App 忽略未知区块不崩溃 |
| P9 | 已改 | `Storify-main-app/lib/i18n/request.ts` | 导入区；`getRequestConfig` 返回的 `messages` | 用 `withEsimMessages(locale, messages[locale])`（`lib/esim/i18n/messages.ts`）合并 `locales/esim/<locale>.json`（目前 en、zh）；同名键以官方为准，不改官方 `locales/*.json` | `getRequestConfig` 返回结构是否变化、是否有别处绕过它直接读 locale 文件；切换中英文时 eSIM 页面和后台区块名称正常 |
| P10 | 已改（天数、充值；激活日期待做） | 见下方「P10 明细」，共 16 个文件 | 购物车行、订单行 schema，加购、结账定价、建单复制、商品页、Stripe 购物车指纹 | 加通用 `lineAttributes` 对象，内容由 eSIM 模块（`lib/esim/cart`）校验、定价；收 `days`（按天计价套餐的天数）和 `topup`（充值报价 id，服务端再补上 `iccid` 和行名 `label`）。**同一规格只占一行**：同一规格换了天数再加购，就替换这一行的天数和数量；充值行永远是 1 件，再加一次就替换（因为官方购物车、App、`productId-variantId` 的行 id 都只按商品 + 规格区分行） | 见「P10 明细」每行的检查项；整条链路：商品页选天数 → 加购 → 购物车显示「· N days」→ 三种结账（跳转网关、Stripe 卡、`POST /api/orders`）→ 订单行有 `lineAttributes` 且规格名是所选天数 → 开卡按天数购买 |
| P11 | 已改（Web 的「我的 eSIM」） | `Storify-main-app/components/account/account-nav-links.ts`（App 端位置待定） | `dashboardLinks` 数组「订单」项之后；lucide 导入里加 `Smartphone` | 加「我的 eSIM」入口（`/account/esims`，labelKey `esim.account.title`，兜底 "My eSIMs"）；「钱包」「推荐」入口待做 | 侧栏/手机端菜单仍显示该入口；`AccountNavLink` 结构是否变化 |
| P12 | 已改（充值；推荐佣金改用 goodwill，见 P14） | `Storify-main-app/models/store-credit.model.ts` | `STORE_CREDIT_SOURCES` 末尾 | 加 `wallet_topup`（钱包充值买来的余额）。这种余额由卖它的订单记账（见 P19），所以余额批次本身不过账：`post-events.ts` 只给 `goodwill` 和过期过账，不需要改 | 枚举是否改名；读取来源的报表、邮件文案（`lib/email/store-credit-emails.ts` 只认识退款和 goodwill，钱包充值用 eSIM 模块自己的邮件）；`post-events.ts` 是否开始给其他来源过账 |
| P13 | 计划 | 订单详情页（顾客端 + 后台，位置待定） | 订单行展示处 | 显示开卡状态和 eSIM 入口 | 页面结构是否变化 |
| P14 | 已改 | `Storify-main-app/lib/auth/auth.ts` | `databaseHooks.user.create.after`（在官方 `onUserCreated` 之后） | 把请求头交给 `esimOnUserCreated`（`lib/esim/referral/service.ts`）：读邀请 cookie `esim_ref`（由 `/esim/invite/<code>` 写入，30 天），记录推荐关系并按设置给好友生成仅限本人的欢迎优惠券；出错只记日志，不影响注册。推荐佣金用 Storify 现有的 `goodwill` 余额来源（记为营销费用），所以 P12 不再需要「推荐佣金」来源 | 用户创建钩子是否改名或改成别的回调签名；`ctx.request?.headers ?? ctx.headers` 是否还能拿到 Cookie；邮箱注册、社交登录、结账时建账号三种方式都能记到推荐人；跑 `scripts/esim-dev-referrals.ts` |
| P15 | 已改 | `Storify-main-app/lib/validations/index.ts`、`Storify-main-app/app/api/payments/checkout/route.ts`、`Storify-main-app/app/api/settings/public/route.ts`、`Storify-main-app/components/checkout/checkout-content.tsx`、`Storify-main-app/components/checkout/checkout-helpers.tsx`、`Storify-main-app/components/common/payment-method-meta.ts`、`Storify-main-app/lib/payments/payment-custody.ts`、`Storify-main-app/models/checkout-attempt.model.ts` | `CheckoutSchema.paymentMethod` 枚举；结账路由 ioTec 分支之前；公开设置 `payment` 段（`mtnMomoEnabled` 之后）；结账页表单枚举、`paymentConfig` 类型、`configuredAny`、`paymentMethods`（MTN 之后）、`redirectPaymentProvider`；`CheckoutFormData` 与 `PaymentProviderLogo`；后台支付方式名称；`PLATFORM_GATEWAY_PAYMENT_METHODS`；`AttemptGatewayRefsSchema` 与唯一索引列表 | 一次性加入通用支付方式 `extension`（结账页显示为「更多支付方式」）：结账只写 checkout attempt（`gateway.extensionReference`），然后跳到 eSIM 支付页 `/esim/pay/<ref>`，顾客在那里选插件（`lib/esim/payments/`，首批 BEpusdt、RedeePay 微信/支付宝）。网关签名通知确认付款后，用 Storify 自己的 `finalizeCapturedAttempt` 生成订单。退款按 Storify 规则记为手动退款（`extension` 不在 `GATEWAY_REFUND_METHODS` 里）。没有启用的方式时公开设置返回空列表，结账页不显示。没改原计划里的 `CHECKOUT_GATEWAY_IDS`：方式的开关和密钥放在 eSIM 后台，不进 Storify 的支付设置 | 结账路由是否仍按 `paymentMethod` 分支、`openGatewayAttempt`/`takeOverOpenAttempt`/`recordAttemptGatewayRefs`/`finalizeCapturedAttempt`/`findAttemptByGatewayRef` 签名是否变化；attempt 的 `gateway` 子文档是否仍是严格 schema（新引用要登记字段）；新增网关时各枚举是否换了位置；退款判断 `refundSettlesOutOfBand` 是否仍把未知方式当手动；对账 sweep（`checkout-expiry.ts` 的 `PROBES`）是否开始处理未知方式；App 端 `lib/api-core/shop/checkout/redirect-payment.ts` 未接入（App 里结账暂不出现该方式）；跑 `scripts/esim-dev-payments.ts` |
| P16 | 已改 | `Storify-main-app/lib/auth/auth.ts` | 导入区；`emailAndPassword` 配置末尾 | 加 `password: { hash: hashPassword, verify: verifyAnyPassword }`（`lib/esim/migration/legacy-password.ts`）：bcrypt 格式（Laravel 的 `$2y$`）用 bcrypt 校验，通过后把该凭证账号的哈希换成 Better Auth 自己的格式；其他哈希交给 Better Auth 原来的 `verifyPassword`，行为不变 | 官方是否改了默认密码哈希或 `password` 选项；凭证账号集合是否仍叫 `account`、字段仍是 `password`；跑 `scripts/esim-dev-legacy-login.ts` |
| P17 | 已改 | `Storify-main-app/app/sitemap.ts` | `sitemap()` 末尾，`return entries;` 之前 | 动态 import `@/lib/esim/storefront/catalog`，用同一个 `push` 加入 `/esim` 和每个在售目的地页（国家 `/esim/<slug>`、地区 `/esim/region/<slug>`、全球 `/esim/global`），沿用官方的多语言 hreflang；整段 try/catch，读不到 eSIM 目录不影响其余站点地图 | `push` 和 `entries` 是否改名；站点地图是否改成 `generateSitemaps()` 分文件（那时这段要挪进相应的文件）；`/sitemap.xml` 里能看到 eSIM 页面 |
| P19 | 已改 | `Storify-main-app/lib/finance/postings.ts`、`Storify-main-app/lib/finance/post-events.ts`、`Storify-main-app/lib/orders/preorder-cancel-refund.ts` | `postings.ts`：导入区、`PostingOrder` 末尾、`orderPaidPostings` 自营分支收入分录之前；`post-events.ts`：`ORDER_POSTING_PROJECTION` 末尾；`preorder-cancel-refund.ts`：导入区、`getOrderRefundCeiling` 返回处 | 钱包充值订单的记账：订单行里充值金额那部分（`walletCreditOf`，`lib/esim/wallet/booking.ts`）记「借：现金 / 贷：store credit payable」，收入只剩手续费；为此投影多读订单行的 `price quantity lineAttributes`。退款上限减去这部分，所以任何退款路径都只能退手续费，余额不会再被退成钱 | 订单过账是否仍在 `orderPaidPostings` 的自营分支一笔记收入；`decomposeOrder` 的 merchandise 是否仍是「扣完优惠后的商品额」；退款路径（后台订单、退货、换货、预售取消、eSIM 失败退款）是否都还经过 `getOrderRefundCeiling`；跑 `scripts/esim-dev-wallet.ts` |
| P18 | 已改 | `Storify-main-app/vercel.json`、`Storify-main-app/lib/cron/health.ts` | `vercel.json` 的 `crons` 数组末尾；`health.ts` 导入区和 `CRON_STALE_AFTER_MS` 末尾 | `vercel.json` 加四个 eSIM 定时任务：`/api/cron/esim-fulfillment` 每分钟、`/api/cron/esim-catalog` 每 6 小时、`/api/cron/esim-fx` 每天 15:30 UTC、`/api/cron/esim-usage` 每 30 分钟（JSON 不能写注释，所以没有 `[esim-patch]` 标记）；`CRON_STALE_AFTER_MS` 展开 `ESIM_CRON_STALE_AFTER_MS`（`lib/esim/admin/cron-config.ts`），任务停跑时后台仪表盘会提示 | 官方新版的 `vercel.json` 覆盖后这四条是否还在（升级时最容易丢）；`CRON_STALE_AFTER_MS` 是否改名；Vercel Hobby 套餐只支持每天一次，每分钟的开卡兜底需要 Pro 或自建定时器；自建服务器用系统定时任务带 `CRON_SECRET` 调这四个地址 |
| P20 | 已改 | `Storify-main-app/lib/finance/accounts.ts`、`Storify-main-app/components/admin/finance/adjustment-dialog.tsx`、`Storify-main-app/components/admin/finance/finance-overview.tsx` | `LEDGER_ACCOUNT`（`OPENING_INVENTORY_EQUITY` 之后）、`LEDGER_ACCOUNT_TYPES`；两个组件的 `ACCOUNT_LABELS` | 加权益科目 `opening_balance_equity`（期初余额权益）：旧站迁移来的余额记「借：期初余额权益 / 贷：store credit payable」（`lib/esim/migration/import.ts`），表示欠顾客的钱但不是在新站收的。中英文名称放在 `locales/esim/*.json` 的 `finance.account` 下，不改官方语言包 | 科目表是否改名或改成可编辑；`Record<LedgerAccount, …>` 的完整映射是否出现在新文件里（tsc 会报）；报表是否按科目类型汇总权益；跑 `scripts/esim-dev-migration.ts` |
| P21 | 已改 | `Storify-main-app/package.json`、`Storify-main-app/pnpm-lock.yaml` | `dependencies` | 加 `mysql2`（JSON，无法加标记）：后台「数据迁移」读取旧站 MySQL（`lib/esim/migration/legacy-source.ts`），连接只来自 `.env` 的 `LEGACY_MYSQL_*`，只读一致性快照 | 官方升级 `package.json` 时保留这一行；合并后重新 `pnpm install` |
| P22 | 已改 | `Storify-main-app/lib/api-core/shop/registry.ts` | 导入区；`SHOP_V1_ROUTES` 里 `storeCreditRoutes` 之后 | 展开 `esimShopRoutes`（`lib/esim/mobile/esims.ts`）：`GET /me/esims`、`GET /me/esims/{id}`、`POST /me/esims/{id}/refresh`、`GET /esim/destinations`、`GET /esim/destinations/{scope}/{slug}`，供接口清单和策略测试读取；路由文件本身是新文件，不改官方 | 清单是否改名或改成自动扫描；`defineRoute` 的字段是否变化 |
| P23 | 已改 | `storify-customer-app/src/i18n/messages.ts`、`storify-customer-app/src/app-routes/account.tsx`、`storify-customer-app/src/features/account/account-home.tsx`、`storify-customer-app/src/api/query-keys/index.ts` | `messages.ts` 导入区、`Messages` 类型、`getMessages`；`accountScreens` 的登录分组末尾；账户页「Track Orders」之后；query keys 的导入和展开 | App 端「我的 eSIM」（APP-03/04）：合并 `src/features/esim/messages/*.json` 文案；注册 `account/esims` 两个页面；账户页加入口；加 `esimsKeys` | 文案加载方式、`ScreenList` 和账户页布局是否变化；官方 App 的契约副本与 Web 不一致（官方基线如此）：同步时只复制 `esim.ts`，不要整体 `contracts:sync`，否则会带入官方尚未适配的结账契约 |

> 新增插入点时按编号往后加；某项最终没改，就把状态改为 `取消` 并保留记录。

### P10 明细

路径都在 `Storify-main-app/` 下。每处都带 `// [esim-patch] P10`（JSX 里写成 `{/* [esim-patch] P10 … */}`）。

| 文件 | 位置 | 改动 | 升级后检查 |
|---|---|---|---|
| `types/index.ts` | `CartItem`、订单行接口，`quoteId` 之后 | 加 `lineAttributes?: Record<string, unknown>` | 两个接口是否改名或拆分 |
| `models/cart.model.ts` | `CartItemSchema`，`quoteId` 之后 | 加 `lineAttributes`（Mixed） | 行 schema 是否改结构 |
| `models/order.model.ts` | 订单行 schema，`quoteId` 之后 | 同上 | 同上；子订单行是否仍用同一 schema |
| `lib/validations/index.ts` | `CartAddByIdSchema` | 加 `lineAttributes` 可选对象 | 加购请求体是否仍用这个 schema |
| `lib/cart/cart-service.ts` | 导入；`CartLineInput`、`MutableCartItem`；`putLine` 定价处和新旧行赋值处；`setCartLine` 的 upsert 短路之前 | 调 `esimCartLine(line, { userId })` 取行属性、单价、规格名（充值行要求登录且是 eSIM 的主人）；天数不同或是充值行（`singleUnit`）就替换数量；App 的 upsert 带了不同天数时改走 `putLine`（由它替换） | `putLine` 是否仍是加购和 App upsert 的唯一入口；`userId` 变量是否还在；同一规格是否仍只占一行 |
| `lib/checkout/prepare-checkout.ts` | 导入；逐行定价循环之前；`livePrice` 表达式 | `esimLinePrices(items, { userId })` 先算好，`livePrice` 优先取它；充值行报价无效时抛 `ValidationError`（和缺货一样拒绝结账） | 跳转网关结账是否仍在这里按实时价重定价；`user` 变量是否还在 |
| `lib/checkout/stripe-card-intent.ts` | 同上 | 同上 | Stripe 卡支付是否仍在这里重定价 |
| `app/api/orders/route.ts` | 导入；本地购物车行类型；`resolveCurrentItemPrice` 之前和其中；订单行 `quoteId` 之后；两处 `orderLineVariantSnapshot` | 同上定价；订单行复制 `lineAttributes`；规格快照套 `withLineDays` | 建单是否仍走这三处 |
| `lib/checkout/checkout-order-document.ts` | 导入；`CheckoutCartItem`；`variantSnapshotByLine`；订单行 `quoteId` 之后 | 复制 `lineAttributes`；规格快照套 `withLineDays` | 订单文档是否仍由这里组装 |
| `lib/payments/stripe-orders.ts` | 导入；行类型；`getVariantSnapshot`；订单行 `quoteId` 之后和末尾快照展开处 | 同上 | Stripe 订单是否仍从购物车行组装 |
| `hooks/use-cart.tsx` | `addItem` 的请求体 | 带上 `item.lineAttributes` | 加购是否仍走 `POST /api/cart/items` |
| `components/products/product-purchase.tsx` | `useProductPurchaseState`：新 state、`displayedPrice`、`cartLine()`、返回值 | `lineOptions` / `setLineOptions`：所选规格的行属性和对应单价 | 购买状态 hook 和 `cartLine()` 是否改名或改结构 |
| `components/products/product-purchase-rows.tsx` | 导入；`PurchaseVariantsRow` 选项列表之后 | 渲染 `EsimDayPicker`（不是按天计价的规格时什么也不画） | 规格行组件是否仍存在；主题自定义商品页时是否还用它 |
| `lib/checkout/checkout-cart-fingerprint.ts` | `CartFingerprintLine`；`lineKey` 数组末尾 | 带 `lineAttributes` 的行把它加进指纹（只在有时才加，其他行的指纹不变） | Stripe 是否仍用这个指纹比对「报价时的购物车」和「建单时的购物车」；`lineKey` 是否改结构 |
| `contracts/mobile/shop/v1/cart.ts` | `SetCartLineRequest` | 加 `lineAttributes` 可选对象（App 的 `PUT /cart/lines`）；顾客 App 的副本 `storify-customer-app/src/contracts/mobile/shop/v1/cart.ts` 同步复制这一处 | App 的加购请求是否仍用这个 schema |
| `lib/api-core/shop/cart/set-cart-line.ts` | `setCartLineRoute` 调 `setCartLine` 处 | 把 `input.lineAttributes` 传给购物车 | 同上 |

不需要改的地方（已核对）：
- `GET /api/cart`（`getCartView`）直接显示行上存的价格，而加购时已经按天数定价。
- 改数量（`setCartItemQuantity`）不重新定价。
- 游客购物车并入账户时，保留账户行的天数，结账时再重定价。
- 旧的 `POST /api/cart` 没有调用方，而且结账时 eSIM 行反正会重新定价。
- 充值商品是普通的上架商品（`status: active`），只是不发布到网店（`publishing.onlineStore: false`）：所有网店查询都按这个渠道过滤（`lib/catalog/product-visibility.ts`），购物车和结账不过滤，所以不用为「隐藏商品」再改官方文件。
- 改数量（`setCartItemQuantity`）可以把充值行改成 2 件，但结账时 `esimLinePrices` 会拒绝，不会多扣钱。
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
