# DeepSeek AI Summary 接入与验收

## 边界

AI 是解释层，不是决策层。既有链路为：用户点击 → 认证的 Summary API → 读取 Incident → 白名单 Evidence DTO → Provider → 哈希绑定的临时摘要 → UI。

- 不持久化摘要，不写 Incident、Evidence、Events、Monitor、cursor 或通知。
- 不提供模型工具，不 ACK、恢复、改严重程度或执行链上操作。
- 不在页面加载、Worker tick 或 Incident 创建时自动调用。
- 返回四段中文：事件摘要、关键证据、当前判断、建议调查。关键证据最多 5 条，建议调查最多 3 条。
- 原始 Evidence 和 Timeline 是事实来源。哈希绑定说明本次摘要对应的原始记录，并不证明模型每句话都正确；仍需人工核对。

## 配置

沿用三个服务端变量，不新增 SDK 或数据库迁移：

```dotenv
AI_SUMMARY_ENDPOINT=https://api.deepseek.com/chat/completions
AI_SUMMARY_MODEL=deepseek-flash
AI_SUMMARY_API_KEY=
```

最后一项由用户在本地 `.env.local` 或 Vercel Secret 环境中私下填写。不要发到聊天、源码、README、截图或日志；`.env.example` 中 API Key 只能保持空值。

现有 provider 直接 fetch 完整 Endpoint，不会追加路径。不要配置为 Base URL，也不要重复 `/chat/completions`。DeepSeek 请求显式关闭 thinking，仅接收最终 `content`，不展示推理内容。

官方参考：[Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)、[Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode/)。

## 安全处理

- 输入只从既有 Incident 和白名单 Evidence 字段构建，不发送 title、任意 rule 文本、RPC URL、环境变量或错误对象。
- System Prompt 将输入字符串视为不可信数据，禁止其中的 instruction / prompt / system 改变任务。
- ICM 初始 Evidence 可能是 PENDING，Timeline 的后续 DELIVERED / FAILED 事实必须同时考虑。Delivery 与 Execution 独立。
- 不向模型发送可能混淆的 ICM age/阈值字段；仅引用已有绝对时间，不推断“告警后几秒”或交易确认时间。
- 不向模型发送 Incident 检出时间，避免将其当作交易发生时间；Timeline `createdAt` 只允许称为 Sentinel 记录时间，不代表链上交易时间。
- Treasury 超阈值转出不证明被盗，Admin 权限变更不证明被接管。
- 复用 8 秒超时；超时 UI 显示“AI 摘要生成超时，请稍后重试。”
- 401 / 403 / 429 / 5xx、网络失败、无效 JSON、空内容、格式异常均失败关闭，不伪造 fallback。
- 禁止跟随 Provider 重定向，避免凭据被重定向转发；响应不包含 Authorization 或原始 Provider 错误。
- 模型文字以 React 文本节点展示，不使用 HTML 注入。
- 无配置时请求返回 `AI_NOT_CONFIGURED`；页面未发请求时显示“尚未生成摘要。”，不据此宣称 Provider 已配置。

## 本地验收门

1. 用户完成私有配置；按服务启动方式重新加载环境。仅报告 SET / MISSING，不打印配置值。
2. 在已登录本地页面选取三个已有真实 Incident：Treasury、Admin、ICM。
3. 调用前只读记录目标 Incident / Evidence / Timeline 哈希以及 Incident/Event/Notification 计数。调用后独立读回，确认没有因 AI 操作变化。运行中的 Worker 可能独立更新数据，需要区分来源，不清零或隐藏差异。
4. 手动点击生成，验证 Treasury 金额与阈值有据、Admin 无攻击推断、ICM 对已有 Receive 与执行失败明确输出 `Delivery = DELIVERED` 和 `Execution = FAILED`。
5. 验证重复点击不会并发请求、失败仍可查看 Evidence；Console 和 Network 只检查工具实际可提供的记录，不复制 cookie 或口令。
6. Mock 测试覆盖错误 Key 对应的 HTTP 错误、超时和畸形输出。不得把 Mock PASS 记作真实 Provider PASS。

