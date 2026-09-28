# Production deployment plan（M8B Railway Worker 已部署）

当前更新（M9，2026-09-27）：唯一 `Production Fuji RPC Health`（`cmujg0um90001dibs3bjnamtc`）经单独授权已启用，真实Neon/Fuji/Web、cursor推进及一次官方Restart验收通过。Worker保持1副本RUNNING，唯一Production Monitor HEALTHY；通知与AI关闭。Soak固定起始快照与证据见 [M9记录](production-smoke.md)。停在 `PRODUCTION_SOAK_READY`，未自动开始M9.5。以下M8B零Monitor描述保留为历史验收记录。

状态：**Web 保持 VERIFIED_PRODUCTION_BASELINE；M8B Railway Worker 已获单独授权并完成部署、Neon 读取、日志和一次官方 Restart 验收。Worker 保持 RUNNING，所有 Monitor disabled；停止在 PRODUCTION_MONITOR_ENABLE_AUTH_REQUIRED，不进入 M9。** “Production”指 Sentinel 服务环境，链仍是 Avalanche Fuji C-Chain（chainId **43113**），仅 RPC 读取，不切换主网、不发送链上交易。

## 2026-09-27 Railway Production 实际记录

- Account/workspace：Milli / Milli's Projects，现有 Trial 权限允许部署；未购买、升级或修改计划。
- Project：`avalanche-sentinel` / `24b757df-8bc5-4bb3-b24a-e4e6fa59ca4e`；仅一个 service：`sentinel-worker` / `43a560c4-f938-4093-ac02-20556520cd6a`。
- Environment：`production` / `327a7631-722e-45af-b3d5-8c878bbb1ac4`；deployment：`46a00bce-3b86-4d26-beaa-3d38b631c823`，平台状态 SUCCESS，独立 instance 状态 RUNNING。
- 实际 deployment manifest：region `sfo`、replicas **1**、public domain **NONE**、sleep=false；无 Cron、新数据库、Redis 或 Web service。
- 使用 `Dockerfile.worker`，Dockerfile builder，Linux Node 22，镜像默认 `node --import tsx worker/index.ts`。构建日志证明 Prisma Generate、非 Next Web build。镜像 digest：`sha256:18553000783fc454f3f61a71003473798c8f091482f733f24e4c06fc2c8313b4`。
- 首次根目录上传因 archive 过大 HTTP 413 未创建部署；改用仅源码、Prisma、锁文件及 Worker 构建文件的明确白名单 staging 后成功。该 snapshot 无环境文件、缓存或本地工具目录。未创建 GitHub repo、未 push、未触及 Vercel。
- 仅传输既有 validated pooled DB secret；无 direct DB URL、admin/session、Telegram/Webhook/AI secrets。通知强制关闭、Demo=false；秘密只走 stdin/runtime variable，不写 Docker ARG、镜像、源码或文档。
- 实际 draining **30 秒**、overlap **0**、restart **ON_FAILURE / max retries 10**，未为 Always 升级计划。下方本地 pre-deploy 的35秒建议仍适用于 Compose；本次按明确授权使用 Railway 30秒。Worker 内部硬上限也是30秒，不能保证 hung tick 在平台 SIGKILL 前留出额外缓冲；当前零 Monitor 的真实 SIGTERM 已快速 clean exit。
- overlap=0 不是 distributed leader election，也不证明替换时绝无短暂进程共存；本轮 Monitor=0，未发生并行扫描。启用 Monitor 前须在 M9 明确评估替换边界，禁止扩容。
- Runtime 日志窗口 `2026-09-27T06:06:49.409328836Z` 至 `2026-09-27T06:10:32.079887362Z`：12条记录、scheduler starts=2、initial Neon read=2、SIGTERM=1、shutdown complete=1、Worker errors=0；只有一次官方 Restart，deployment id 不变、未重新 build。Restart 后一个 RUNNING instance，未观察非预期 crash/restart。
- 已读取 build/runtime 日志的 Secret leak、credential-bearing URL、raw error object exposure 均 **0**（presence-only 检查；不等于未来日志永不泄漏）。既有 Prisma OpenSSL detection warning 保留为 KNOWN WARNING，实际两次 Neon 查询成功。
- 独立 Neon 部署前/首启/Restart 后：Monitors **12**、enabled **0**、Incidents **14**、IncidentEvents **24**、Notifications **39**；Monitor 配置哈希一致。新增 Incident/Event/Notification=0、enable changes=0；部署前 acceptance enabled=0、retryable notifications=0。没有 migration 或 acceptance replay。
- Fuji startup probe/active scan：**DEFERRED_TO_M9**。零 Monitor 路径不访问 Fuji，不为连通性临时启用 Monitor。真实非空 tick/cursor recovery 未在本轮云端验证。
- Worker 留在 RUNNING/idle；Telegram/Webhook sent=0、AI calls=0、blockchain writes=0、Vercel redeploy=0。下一门禁：`PRODUCTION_MONITOR_ENABLE_AUTH_REQUIRED`。

