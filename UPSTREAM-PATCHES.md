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
| P4 | 已改 | `Storify-main-app/lib/payments/payment-transactions.ts` | `createRefundTransaction` 末尾，`return txn` 之前 | 每笔退款记录写入后（后台退款、退货、网关退款同步、Pesapal 冲正、店铺余额退款、预售取消都经过这里），响应结束后调用 `esimOnOrderRefunded`（`lib/esim/cancel/service.ts`）：整单退款或已取消的订单，停止尚未购买的开卡/充值任务，未安装的 eSIM 在供应商处作废，已安装或供应商不支持作废的通知管理员；部分退款只提醒管理员。eSIM 模块自己的退款带 `metadata.esim`，不会再触发。开卡任务执行前也会检查订单（`lib/esim/fulfillment/service.ts`） | `createRefundTransaction` 是否仍是所有退款的记录入口；`metadata` 是否仍原样写入；跑 `scripts/esim-dev-cancel.ts` |
| P5 | 已改 | `Storify-main-app/components/layout/dashboard-sidebar.tsx` | 导入区；`adminNavGroups` 里「商品」项之后 | 插入 `ESIM_ADMIN_NAV`（`lib/esim/admin/nav.ts`）：eSIM 菜单组（套餐库、定价、供应商），图标名取侧栏 `iconMap` 里已有的 | `adminNavGroups` / `NavItem` 结构是否变化、`iconMap` 是否还有 Globe/ListTree/Percent/Landmark；受限团队成员只在有 eSIM 权限时看到这一组 |
| P6 | 已改 | `Storify-main-app/config/team-permissions.config.ts`、`Storify-main-app/config/team-permission-groups.ts`、`Storify-main-app/lib/access/team-route-permissions.ts` | `ADMIN_AREA_PERMISSIONS` 末尾；`TEAM_PERMISSION_GROUPS` 的 selling 组「Quotes」之后；`TEAM_PAGE_RULES` 的 `/admin/quotes` 之后 | 加 `view_esim` / `manage_esim`（`lib/esim/admin/permissions.ts`）、角色编辑器里的「eSIM」一行、`/admin/esim` 页面规则；eSIM 的 API 路由自己用 `withApi` 的 `teamPermissions` 声明权限，不改官方 API 规则表 | 三个文件的结构是否变化；在团队角色里勾选/取消 eSIM 权限后，受限成员能否进入 `/admin/esim` 和调用 `/api/esim/admin/*` |
| P7 | 已改 | `Storify-main-app/contracts/mobile/shop/v1/home.ts`、`Storify-main-app/lib/api-core/shop/home/blocks.ts`、`storify-customer-app/src/contracts/mobile/shop/v1/home.ts`（App 契约副本，与 Web 一致，直接复制） | `home.ts` 导入区、`HOME_BLOCKS` 末尾、`HomeBlock` 联合类型末尾；`blocks.ts` 导入区、`HOME_BLOCK_MAPPERS` 末尾 | 注册 eSIM 首页区块（APP-01）：`ESIM_DESTINATIONS`（目的地搜索框 + 热门/指定目的地，对应 `esim-hero`、`esim-popular`、`esim-destination-tabs`）和 `ESIM_DEVICE_CHECK`（对应 `esim-device-check`，进入「我的手机支持吗」）；schema 写在 `esim.ts`，映射写在 `lib/esim/mobile/home.ts`。「使用流程」「安装指引」区块暂只在网页显示 | 首页区块映射表是否改名；`DrawnSection` 结构是否变化；老版本 App 遇到未知区块是否仍跳过（契约约定如此） |
| P8 | 已改 | `storify-customer-app/src/features/home/blocks/index.ts` | 导入区；`HOME_BLOCK_VIEWS` 末尾 | 注册两个 eSIM 区块组件（`src/features/esim/home-blocks.tsx`）；TypeScript 要求契约里每种区块都有组件，所以 P7 和 P8 必须一起改 | App 首页显示 eSIM 区块；`BlockViews` 类型是否变化 |
| P9 | 已改 | `Storify-main-app/lib/i18n/request.ts` | 导入区；`getRequestConfig` 返回的 `messages` | 用 `withEsimMessages(locale, messages[locale])`（`lib/esim/i18n/messages.ts`）合并 `locales/esim/<locale>.json`（目前 en、zh）；同名键以官方为准，不改官方 `locales/*.json`。例外：`locales/esim/store/<locale>.json` 翻译官方自己缺失或仍是英文的文字（结账页，目前 zh、ja、ar、bn），叠加在官方之上 | `getRequestConfig` 返回结构是否变化、是否有别处绕过它直接读 locale 文件；切换中英文时 eSIM 页面和后台区块名称正常 |
| P10 | 已改（天数、充值、激活日期） | 见下方「P10 明细」，共 16 个文件 | 购物车行、订单行 schema，加购、结账定价、建单复制、商品页、Stripe 购物车指纹 | 加通用 `lineAttributes` 对象，内容由 eSIM 模块（`lib/esim/cart`）校验、定价；收 `days`（按天计价套餐的天数）和 `topup`（充值报价 id，服务端再补上 `iccid` 和行名 `label`）。**同一规格只占一行**：同一规格换了天数再加购，就替换这一行的天数和数量；充值行永远是 1 件，再加一次就替换（因为官方购物车、App、`productId-variantId` 的行 id 都只按商品 + 规格区分行） | 见「P10 明细」每行的检查项；整条链路：商品页选天数 → 加购 → 购物车显示「· N days」→ 三种结账（跳转网关、Stripe 卡、`POST /api/orders`）→ 订单行有 `lineAttributes` 且规格名是所选天数 → 开卡按天数购买 |
| P11 | 已改（Web 的「我的 eSIM」） | `Storify-main-app/components/account/account-nav-links.ts`（App 端位置待定） | `dashboardLinks` 数组「订单」项之后；lucide 导入里加 `Smartphone` | 加「我的 eSIM」入口（`/account/esims`，labelKey `esim.account.title`，兜底 "My eSIMs"）；「钱包」「推荐」入口待做 | 侧栏/手机端菜单仍显示该入口；`AccountNavLink` 结构是否变化 |
| P12 | 已改（充值；推荐佣金改用 goodwill，见 P14） | `Storify-main-app/models/store-credit.model.ts` | `STORE_CREDIT_SOURCES` 末尾 | 加 `wallet_topup`（钱包充值买来的余额）。这种余额由卖它的订单记账（见 P19），所以余额批次本身不过账：`post-events.ts` 只给 `goodwill` 和过期过账，不需要改 | 枚举是否改名；读取来源的报表、邮件文案（`lib/email/store-credit-emails.ts` 只认识退款和 goodwill，钱包充值用 eSIM 模块自己的邮件）；`post-events.ts` 是否开始给其他来源过账 |
| P13 | 已改（Web；App 的订单页未改） | `Storify-main-app/app/[locale]/admin/orders/[id]/page.tsx`、`Storify-main-app/app/[locale]/(store)/account/orders/[id]/page.tsx` | 两个文件的导入区；后台：`<OrderItems order={order} />` 之后；顾客端：`<PageMessages>` 订单详情块之后 | 渲染 `OrderEsimPanel`（`components/esim/order-esim-panel.tsx`）：每张 eSIM 和每笔充值的状态（准备中 / 可安装 / 已退款 / 退款处理中 / 已取消）及入口；后台另显示供应商、任务状态和最后的错误，只给完整管理员看（受限员工可能看到别的商户的订单）；顾客端只在订单属于当前登录用户时显示；没有 eSIM 的订单什么也不画 | 两个页面的结构和 `isFullAdmin` 变量是否还在；顾客端订单页是否仍是服务端组件 |
| P14 | 已改 | `Storify-main-app/lib/auth/auth.ts` | `databaseHooks.user.create.after`（在官方 `onUserCreated` 之后） | 把请求头交给 `esimOnUserCreated`（`lib/esim/referral/service.ts`）：读邀请 cookie `esim_ref`（由 `/esim/invite/<code>` 写入，30 天），记录推荐关系并按设置给好友生成仅限本人的欢迎优惠券；出错只记日志，不影响注册。推荐佣金用 Storify 现有的 `goodwill` 余额来源（记为营销费用），所以 P12 不再需要「推荐佣金」来源 | 用户创建钩子是否改名或改成别的回调签名；`ctx.request?.headers ?? ctx.headers` 是否还能拿到 Cookie；邮箱注册、社交登录、结账时建账号三种方式都能记到推荐人；跑 `scripts/esim-dev-referrals.ts` |
| P15 | 已改 | `Storify-main-app/contracts/mobile/shop/v1/checkout.ts`、`Storify-main-app/lib/api-core/shop/checkout/quote.ts`、`Storify-main-app/lib/api-core/shop/checkout/redirect.ts`、`Storify-main-app/lib/api-core/shop/checkout/redirect-payment.ts`、`Storify-main-app/lib/checkout/app-payment-return.ts`、`storify-customer-app/src/contracts/mobile/shop/v1/checkout.ts`（App 契约副本，手工同步同两行）、`Storify-main-app/lib/validations/index.ts`、`Storify-main-app/app/api/payments/checkout/route.ts`、`Storify-main-app/app/api/settings/public/route.ts`、`Storify-main-app/components/checkout/checkout-content.tsx`、`Storify-main-app/components/checkout/checkout-helpers.tsx`、`Storify-main-app/components/common/payment-method-meta.ts`、`Storify-main-app/lib/payments/payment-custody.ts`、`Storify-main-app/models/checkout-attempt.model.ts` | `CheckoutSchema.paymentMethod` 枚举及其后的 `extensionMethod`；结账路由 ioTec 分支之前；公开设置 `payment` 段（`mtnMomoEnabled` 之后）；结账页导入区、表单枚举（`.or(...)`）、`paymentConfig` 类型、`configuredAny`、`paymentMethods`（MTN 之后）、`redirectPaymentProvider` 与 `redirectPaymentProviderName`、提交按钮的 `PaymentProviderLogo`（eSIM 方式不显示标记）与「Continue with {name}」文字（改为 `checkout.continueWith`，按页面语言显示）、下单的 `checkoutPayload`；`CheckoutFormData` 与 `PaymentProviderLogo`；后台支付方式名称；`PLATFORM_GATEWAY_PAYMENT_METHODS`；`AttemptGatewayRefsSchema`（`extensionReference`、`extensionMethod`）与唯一索引列表 | 一次性加入通用支付方式 `extension`。结账页把每个启用的 eSIM 支付方式（`lib/esim/payments/` 的插件：Stripe 托管收银台、BEpusdt、RedeePay 微信/支付宝）各列一行，和卡、PayPal 等并列，行的值是 `extension:<code>`（`components/esim/checkout-methods.ts`）；下单时发 `paymentMethod: "extension"` 加 `extensionMethod: "<code>"`。服务端写 checkout attempt（`gateway.extensionReference`，选中的方式记在 `gateway.extensionMethod`），并立即发起这笔支付：有网关页面的直接跳过去，二维码类的跳到 eSIM 支付页 `/esim/pay/<ref>` 显示二维码。选了方式的结账在支付页只能用这个方式（手续费按它算的），换方式要回结账页。没选方式的（App）仍在支付页里选。Stripe 插件的回调验签需要原始请求体和请求头，回调路由把它们一起交给插件。网关签名通知确认付款后，用 Storify 自己的 `finalizeCapturedAttempt` 生成订单。退款按 Storify 规则记为手动退款（`extension` 不在 `GATEWAY_REFUND_METHODS` 里）。**移动接口（APP-09）**：契约的 `CHECKOUT_PAYMENT_METHODS`、`REDIRECT_PAYMENT_METHODS` 加 `extension`；`quoteCheckout` 的返回套一层 `withExtensionMethod`（`lib/esim/payments/mobile.ts`）把它加进报价的支付方式；`POST /checkout/redirect` 的可用性判断、`startRedirectPayment` 和 `verifyRedirectPayment` 各加一个 `extension` 分支；回跳桥 `APP_PAYMENT_RETURN_PROVIDERS` 加 `extension`。App 内浏览器打开带 `?app=1` 的 eSIM 支付页，付款完成或放弃时由支付页跳到回跳桥回到 App。没有启用的方式时公开设置返回空列表，结账页不显示。没改原计划里的 `CHECKOUT_GATEWAY_IDS`：方式的开关和密钥放在 eSIM 后台，不进 Storify 的支付设置 | 结账路由是否仍按 `paymentMethod` 分支、`openGatewayAttempt`/`takeOverOpenAttempt`/`recordAttemptGatewayRefs`/`finalizeCapturedAttempt`/`findAttemptByGatewayRef` 签名是否变化；attempt 的 `gateway` 子文档是否仍是严格 schema（新引用要登记字段）；新增网关时各枚举是否换了位置；退款判断 `refundSettlesOutOfBand` 是否仍把未知方式当手动；对账 sweep（`checkout-expiry.ts` 的 `PROBES`）是否开始处理未知方式；跳转支付的 `switch` 若改成按表查找，要把两个分支挪过去；结账页的支付方式单选是否仍以 `method.value` 为值、`checkoutPayload` 是否仍是下单请求体；跑 `scripts/esim-dev-payments.ts` |
| P16 | 已改 | `Storify-main-app/lib/auth/auth.ts` | 导入区；`emailAndPassword` 配置末尾 | 加 `password: { hash: hashPassword, verify: verifyAnyPassword }`（`lib/esim/migration/legacy-password.ts`）：bcrypt 格式（Laravel 的 `$2y$`）用 bcrypt 校验，通过后把该凭证账号的哈希换成 Better Auth 自己的格式；其他哈希交给 Better Auth 原来的 `verifyPassword`，行为不变 | 官方是否改了默认密码哈希或 `password` 选项；凭证账号集合是否仍叫 `account`、字段仍是 `password`；跑 `scripts/esim-dev-legacy-login.ts` |
| P17 | 已改 | `Storify-main-app/app/sitemap.ts` | `sitemap()` 末尾，`return entries;` 之前 | 动态 import `@/lib/esim/storefront/catalog`，用同一个 `push` 加入 `/esim` 和每个在售目的地页（国家 `/esim/<slug>`、地区 `/esim/region/<slug>`、全球 `/esim/global`），沿用官方的多语言 hreflang；整段 try/catch，读不到 eSIM 目录不影响其余站点地图 | `push` 和 `entries` 是否改名；站点地图是否改成 `generateSitemaps()` 分文件（那时这段要挪进相应的文件）；`/sitemap.xml` 里能看到 eSIM 页面 |
| P19 | 已改 | `Storify-main-app/lib/finance/postings.ts`、`Storify-main-app/lib/finance/post-events.ts`、`Storify-main-app/lib/orders/preorder-cancel-refund.ts` | `postings.ts`：导入区、`PostingOrder` 末尾、`orderPaidPostings` 自营分支收入分录之前；`post-events.ts`：`ORDER_POSTING_PROJECTION` 末尾；`preorder-cancel-refund.ts`：导入区、`getOrderRefundCeiling` 返回处 | 钱包充值订单的记账：订单行里充值金额那部分（`walletCreditOf`，`lib/esim/wallet/booking.ts`）记「借：现金 / 贷：store credit payable」，收入只剩手续费；为此投影多读订单行的 `price quantity lineAttributes`。退款上限减去这部分，所以任何退款路径都只能退手续费，余额不会再被退成钱 | 订单过账是否仍在 `orderPaidPostings` 的自营分支一笔记收入；`decomposeOrder` 的 merchandise 是否仍是「扣完优惠后的商品额」；退款路径（后台订单、退货、换货、预售取消、eSIM 失败退款）是否都还经过 `getOrderRefundCeiling`；跑 `scripts/esim-dev-wallet.ts` |
| P18 | 已改 | `Storify-main-app/vercel.json`、`Storify-main-app/lib/cron/health.ts` | `vercel.json` 的 `crons` 数组末尾；`health.ts` 导入区和 `CRON_STALE_AFTER_MS` 末尾 | `vercel.json` 加四个 eSIM 定时任务：`/api/cron/esim-fulfillment` 每分钟、`/api/cron/esim-catalog` 每 6 小时、`/api/cron/esim-fx` 每天 15:30 UTC、`/api/cron/esim-usage` 每 30 分钟（JSON 不能写注释，所以没有 `[esim-patch]` 标记）；`CRON_STALE_AFTER_MS` 展开 `ESIM_CRON_STALE_AFTER_MS`（`lib/esim/admin/cron-config.ts`），任务停跑时后台仪表盘会提示 | 官方新版的 `vercel.json` 覆盖后这四条是否还在（升级时最容易丢）；`CRON_STALE_AFTER_MS` 是否改名；Vercel Hobby 套餐只支持每天一次，每分钟的开卡兜底需要 Pro 或自建定时器；自建服务器用系统定时任务带 `CRON_SECRET` 调这四个地址 |
| P20 | 已改 | `Storify-main-app/lib/finance/accounts.ts`、`Storify-main-app/components/admin/finance/adjustment-dialog.tsx`、`Storify-main-app/components/admin/finance/finance-overview.tsx` | `LEDGER_ACCOUNT`（`OPENING_INVENTORY_EQUITY` 之后）、`LEDGER_ACCOUNT_TYPES`；两个组件的 `ACCOUNT_LABELS` | 加权益科目 `opening_balance_equity`（期初余额权益）：旧站迁移来的余额记「借：期初余额权益 / 贷：store credit payable」（`lib/esim/migration/import.ts`），表示欠顾客的钱但不是在新站收的。加资产科目 `esim_supplier_prepaid`（eSIM 供应商预付余额，ORD-12）：每张 eSIM / 每笔充值开通时按购买时记录的 USD 成本记「借：商品成本 / 贷：供应商预付余额」，在供应商处取消的 eSIM 记反向分录（`lib/esim/finance/cost.ts`）；给供应商充值由管理员在财务里手工记「借：供应商预付余额 / 贷：银行」。中英文名称放在 `locales/esim/*.json` 的 `finance.account` 下，不改官方语言包 | 科目表是否改名或改成可编辑；`Record<LedgerAccount, …>` 的完整映射是否出现在新文件里（tsc 会报）；报表是否按科目类型汇总权益；跑 `scripts/esim-dev-migration.ts`、`scripts/esim-dev-cost.ts` |
| P21 | 已改 | `Storify-main-app/package.json`、`Storify-main-app/pnpm-lock.yaml` | `dependencies` | 加 `mysql2`（JSON，无法加标记）：后台「数据迁移」读取旧站 MySQL（`lib/esim/migration/legacy-source.ts`），连接只来自 `.env` 的 `LEGACY_MYSQL_*`，只读一致性快照 | 官方升级 `package.json` 时保留这一行；合并后重新 `pnpm install` |
| P22 | 已改 | `Storify-main-app/lib/api-core/shop/registry.ts` | 导入区；`SHOP_V1_ROUTES` 里 `storeCreditRoutes` 之后 | 展开 `esimShopRoutes`（`lib/esim/mobile/esims.ts`）：`GET /me/esims`、`GET /me/esims/{id}`、`POST /me/esims/{id}/refresh`、`GET /esim/destinations`、`GET /esim/destinations/{scope}/{slug}`、`GET /me/esims/{id}/topups`、`POST /me/esims/{id}/topups/quote`，供接口清单和策略测试读取；路由文件本身是新文件，不改官方 | 清单是否改名或改成自动扫描；`defineRoute` 的字段是否变化 |
| P23 | 已改 | `storify-customer-app/src/i18n/messages.ts`、`storify-customer-app/src/app-routes/account.tsx`、`storify-customer-app/src/features/account/account-home.tsx`、`storify-customer-app/src/api/query-keys/index.ts` | `messages.ts` 导入区、`Messages` 类型、`getMessages`；`accountScreens` 的登录分组末尾；账户页「Track Orders」之后；query keys 的导入和展开 | App 端「我的 eSIM」（APP-03/04）：合并 `src/features/esim/messages/*.json` 文案；注册 `account/esims` 两个页面；账户页加入口；加 `esimsKeys` | 文案加载方式、`ScreenList` 和账户页布局是否变化；官方 App 的契约副本与 Web 不一致（官方基线如此）：同步时只复制 `esim.ts`，不要整体 `contracts:sync`，否则会带入官方尚未适配的结账契约 |
| P24 | 已改 | `storify-customer-app/src/features/payments/use-place-order.ts`、`storify-customer-app/src/features/payments/success-params.ts`、`storify-customer-app/src/features/payments/outcome-screen.tsx`、`storify-customer-app/src/features/payments/payment-section.tsx` | `usePlaceOrder` 按方式分流处；`PaymentResultParams` 联合类型；`Outcome` 的 `switch`；`MethodRow` 的说明文字 | App 端的「跳转支付」流程（APP-09，接口早已支持，官方 App 未实现）：`flow: redirect` 的方式（PayPal、Pesapal 等已开启的网关和 eSIM 扩展支付）走 `src/features/esim/redirect-payment.ts`：`POST /checkout/redirect` → `openAuthSessionAsync` → `POST /checkout/redirect/verify`；未完成时结果页新增 `redirect-pending` 状态按卡支付的节奏继续查询，并记在本机（`src/features/esim/redirect-pending.ts`），下次打开结账时在支付区块（`useResumePayment` 旁边）先查结果 | 官方 App 若自己实现了跳转支付，删掉这几处改用官方的；`PaymentResult`、结果页、支付方式行的结构是否变化；余额支付（WAL-03 的店铺余额）仍走官方的 store_credit 规则 |
| P25 | 已改 | `storify-customer-app/package.json`、`storify-customer-app/pnpm-lock.yaml` | `dependencies` | 加 `expo-device`（用 `expo install` 选的与 SDK 匹配的版本，JSON 无法加标记）：「我的手机支持 eSIM 吗」读本机品牌和型号（APP-05）。原生模块，需要重新打开发包 | 官方升级 App 依赖时保留；Expo SDK 升级时用 `expo install --fix` |
| P26 | 已改 | `Storify-main-app/contracts/mobile/shop/v1/links.ts`、`storify-customer-app/src/contracts/mobile/shop/v1/links.ts`（App 契约副本，与 Web 一致，直接复制） | `APP_LINK_PATTERNS` 末尾 | 加 eSIM 页面的网站路径（`/esim`、`/esim/:country`、`/esim/region/:slug`、`/esim/global`、`/esim/devices`、`/account/esims` 及其详情、充值、余额、邀请、认证）：网站链接、推送通知、邮件里的这些地址在 App 里打开对应页面 | 链接表是否改名或改结构；新增 App 页面时同步加路径 |
| P27 | 已改 | `Storify-main-app/components/checkout/checkout-content.tsx`、`Storify-main-app/components/checkout/checkout-helpers.tsx`、`Storify-main-app/lib/checkout/prepare-checkout.ts` | 结账页：导入区、店铺余额状态之后、`storeCreditApplied` 之前、两处提交时的 `useStoreCredit`、`paymentMethods` 列表开头及其依赖、`isMethodBlocked`、方法行的不可选原因 / 说明 / 充值链接 / 选中提示、余额勾选框条件、原来「余额已付清」整块提示（删掉）、表单 `paymentMethod` 枚举；helpers：`CheckoutFormData.paymentMethod`；prepare-checkout：导入区、`options.admitCart` 之后（含充值与其他商品混在一起时拒绝下单，`isMixedTopupCart`）、`storeCreditAvailable` 条件、`checkoutStoreCredit` 的 `useStoreCredit` | 「账户余额」成为支付方式列表的第一行（`store_credit`，服务端本来就认）：余额够付全款时可选且默认选中，选中即全额用余额付；不够时置灰，写明可用金额，并在旁边显示「充值」（`components/esim/checkout-balance.tsx`，钱包充值开启时才显示），这时原来的勾选框仍可用余额付一部分。充值走 `/account/esims/balance`：钱包充值必须单独结账，所以先把购物车其他行暂存（`lib/esim/wallet/park.ts`、`models/esim-parked-cart.model.ts`），充值入账后或回到结账页时放回。钱包充值的订单不能用余额付（前端隐藏，服务端拒绝） | 结账页结构、`useStoreCredit` / `storeCreditCoversAll` / `isMethodBlocked` / 方法行 JSX 是否改动；服务端 `store_credit` 处理和 `checkoutStoreCredit` 参数是否变化；余额够 / 不够 / 无余额 / 游客 / 钱包充值五种情况各结一次账 |
| P28 | 已改 | `Storify-main-app/components/checkout/checkout-content.tsx`、`Storify-main-app/lib/checkout/prepare-checkout.ts` | 结账页：导入区（与 P27 同一行）、P27 的余额状态之后、校验里的 `billingCollected`、提交时的 `billingAddress`、「账单地址」区块的 `<section>`、`shippingCost`、Stripe 卡的 `billing_details`（没有地址时只带姓名和邮箱）；prepare-checkout：导入区、地址必填检查之前、`normalizedShippingAddress` 的兜底 | 购物车全是 eSIM / 充值 / 余额充值（`lib/esim/checkout/address.ts`，前端经 `GET /api/esim/catalog/esim-only` 判断，游客也适用）时不再要求账单地址：前端隐藏账单地址并不校验、不提交；服务端不再要求地址，订单存一个占位地址（顾客姓名或邮箱、店铺发货地国家）。另修官方的一处显示问题：没有要发货的商品时，结账页仍按「默认运费」显示运费（服务端实际收 0），现在显示 0 | `billingCollected` / 提交 `billingAddress` / 账单区块 / `shippingCost` / 地址必填检查是否改动；订单地址字段是否新增必填；纯 eSIM、eSIM + 实物、纯实物各结一次账 |
| P29 | 已改 | `Storify-main-app/lib/checkout/prepare-checkout.ts`、`Storify-main-app/components/checkout/checkout-content.tsx` | prepare-checkout：导入区（含 `feeMethodOf`）、读取购物车（`cartRead`）之前；结账页：导入区（与 P27/P28 同一行）、`esimSelectedPayment` 之后、P27 的 `balanceCovers` 判断 | 支付手续费：后台 eSIM → 支付里给每种结账方式设「固定金额 + 商品金额百分比」（`lib/esim/admin/payment-fees.ts`）；每个 eSIM 支付方式单独设，键为 `extension:<code>`（`feeMethodOf`，`lib/esim/payments/method-names.ts`），单独的 `extension` 只用于没选方式的 App 结账。手续费是购物车里的一行「Payment fee · 方式」（隐藏的不计税商品，`lib/esim/payments/fee-line.ts`）：结账页切换方式时由 `POST /api/esim/checkout/fee` 同步，下单（含 App）时服务端在读购物车前按所选方式再同步一次，结账定价（`esimLinePrices`）按其他行重新计价。作为订单行，它自然进总额、邮件、退款，账本记为平台自营销售，不会分给子商户。余额支付、钱包充值不收；余额够不够按不含手续费的金额判断 | `cartRead` 是否仍是读购物车的唯一入口、支付方式是否仍叫 `paymentMethod`；`esimSelectedPayment` 与 `balanceCovers`（P27）是否还在；各支付方式各下一单，确认订单行和总额含手续费 |
| P30 | 已改 | `Storify-main-app/lib/cart/cart-response.ts`、`Storify-main-app/lib/api-core/shop/cart/app-cart.ts`、`Storify-main-app/components/checkout/checkout-content.tsx`、`Storify-main-app/components/account/order-details.tsx`、`Storify-main-app/lib/orders/guest-order-tracking.ts`、`Storify-main-app/components/store/track-order-content.tsx`、`Storify-main-app/components/admin/order-details/order-items.tsx`、`Storify-main-app/lib/email/order-emails.ts`、`Storify-main-app/lib/email/email-templates.ts` | 购物车响应 `cartResponse`/`cartViewResponse`、App 的 `toAppCart`；结账页：P29 的 `esimSelectedPayment`/`esimFeeInCart` 挪到 `total` 之前并计入 `total`，摘要里运费行和税行之间；顾客订单详情：行接口、`shippingAmount` 之后、商品列表、汇总行、退货弹窗列表；访客订单查询：返回的 `itemCount`/`items`，页面的商品表、包裹商品、汇总行；后台订单详情：商品表和汇总行；下单确认邮件：`items`、`OrderEmailData`、汇总行 | 手续费（P29）仍是购物车和订单里的一行，总额、退款、账本照旧；只是展示时不当商品列出（`lib/esim/payments/fee-display.ts` 按 `lineAttributes.paymentFee` 识别），改在运费旁单独一行「支付手续费」，小计相应减去它。购物车接口（网页和 App）直接去掉这一行，结账页按所选方式显示。运费为 0 时不显示运费行（自提仍显示） | 这些函数和汇总区是否改名或改结构；订单行是否仍带 `lineAttributes`（P10）；用有手续费的订单看结账页、订单详情、订单查询、后台订单页和确认邮件，商品里没有手续费、汇总里有、各行相加等于总额 |
| P31 | 已改 | `Storify-main-app/components/layout/store-header.tsx`、`Storify-main-app/components/layout/store-header/language-popover.tsx` | 页眉 `renderUser`：会员和游客按钮里 `item.showLabel` 为假时的分支（原来什么也不画）；`LanguagePopover` 的弹出内容（整个组件改写，属性不变） | 页眉账户按钮：没开「显示文字」时，头像后也显示会员名（游客显示「登录」或设置的文字）和下拉箭头，手机宽度下仍只有图标。语言选择：原来是下拉框加「保存」按钮，改成语言列表，点哪个就切换到哪个，当前语言打勾。游客按钮的文字是页眉预设自带的英文「Login / Register」（或为空）时，按页面语言显示「登录 / 注册」，商家自己填的文字照常显示 | `renderUser` 的两个分支和 `LanguagePopover` 的属性（`trigger`、`currentCode`、`languages`、`onSave`）是否变化；官方若重做了这两个控件，直接用官方的并删掉本条 |
| P32 | 已改 | `Storify-main-app/components/layout/store-bottom-nav.tsx`、`Storify-main-app/app/[locale]/(store)/layout.tsx` | 底部菜单栏：导入区、属性 `esimTabs`、`items` 列表之后算出 `shownItems`，渲染改用它；商城布局：导入区、`Promise.all` 里读取 `storefrontMobileTabs()`、给 `StoreBottomNav` 传 `esimTabs` | 手机和平板底部菜单栏按后台「eSIM → 手机导航」的设置排序、隐藏、改名，并可加 eSIM 目的地、我的 eSIM 和自定义链接（`lib/esim/storefront/mobile-nav.ts`）；没保存过设置时保持官方原样。「菜单」始终保留，因为侧边菜单只能从它打开 | 底部菜单栏的 `items`（各标签的 `key`）和 `NavItem` 类型是否变化，`StoreBottomNav` 的属性和布局里的调用是否变化；官方若自带了菜单栏配置，改用官方的并删掉本条 |
| P33 | 已改 | `Storify-main-app/components/layout/store-header/mobile-menu-sheet.tsx`、`Storify-main-app/app/[locale]/(store)/layout.tsx` | 侧边菜单：导入区；`useLanguage()` 之后读取 `useEsimMobileMenu()`，按后台隐藏的部分把对应的 `show…` 属性改成 false，并算出 `esimLinks`；导航列表里「首页」「全部商品」两行各包一层条件，「首页」之后插入 `esimLinks`。商城布局：导入区（与 P32 同一行）、`Promise.all` 里读取 `storefrontMobileMenu()`、页眉区块外包 `EsimMobileMenuProvider` | 手机和平板的侧边菜单按后台「eSIM → 手机导航」的设置隐藏行和区块（首页、全部商品、合集、页眉菜单链接、分类、合集区块、账户、语言和币种、主题切换），并在「首页」下面加 eSIM 目的地、我的 eSIM 或自定义链接。没有设置或没有 Provider（如后台预览）时保持官方原样 | 侧边菜单的 `show…` 属性名和含义、导航列表里「首页」「全部商品」两行、`MobileNavRow` 的属性是否变化；布局里页眉区块的包裹方式是否变化；官方若自带了侧边菜单配置，改用官方的并删掉本条 |
| P34 | 已改 | `Storify-main-app/components/admin/settings/sections/payment-settings-tab.tsx`、`Storify-main-app/components/checkout/checkout-content.tsx`、`Storify-main-app/app/api/settings/public/route.ts` | 支付设置页：导入区、`SettingsTabHeader` 之后（Stripe 卡片之前）、COD 卡片之前；结账页：导入区（P15 那行之后）、`paymentConfig` 类型、`paymentMethods` 的 `return`、方式行的图标与单选框（换了位置）、选中方式的 `useEffect` 之后；公开设置：导入区、`extensionMethods` 之后、`payment` 段 `extensionMethods` 之后 | 支付网关统一在官方「设置 → 支付」管理：页面顶部插入「结账页的支付方式」卡片（`components/esim/admin/payment-settings.tsx`），给所有结账方式（官方的卡、PayPal、COD 等和每个 eSIM 网关）设顺序、默认选中项和上传的图标，存在 eSIM 设置的 `checkoutDisplay`（`lib/esim/admin/checkout-display.ts`）；COD 前插入 eSIM 支付网关卡片（Stripe 插件、BEpusdt、RedeePay）和支付手续费。两部分都走 eSIM 管理接口和 eSIM 团队权限，没有权限的管理员看不到。eSIM → 支付页只留付款记录。结账页按设置排序（余额 `store_credit` 始终第一）、换上传的图标（`esimArrangeMethods`），方式行改成图标在前、单选框在末尾（图标放在固定宽度的框里，名称对齐），打开时选中默认方式一次（`useEsimDefaultPaymentMethod`，余额够付时仍选余额）；公开设置多返回 `payment.checkoutDisplay`。App 报价按同一顺序排列（`withExtensionMethod`，eSIM 方式合为一项放在第一个 eSIM 方式的位置） | 支付设置页是否仍是 `ProviderCard` 列表、`SettingsTabHeader` 和 COD 卡片是否还在；结账页 `paymentMethods` 是否仍以 `useMemo` 返回方式数组、方式行是否仍渲染 `method.icon`、默认选中逻辑是否改动；公开设置 `payment` 段是否改名；在后台调顺序、默认和图标后看一次结账页 |
| P35 | 已改 | `Storify-main-app/lib/storefront/pages/get-home-page.ts` | 导入区；`getHomePageRender` 返回的 `sections` | eSIM 模板自带文字按页面语言显示：首页加载区块后交给 `localizeTemplateCopy`（`lib/esim/storefront/template-copy.ts`），把 eSIM 主题首页预设、eSIM 区块默认值和入门内容、机型说明里自带的英文句子（`lib/esim/storefront/template-text.ts` 的对照表，译文在 `locales/esim/*.json` 的 `esim.copy.*`，18 种语言）换成当前语言；只换可翻译字段里与对照表完全一致的文字，管理员自己写的文字、或在页面编辑器语言标签里给该语言填过的译文都保留。App 首页区块（`lib/esim/mobile/home.ts`）和机型检查区块同样处理 | `getHomePageRender` 是否仍返回 `{ sections, ctx }`、区块定义是否仍用 `translatable` 标记可翻译字段；切换到中文看首页的搜索区、步骤、FAQ 是否为中文 |
| P36 | 已改 | `Storify-main-app/lib/validations/index.ts`、`Storify-main-app/lib/site-config/menu-helpers.ts`、`Storify-main-app/components/store/sections/header-chrome.tsx`、`Storify-main-app/components/admin/menus/menu-form/helpers.ts`、`Storify-main-app/components/admin/menus/menu-form/editor-panels.tsx` | `MenuItemBaseSchema` 末尾；menu-helpers：导入区、`MenuItemPlain`、`normalizeItems`；header-chrome：导入区、`buildHeaderMenuItems` 的页眉菜单、`HeaderBar` 的大菜单和关联菜单、`FooterBar` 与 `resolveFooterMenuColumns`；菜单表单：`MenuItem` 类型；编辑面板：导入区、普通菜单和大菜单两处「Label」输入框之后 | 菜单项支持多语言：菜单项多一个可选字段 `labels`（语言 → 文字）。后台菜单编辑器在名称输入框下加「Label in other languages」折叠区（`components/esim/admin/menu-item-labels.tsx`，语言取「设置 → 常规」里启用的语言，留空即用原名称）；接口校验放行 `labels`，读取菜单时保留；页眉菜单、大菜单、页眉关联菜单和页脚菜单列按页面语言换成对应文字（`lib/esim/storefront/menu-labels.ts` 的 `menuIn`） | 菜单项字段是否改名、`normalizeItems` 是否仍逐项挑字段、页眉页脚是否仍经 `getMenusByLocation` / `getMenuByHandle` 读菜单；给一个菜单项填中文后切换语言看页眉页脚 |