当前代码接入不代表真实验收已完成。必须有真实 Key、三个真实响应与独立状态读回后，才能越过本地验收门。

## Production 门

仅在本地真实验收通过后，将相同三项配置加入既有 Vercel Web 项目，不加入 Railway。按既有部署方式部署 Web，不修改 Worker、数据库或 Monitor。

Production 手动验证现有 Treasury / ICM Incident；独立核对状态与计数、读取本次 deployment 的新鲜 Runtime Logs。日志权限失败或零记录不能算安全验收通过。

最终要求：API Key、Authorization header、credential URL 与 raw error object 曝露均为 0；保持唯一 Production RPC Monitor 与既有 Worker 运行。未通过时保留原有验收基线，不输出 `REAL_AI_SUMMARY_VERIFIED`。

## 2026-09-29 本地验收进度（尚未完成）

- 三项 AI 环境配置 presence-only 检查均为 SET；Endpoint 与 `deepseek-flash` 匹配。未输出 Key，未把它复制到源码或文档。
- 本地构建产物已启动于 `http://localhost:3000`；没有启动本地 Worker。
- UTC `2026-09-29T11:40:41.605Z` 独立只读基线：Incident/Event/Notification = **16/29/47**。这是当前基线，不套用早期 Soak 的计数。
- 已选定现有 Treasury、Admin 与 ICM Incident。Treasury DTO 为 20 USDC / 10 USDC 阈值；Admin DTO 只有已持久化权限事件 topic，不编造缺失 owner；ICM 后续 Timeline 为 DELIVERED / FAILED。
- 唯一启用 Monitor 是已有 Production RPC_HEALTH，读回 HEALTHY / failure=0。没有修改配置或启用其他 Monitor。
- 用户已自行完成 Chrome 本地登录，未复制 Production cookie 或读取口令。
- 经浏览器按钮手动发起 **7** 次真实请求：Treasury 2、Admin 3、ICM 2。Treasury 首次失败未获得具体安全分类，不推断原因；Admin 前两次、ICM 首次被 `AI_SUMMARY_UNSUPPORTED_CLAIM` 拒绝，未展示或持久化响应正文。日志只记录白名单 category，不保存模型原文。
- 最终 Treasury、Admin、ICM 各有一次真实成功。Treasury 显示 20 USDC 超过 10 USDC；Admin 明确只有 topic、缺少解码参数，不编造 owner 或攻击结论；ICM 明确 `Delivery = DELIVERED`、`Execution = FAILED`，执行失败原因未知。
- 调整 System Prompt，使未知授权/变更背景使用中性措辞，即便免责段也不复述攻击和基础设施归因术语；没有关闭校验或使用假摘要。针对同一分句否定表述的测试保留肯定攻击结论拒绝断言。
- UTC `2026-09-29T11:55:47.842Z` 只读比较：Incident/Event/Notification 仍为 **16/29/47**；Incident、Event、Notification、Monitor 配置和 Chain 哈希全部未变。唯一 RPC Monitor HEALTHY / failure=0，cursor 正常推进至 58852558。运行中的 Worker 状态更新时间不作为配置冻结字段。
- 最新本地回归 **83/83** Vitest、ESLint、TypeScript、Next build 通过。Prisma Generate 首次遇到本地 Web 占用 Windows DLL；暂停且仅暂停本地 Web 后重新生成通过。Prisma Validate / Compose 显式加载本地环境后通过，未迁移或启动容器。
- Vercel CLI 独立确认既有 `tz-haos-projects/avalanche-sentinel`；仅三个 AI 变量经 stdin 加入 Production，API Key 标记 sensitive。连接器存在参数 schema 不一致，未当成权限通过；使用已登录官方 CLI。
- 部署 dry-run 发现 CLI 不会自动沿用全部 Git 忽略规则；新增 `.vercelignore` 排除环境、缓存、代理工具与浏览器状态。再次 dry-run 仅 108 文件 / 665413 bytes，无本地 `.env`、`.codex`、`.npm-cache` 或 `node_modules`。
- Production 发布与真实摘要/新鲜日志验收尚未完成，不输出 `REAL_AI_SUMMARY_VERIFIED`。