## M8B 冻结的 Worker 运行约束

- `WORKER_REPLICAS=1` 是平台副本约束；Compose 已设置 `deploy.replicas: 1`。没有 distributed leader election，不允许多副本或自动扩容。
- 镜像 PID 1 直接运行 `node --import tsx worker/index.ts`，避免 npm 中间进程吞信号。Production 不加载 `.env.local`，仅使用注入的 `process.env`；不依赖 Windows、WSL 或 localhost Web。
- SIGTERM/SIGINT 立即停止新 tick 和新 Monitor，最多一个 active tick；已开始的 Monitor 可完成并持久化 cursor、释放 lease，然后断开 Prisma。重复信号幂等。
- 从收到信号起，tick drain 与 Prisma disconnect 共用 **30 秒硬上限**。正常退出码 0；异常或超时退出码 1，超时强制进程退出。平台停止宽限至少 **35 秒**，Compose 已设置 `stop_grace_period: 35s`。
- 强制退出不是 tick 完成证明：已提交 cursor 不回退，未完成扫描从持久化 cursor 重扫，事务回滚/lease 到期及 txHash+logIndex 去重承担恢复。需在后续获授权启用 Monitor 时另验真实非空 tick；当前不得启用 Production Monitor。
- `src/server/safe-error.ts` 只保留白名单错误类名，不输出 message、stack、cause、任意 code/custom name 或完整对象；Worker scheduler、Monitor 兜底、RPC/Validator 错误及通知异常共用此格式。牺牲敏感错误细节，不将它们写进日志或 Evidence。
- 首启必须先确认 enabled Monitor=0，使用 pooled Neon URL，`SENTINEL_DISABLE_EXTERNAL_NOTIFICATIONS=1`、Demo=false，不注入 Telegram/Webhook/AI 凭据。关闭通知时 Worker **不扫描/更新通知队列**。
- 本地复验：`docker build -f Dockerfile.worker -t avalanche-sentinel-worker:m8b .`，再运行 `node worker/predeploy-acceptance.mjs`。验收脚本先做禁用检查，随后仅本地创建命名容器，Neon SELECT/readback、Fuji eth_chainId、SIGTERM、restart、SIGINT 和日志秘密 presence-only 检查，最后停止并删除该验收容器。秘密只通过环境传递，不进 CLI 参数或文件。
- 验收证据分层：Vitest 本地持久化测试调用真实 Incident 去重和 cursor 写入逻辑（模拟数据库）；真实 Neon 容器验收所有 Monitor 保持 disabled，证明状态不变与进程重启，不声称执行真实 active Monitor 扫描。

以下 M7B 顺序保留为历史部署计划；Web 已完成 M8A，本轮未重新部署。

## 最小架构

```text
Browser → HTTPS → Vercel Next.js Web（Node.js Route Handlers）→ Neon PostgreSQL（pooled）
单副本 always-on Worker Container → Fuji RPC（read-only）→ Neon PostgreSQL（pooled）
独立一次性 Migration Job → Neon PostgreSQL（direct/unpooled）
```

