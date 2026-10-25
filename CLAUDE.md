# eSIM-BaseStorify

在官方 Storify 商城源码（Web：`Storify-main-app`，Next.js 16 + MongoDB；顾客 App：`storify-customer-app`，Expo）上二次开发 eSIM 售卖平台。

## 开工前必读

1. **功能清单（需求的唯一来源）**：https://claude.ai/artifact/AnG4WgYJif8bkzzPWksNyu
   这是一个 Claude Docs 文档，要用 docs 工具读取（不要用网页抓取）。各功能有编号（PRV/CAT/WEB/ORD/USR/TOP/NUM/WAL/PAY/REF/KYC/NTF/ADM/APP/MIG）和阶段（P1/P2/P3）。文档里还有「数据模型」一节（套餐表、eSIM 表、Top-up 规则、页面显示状态），以及每个问题下的「已确认」结论。
2. **改官方文件的规则与插入点清单**：`UPSTREAM-PATCHES.md`。
3. **参考代码**（只读，不在本仓库）：
   - `C:\Users\Administrator\Documents\esim_php`：旧的线上 Laravel 版，功能齐全但性能差，业务细节以它为准。
   - `C:\Users\Administrator\Documents\eSIM-Platform`：中途停止的 TS 重写版。`docs/domain-model.md`、`docs/product/requirements.md` 可作参考；`apps/api/src/provider-adapters/` 和 `number-lines/topconnect-xml-client.ts` 是纯 TS、不依赖数据库，可直接迁移。

## 开发原则

- eSIM 代码只放新目录：`lib/esim/`、`models/esim-*.model.ts`、`components/esim/`、`app/api/esim/`、`app/api/cron/esim-*`、`app/[locale]/(store)/esim/`、`app/[locale]/admin/esim/`；App 端放在 `src/features/esim/`。
- 改官方文件：只改 `UPSTREAM-PATCHES.md` 登记过的位置，每处加 `// [esim-patch] P<编号>` 注释，改完运行 `tools/check-patches.sh` 核对。
- 分支：`upstream` 分支只放官方原版代码；官方发新版用 `tools/import-upstream.sh` 导入，再 `git merge upstream` 合并进来。
- 订单、支付、开卡、充值、余额一律带幂等键、事务和审计日志；金额用最小货币单位，禁止用浮点。

## 已确认的关键决策（2026-10-25）

- 结算币种 **USD**，只用单一币种，不做多币种钱包。供应商成本按原币种保存，按"汇率 × (1 + 缓冲)"换算后再定价。
- **保留多商户**：eSIM 由平台自营；实体卡等附加产品由子商户上架。开卡和 Top-up 只处理平台自营的订单行。
- 首批供应商（P1）：eSIM Access、Stellar、RoamWifi，以及 TopConnect 号码卡的核心功能（NUM-01~09）。P2：BNESIM、MobiMatter。P3：MobIOT（等对方提供文档）。
- 数据模型对齐 Stellar 的接口结构：`productSlug` 相同的套餐归为一个商品，套餐作为规格。Top-up 用 `mode`（stack 叠加 / addon 独立包）和 `window`（before_expiry 到期前才能续 / while_profile_exists 随时可买）两个字段描述。
- 购物车行和订单行加通用字段 `lineAttributes`（插入点 P10，必须改），记录可选天数、充值目标 ICCID、激活日期。
- 开卡最终失败时默认退到余额；没有账号的游客订单原路退款。
- 游客只能买流量 eSIM，号码卡必须登录后购买。
- 保留钱包充值和推荐返佣；分销商和佣金提现暂不做；不做工单，用 Storify 在线客服代替；客户 KYC 按套餐决定是否需要（套餐字段 `kycRequired`，P2）。
- 支付：在 Storify 网关列表里一次性加入通用「扩展支付」网关（P15），后面挂 eSIM 模块自己的网关插件（首批 BEpusdt、RedeePay），以后加网关只新增插件。App 端非 Stripe 的支付走 WebView 或外部浏览器。
- 迁移：迁移用户、余额、在用的 eSIM 和号码卡，历史订单不迁。老用户的 bcrypt 密码可以直接登录，登录后自动换成新的加密方式（插入点 P16）。