### 首次 Production 实测与时间语义修正

首次 Web deployment `dpl_8Wth282Hcnp1JxvvFnxb1JQ2Nwyt` Ready。Treasury / ICM 请求均 HTTP 200；该 deployment UTC 12:00–12:04 窗口读取 20 条请求记录、无截断，scope 匹配，秘密、原始错误对象、带凭据 URL 均 0。应用未输出日志正文，因此嵌套应用日志条目为 0；这与“日志读取失败或零请求记录”不同。

人工复盘发现 ICM 将 `ageSec=1` 写为“告警后 1 秒”，该相对时间关系并无充分证据。该响应不作为最终验收通过依据。移除解释层 DTO 的 age/阈值字段，并明确禁止相对时间与交易确认时间推断；原始 Evidence 未更改。最终构建与 83/83 回归通过，需对修正版完成本地与 Production 复验。

第二次 Web deployment `dpl_EarpnP17kGUY34vsBEwSqPakLMsc` 的 ICM 已消除相对秒数误述，正确输出 DELIVERED / FAILED。Treasury 人工复盘发现将 Incident 检出时间写作转账发生时间，故继续收紧 DTO：移除检出时间，明确 Timeline 时间是记录时间，不是交易时间。第二次 Treasury 响应不作为最终验收依据；没有改写任何存证来迁就输出。

## 最终验收结果（2026-09-29，覆盖上面的阶段性进度）

### Provider 与 UI

- Provider：DeepSeek，模型 `deepseek-flash`，服务端完整 Endpoint 调用。
- 本地 Treasury、Admin、ICM 均有真实成功响应；最终时间边界修正另外通过本地 Treasury 复验。
- 合计本地手动请求 **9** 次（Treasury 3 / Admin 3 / ICM 3），Production 手动请求 **6** 次（每个 deployment 各 Treasury / ICM 一次）。没有 CLI Provider 测试、自动请求或 Worker AI 调用。
- 最终 Treasury：20 USDC > 10 USDC，记录时间明确标注，不冒充交易时间，授权背景未知，无攻击/被盗归因。
- Admin：配置 topic 被观测到；没有提供解码参数，不补造 owner/权限接管结论。
- 最终 ICM：`Delivery = DELIVERED`、`Execution = FAILED`；执行失败原因未知，无 Relayer 根因推断，无相对秒数误述。
- 四段标题与 Evidence SHA-256 可见，成功后按钮为“重新生成”；没有持久化 AI 文本。浏览器实际 Console critical error=0，秘密模式命中=0。本地 18 个客户端静态资源文件真实秘密 presence 扫描=0。
- HTTP/Network 证据来自 Vercel 请求日志（两个 Summary POST 均 200）；未将不存在的浏览器 Network 控制能力当作已完成检查。

### Production Web