- **Web：Vercel Production**。现有 Next.js 16 App Router API 路由未声明 Edge runtime，按 Node.js 默认运行；Prisma Client、`node:crypto` 和 HttpOnly 会话均留在服务端。M7A 本地 `next build` 和 Web 容器→Neon 验证通过；这不等于 Vercel 真实部署通过。项目不依赖本机 Web、Windows 路径或 Docker 才能处理 API。Vercel 项目使用 npm 锁文件、Node.js 22，并在构建命令中先执行 `npm run prisma:generate`、再执行 `npm run build`；不得在构建或启动命令中运行迁移。Web 只注入 pooled `DATABASE_URL` 和管理员会话变量。Vercel 自动生成 `*.vercel.app` URL 并为部署提供 HTTPS；本轮不绑定自定义域名。实际部署前核对项目/组织访问保护设置，登录页不应被误认为业务健康证明。[Vercel Node runtime](https://vercel.com/docs/functions/configuring-functions/runtime)、[HTTPS](https://vercel.com/docs/cdn)、[默认域名](https://vercel.com/docs/domains/working-with-domains)。
- **Database：现有 Neon PostgreSQL**。运行时用 `DATABASE_URL`（pooled）；独立迁移上下文同时注入 pooled `DATABASE_URL` 和 direct `DATABASE_URL_UNPOOLED`，由 `prisma/schema.prisma` 的 `directUrl` 使用后者。Vercel Web 和 Worker 不分发 direct URL。[Neon pooling](https://neon.com/docs/connect/connection-pooling)。
- **Worker：Railway 单副本 `sentinel-worker`，使用已验证的 `Dockerfile.worker`**，不放入 Vercel request/response Function。保留镜像默认启动命令 `node --import tsx worker/index.ts`，不要覆盖为 npm；构建时运行 `prisma:generate`，Production 只读平台注入的 `process.env`。本地 pre-deploy 已验证 Neon、Fuji 与信号退出；实际 Railway 仅验零 Monitor 下的 Neon、Restart、日志安全，配置及证据见上节。

## 上线顺序与安全默认值

1. 冻结目标 Neon branch、检查备份/可恢复窗口，在隔离 branch 验证任何新迁移；核对 `DATABASE_URL_UNPOOLED` 指向同一目标数据库的 direct endpoint。M7B 当前只读 `prisma migrate status`：**up to date，pending 0**。
2. 独立 Migration Job 先运行 `prisma migrate status`，再运行唯一生产变更命令 `npm run prisma:deploy`（即 `prisma migrate deploy`），随后再次核对状态。禁止在 Production 运行 `migrate dev`、`db push`、`migrate reset`。本轮**没有**执行 `migrate deploy`。
3. 配置 Vercel Production 环境变量、构建并部署 Web；检查 HTTPS、登录和受认证 API。正式管理员口令及高熵会话密钥必须由部署管理员在平台 Secret Store 设置，不能沿用临时验收口令。当前会话 Cookie 为 HttpOnly、Production Secure、SameSite=Lax、8 小时过期；口令仅服务端校验。
4. Worker 平台先设 **replicas=1**、崩溃重启采用有界退避，注入 pooled DB URL，并设置 `SENTINEL_DISABLE_EXTERNAL_NOTIFICATIONS=1`、`SENTINEL_DEMO_MODE=false`、`DEMO_NOTIFICATIONS_ENABLED=false`。Telegram/Webhook/AI 凭据不配置。先只验证进程、Neon 和 Fuji 连通性，确认无启用监控；不要为了连通性启用验收监控。
5. 只有在下一阶段明确批准的规则、目标和通知策略确定后，单独创建/启用正式 Monitor。现有 `configJson.acceptance=true` 的 12 个验收 Monitor 均保持 `enabled=false`；Demo 不属于 Production。M7B 读回：所有启用 Monitor **0**，启用验收 Monitor **0**，可重试通知 **0**。

## 单实例、健康、重启

- Monitor 有数据库 lease（55 秒）、持久化 cursor 与事件去重；但通知派发没有跨 Worker 的原子 claim/leader lock，**两个副本可能重复发送同一通知**。因此初始及现行正式配置固定 **1 副本**，禁止无审查自动横向扩容；数据库去重不能替代发送幂等。`WORKER_REPLICAS=1` 是部署平台配置约束，**不是**本项目读取的环境变量。
- Web 可用性：平台进程/函数状态 + HTTPS 登录页可达 + 使用授权会话读取 `/api/v1/overview`。当前无公共健康路由；不要公开数据库详情、环境变量或凭据。
- Worker 可用性：平台进程/容器存活、一次受控 DB `SELECT 1`、Fuji `eth_chainId=43113`/latest block，以及启用正式 Monitor 后的 `monitor_state.lastCheckAt`、cursor 和错误状态。**0 Monitor 时没有新 tick 业务证据**，不能把空 `lastCheckAt` 误报为健康；需平台外部进程/连接检查。日志及告警应覆盖连续失败和检查时间滞后。
- Worker 每 5 秒调度一次；异常 tick 安全记录并在下次尝试。M8B 已实现 SIGTERM/SIGINT in-flight drain 与 30 秒硬上限，见上节。平台设置崩溃重启与退避；意外中断时 lease 最多等待约 55 秒到期。重启读取持久化 cursor/lease，禁止多副本。
- 日志禁止输出连接串、管理员口令、会话密钥、Webhook Secret、Telegram Token、AI Key。Web 已完成 M8A 日志验收；Worker 已移除原始 error 对象输出，使用统一安全格式。本地测试与观察日志无泄露不等于云平台日志验收；上线后仍需独立读回。

## 故障与回滚

- Web：保持数据库与 Worker 安全默认，回退到前一已验证 Vercel deployment；再次检查认证及真实 API，不能只看静态登录页。
- Worker：先停止当前 Worker；部署前一已验证镜像，**单副本**启动；读回 cursor、lease、Incident 与 Notification 幂等状态，确认无重复 Incident/意外通知。若不可判定，保持 Worker 停止与监控禁用。
- Database：**不自动回滚迁移**，也不生成破坏性 SQL。非向后兼容 schema 变更须先做兼容性设计与独立恢复演练，再由人工按备份/Neon branch 恢复方案批准执行。

## 已知事项与阶段边界

- slim 镜像的 Prisma OpenSSL 自动检测会告警；M7A Web/Worker 容器对 Neon 的真实查询均通过。保留为 **KNOWN WARNING**，不为消除告警升级 Prisma、改基础镜像或生产数据库配置。
- Web 已完成 M8A Vercel Production 验收，本轮未重新部署。Railway Worker M8B 零 Monitor 部署验收已完成；真实启用 Monitor、Fuji scan、非空 cursor recovery 属于单独授权的 M9，不自动执行。
- 对照 [环境矩阵](deployment-env.md)、[Smoke 清单](production-smoke.md) 和既有 [M7A Release Artifact 证据](release-readiness.md)。