> 新增插入点时按编号往后加；某项最终没改，就把状态改为 `取消` 并保留记录。

### P10 明细

路径都在 `Storify-main-app/` 下。每处都带 `// [esim-patch] P10`（JSX 里写成 `{/* [esim-patch] P10 … */}`）。

| 文件 | 位置 | 改动 | 升级后检查 |
|---|---|---|---|
| `types/index.ts` | `CartItem`、订单行接口，`quoteId` 之后 | 加 `lineAttributes?: Record<string, unknown>` | 两个接口是否改名或拆分 |
| `models/cart.model.ts` | `CartItemSchema`，`quoteId` 之后 | 加 `lineAttributes`（Mixed） | 行 schema 是否改结构 |
| `models/order.model.ts` | 订单行 schema，`quoteId` 之后 | 同上 | 同上；子订单行是否仍用同一 schema |
| `lib/validations/index.ts` | `CartAddByIdSchema` | 加 `lineAttributes` 可选对象 | 加购请求体是否仍用这个 schema |
| `lib/cart/cart-service.ts` | 导入；`CartLineInput`、`MutableCartItem`；`putLine` 定价处、读购物车（`let cart =`）之前和新旧行赋值处；`setCartLine` 的 upsert 短路之前 | 调 `esimCartLine(line, { userId })` 取行属性、单价、规格名（充值行要求登录且是 eSIM 的主人）；只带激活日期的固定价规格不返回单价，沿用 Storify 自己的价格；天数或激活日期（`activateOn`）不同、或是充值行（`singleUnit`）就替换数量；App 的 upsert 带了不同天数或日期时改走 `putLine`（由它替换）；读购物车之前调 `esimKeepTopupAlone`（`lib/esim/wallet/park.ts`）：充值（eSIM 流量、号码话费 / 流量包、余额）必须单独结账，加入充值就把购物车其他行暂存、丢掉别的未付充值行；加入普通商品就丢掉留在购物车里的充值行并放回暂存的行（网页和 App 都走这里） | `putLine` 是否仍是加购和 App upsert 的唯一入口；`userId` 变量是否还在；同一规格是否仍只占一行 |
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