- 项目：`tz-haos-projects/avalanche-sentinel`，ID `prj_eqLpbKcnFK426qvve4PZZo00pveu`。
- 最终 deployment：`dpl_2PX7PWqg2FgC9nUaxqw5SHttqzFC`，READY / Production。
- URL：[Avalanche Sentinel Production](https://avalanche-sentinel-mocha.vercel.app/)。
- 新鲜日志窗口：UTC `2026-09-29T12:12:00Z` → `2026-09-29T12:14:29.072Z`，**20** 条请求记录，scope 匹配，无截断。
- 两个目标 Summary API 均 HTTP **200**；没有把首次 deployment 或旧验收记录替代本次读回。
- `PRODUCTION_LOG_SECRET_LEAK_COUNT=0`；`RAW_ERROR_OBJECT_EXPOSURE=0`；`CREDENTIAL_BEARING_URL_EXPOSURE=0`。应用未主动写日志，嵌套应用日志条目为 0；权限和非零请求日志读取已独立验证。
- 仅新增三个 AI Production 变量，均显示 Encrypted，Key 标记 sensitive；既有 DB/admin/session 配置未修改。没有将 AI 配置加入 Railway。

### 独立业务读回

终点 UTC `2026-09-29T12:15:04.443Z`：Incident/Event/Notification 仍为 **16/29/47**。以下快照与本轮基线完全一致：

| 范围 | SHA-256 |
| --- | --- |
| Incident（含严重程度及生命周期） | `6e479150b50786c41c02b07aaab0f6356bff8c38b6ed29b74f50f3707991bdd1` |
| Incident Events / Evidence | `7f5abc278894952c191e0d993bf1d161b27973707a67a2475873d8889cf4988a` |
| Notifications（含发送状态） | `fb01a1a44b4649362899315c40b7716fbe3f7e55790929b0e070d99c23e174fa` |
| Monitor 配置（排除正常运行的状态更新时间） | `c7fdc2cb71f6bb9fc5ad791a77d8272b7f732fbdacb198aa9b0ff66dcc3fc412` |
| Chain 配置 | `8ca895748249119427d23aed5f1cdc5b9eab37f35ce08ac106a384ba694deedb` |

目标 Evidence hash：Treasury `d310e94d02a858b6d961c3583b2c7904d44f0a43afe137fd7e275596962bad02`；Admin `999ba237f3a9b0c53a9ed6d95e3dfdfa048179317ac96830d81099b4f65610c2`；ICM `6b1a040ac7f8b71ed586f81acaaa1d8395f5ce7478ba7066a4c7b1e4cd7e751e`。

- 唯一启用 Monitor 仍为 `cmujg0um90001dibs3bjnamtc` / RPC_HEALTH，HEALTHY，failure=0，终点 cursor=58853133，正常 Worker 持久化持续推进。
- Railway 仍为既有 deployment `46a00bce-3b86-4d26-beaa-3d38b631c823` / SUCCESS，未部署、重建、restart 或修改副本。只读变量确认 pooled DB 相同、通知关闭、Demo 关闭、AI Key 缺失。
- 本轮 Incident/Evidence/lifecycle/通知修改=0；通知发送=0；链上写入=0；migration=0。Treasury 的 ACKNOWLEDGED 是本轮开始前已存在状态，未执行 ACK。

### 回归与失败验收

- Prisma Generate：PASS；Prisma Validate：PASS；Vitest：**83/83 PASS**；ESLint：0 error / 0 warning；TypeScript：PASS；Next Production build：PASS；Compose 静态校验：PASS。
- no key / wrong key 对应 401/403 / 429 / 5xx / timeout / invalid JSON / empty / malformed / 重复点击 / 未支持结论 / 否定免责声明：受控测试 PASS。没有故意使用错误真实 Key 或向 Production 注入故障，因此这些失败验收明确为 **Mock/单元与组件测试**，不是实网故障注入。
- Worker、Prisma、依赖与锁文件 diff=0；源码 Secret audit 106 文件无 finding；未提交或推送 Git。
- 使用 Vercel 技能的项目 scope、stdin Secret 和 deployment 日志指南；dry-run 触发必要的 `.vercelignore` 防护。Neon 技能仅用于既有 pooled SELECT 读回，没有新建数据库或迁移。

结论：`REAL_AI_SUMMARY_VERIFIED`。保持 `PRODUCTION_DEMO_READY`，本阶段停止，不自动开展后续功能。
