# Production smoke checklist（M8A Web / M8B Railway 零 Monitor 已验证）

## Production Soak Result — M9.5 VERIFIED

- 新的正式观察起点：**2026-09-27T06:46:42.625Z**；最早结束时间：**2026-09-27T07:46:42.625Z**（北京时间14:46:42至15:46:42），最低60分钟。没有把此前Smoke时间计入正式窗口。
- 唯一目标：`cmujg0um90001dibs3bjnamtc` / Production Fuji RPC Health；enabled=true、HEALTHY、failure0、43113；Worker同一deployment `46a00bce-3b86-4d26-beaa-3d38b631c823` SUCCESS，1个RUNNING instance，replicas1、overlap0。
- START_CURSOR **58776522**；MID_CURSOR **58777294**（UTC `2026-09-27T07:19:54.692Z`）；END_CURSOR **58777993**（UTC `2026-09-27T07:50:20.212Z`），前进 **1471**。正式窗口 **63分37.587秒**；Incident/Event/Notification 起止均为 **14/24/39**，新增及新增重复记录均0。
- 配置/链RPC完整性基线 SHA256：`21024a052d67b86ce6ce96b3aa9fc1535690ea0cb816a2d35264582e4d5f9196`。仅保存hash，未保存RPC或DB凭据。
- 起点通知及Demo禁用读回通过；其他Monitor均disabled。日志历史基线 scheduler starts=3、SIGTERM=2、shutdown complete=2、Worker errors=0；本次Soak不主动Restart。
- 验收状态 **PRODUCTION_SOAK_VERIFIED / PRODUCTION_DEMO_READY**。已完成START/MID/END及约5分钟间隔独立读回，不把此前Smoke计入，也不声称连续逐秒覆盖。成功采样均HEALTHY/failure0；保留一次宿主机独立读回失败及受控重试恢复记录，根因未确认，不能据此断言P1001。Worker日志没有观察到P1001或新增故障。
- Worker终点仍为同一deployment、同一RUNNING实例，replicas1/overlap0；本窗口未观察意外crash/restart/并行实例，生命周期累计starts3/SIGTERM2/shutdownComplete2未变。配置hash与START一致，仅唯一Production RPC_HEALTH enabled=true；Acceptance/Admin/Treasury/ICM enabled=0。
- 完整日志读回成功：返回19条记录（小于500条上限，无截断），最后记录 `06:36:16.153804360Z`，早于正式窗口；本窗口没有新增error/warning/lifecycle记录。已读日志secret leak/raw error/credential URL exposure均0。权限及完整性依据为成功取得既有非空日志，不把窗口内0记录当权限证明。OpenSSL提示仅为历史warning，不宣称已修复。
- 终点官方metrics（60s聚合、65点）：CPU_USAGE平台原值max **0.00183907**、mean **0.00102175**；Memory约 **0.043237376→0.051961856GB**、max **0.052436992GB**，未观察OOM/crash。轻微增长不等于证明没有内存泄漏；分钟桶可能覆盖起点所在整分钟。
- 最终用户已登录Chrome `/monitors` 只读验收：目标配置名称Production Fuji RPC Health、production=true/acceptance=false/demo=false/expectedChainId=43113；唯一ACTIVE、HEALTHY、latency109ms、最近巡检北京时间15:53:20。实际Console读取error0，另有12条warning（未分类，不声称warning0）。其他暂停Monitor的历史异常与历史Open Incident保留，不ACK或隐藏。
- Neon通知窗口独立SELECT：sentAt窗口内计数0、updatedAt窗口内计数0；终点通知关闭、Demo关闭，禁止配置未增加。Telegram/Webhook发送、AI、链上写入、Web redeploy、Worker rebuild均0。本次不进行故障注入/重启/迁移，保持既有Worker及唯一Monitor运行；验收完成后停止本轮heartbeat，不自动进入下一阶段。

### Soak 只读采样记录

- **2026-09-27T06:54:51.272Z**（约8分钟）：cursor **58776695**，比START前进173；lastCheck `06:54:23.499Z`，HEALTHY，failure0，latency92ms，errorPresent=false。唯一启用项仍为目标Production RPC_HEALTH，配置hash与START一致；Incident/Event/Notification **14/24/39**，delta均0。
- 同轮Railway读回：原deployment SUCCESS，1个RUNNING instance（id未变），replicas1、overlap0。日志读取成功，返回19条历史记录，最后记录仍为 `06:36:16.153804360Z`（早于Soak起点），没有观察到本窗口新增日志、startup/crash/shutdown；累计starts3/SIGTERM2/shutdownComplete2/workerErrors0未变。已读记录secret/raw-error/credential-URL命中0；历史OpenSSL提示不算本窗口新故障。空的本窗口日志不代表发生了新tick日志，也不替代独立state推进证据。
- 本轮只读采样正常，未通知用户；仍等待MID/END及满60分钟最终验收。合理间隔采样不能证明间隔内每个瞬时failure值均为0。
- **2026-09-27T06:59:43.545Z**（约13分钟）：cursor **58776810**，相对上一采样+115、相对START+288；lastCheck `06:59:38.661Z`，HEALTHY/failure0/latency99ms/errorPresent=false；唯一Production启用、配置hash未变，Incident/Event/Notification仍 **14/24/39**。原deployment SUCCESS、同一RUNNING instance、replicas1、overlap0；日志读取成功，仍19条既有历史记录、最后时间早于Soak，累计starts3/SIGTERM2/shutdownComplete2/workerErrors0未变，未观察本窗口新增故障/重启日志；已读日志秘密/raw-error/credential-URL命中均0。继续观察，未执行任何Production变更。
- **07:04轮采样异常**：宿主机独立DB只读helper首次返回 `SAFE_SMOKE_CHECK_FAILED`；未取得白名单错误原因，不能断言P1001或Worker连接故障，也不能算成功。仅做一次受控只读重试，于 **2026-09-27T07:05:04.701Z** 成功：cursor **58776939**（相对上一成功采样+129、START+417），lastCheck `07:04:53.888Z`，HEALTHY/failure0/latency113ms/errorPresent=false，hash未变，Incident/Event/Notification **14/24/39**，唯一Production启用。Railway原部署SUCCESS、同一单实例RUNNING、replicas1/overlap0；日志读取成功且仍为19条既有历史记录，starts3/SIGTERM2/shutdownComplete2/workerErrors0未变，无本窗口新故障日志，安全命中0。本次是已恢复的独立读回异常，根因未证实；累计宿主机失败采样1，真实Worker失败未观察到。继续Soak，不抹除该异常，不修改Production。

- **2026-09-27T07:09:41.650Z**（约23分钟）：cursor **58777051**（上一成功采样+112、START+529），lastCheck `07:09:34.071Z`，HEALTHY/failure0/latency115ms/errorPresent=false；唯一Production enabled，hash未变，Incident/Event/Notification **14/24/39**。本轮独立DB读回首次即成功。原deployment SUCCESS、同一RUNNING instance、replicas1/overlap0；日志读取成功且仍19条历史记录、累计starts3/SIGTERM2/shutdownComplete2/workerErrors0未变，没有观察到Soak窗口新增故障日志，已读日志安全命中均0。此前一次宿主机读回异常保留；本轮无新异常，继续等待MID/END。

- **2026-09-27T07:14:41.637Z**（约28分钟）：cursor **58777162**（上一采样+111、START+640），lastCheck `07:14:14.260Z`，HEALTHY/failure0/latency118ms/errorPresent=false；唯一Production enabled、hash未变，Incident/Event/Notification **14/24/39**，delta0。独立DB读回成功；原deployment SUCCESS、同一单实例RUNNING、replicas1/overlap0。日志读取成功，19条历史记录、starts3/SIGTERM2/shutdownComplete2/workerErrors0未变，无本窗口新增日志；已读日志安全命中0，历史OpenSSL提示未作为新fault。本轮无异常，尚未满60分钟。

- **MID — 2026-09-27T07:19:54.692Z**（约33分钟）：cursor **58777294**（上一采样+132、START+772），lastCheck `07:19:29.469Z`，HEALTHY/failure0/latency118ms/errorPresent=false；唯一Production enabled、hash未变，Incident/Event/Notification **14/24/39**，delta0。独立DB读回成功；原deployment SUCCESS、同一单实例RUNNING、replicas1/overlap0。日志读取成功，19条历史记录、starts3/SIGTERM2/shutdownComplete2/workerErrors0未变，无本窗口新增故障日志；已读日志安全命中均0。中点正常，等待END及最终Web验收，未执行任何Production变更。

- 中点环境只读复核：notificationsDisabled=true、demoDisabled=true、pooled secret匹配既有值，direct/admin/session/notification/AI凭据均未增加。只报告presence与布尔标志，未打印任何Secret。

- **2026-09-27T07:24:46.737Z**（约38分钟）：cursor **58777406**（上一采样+112、START+884），lastCheck `07:24:09.668Z`，HEALTHY/failure0/latency98ms/errorPresent=false；采样快照leaseHeld=true，属于捕获到lease持有状态，不据此断言stuck/并发，后续继续观察。唯一Production enabled、hash未变，Incident/Event/Notification **14/24/39**。原deployment SUCCESS、同一RUNNING instance、replicas1/overlap0；日志读取成功，19条历史记录与生命周期/错误计数未变，未观察Soak新故障日志，安全命中0。
- 本轮官方只读metrics查询成功（仅限定当前project/service/environment、60s聚合）：CPU_USAGE 41点，平台原值min **0.00050133** / max **0.00183907** / mean **0.00102378**，未观察CPU runaway；MEMORY_USAGE_GB 41点，起点分钟约 **0.043237376GB** → 最近约 **0.05185536GB**，max **0.05198848GB**。这是轻微上升的真实信号，不声称完全平坦或证明无内存泄漏；结合无OOM/crash/restart日志继续观察终点。指标按分钟聚合，首桶可能覆盖起点所在整分钟，不等于逐秒精确窗口。

- **2026-09-27T07:29:46.480Z**（约43分钟）：cursor **58777521**（上一采样+115、START+999），lastCheck `07:29:24.890Z`，HEALTHY/failure0/latency111ms/errorPresent=false/leaseHeld=false；前次lease持有快照未持续，cursor继续推进。唯一Production enabled、hash未变，Incident/Event/Notification **14/24/39**；独立DB读回成功。原deployment SUCCESS、同一单实例RUNNING、replicas1/overlap0；日志读取成功，仍19条历史记录与既有生命周期/错误计数，无Soak新日志，已读日志安全命中0。未发现新异常，仍未满60分钟。

- **2026-09-27T07:34:56.659Z**（约48分钟）：cursor **58777641**（上一采样+120、START+1119），lastCheck `07:34:40.134Z`，HEALTHY/failure0/latency127ms/errorPresent=false/leaseHeld=false；唯一Production enabled、hash未变，Incident/Event/Notification **14/24/39**，独立DB读回成功。原deployment SUCCESS、同一单实例RUNNING、replicas1/overlap0；日志读取成功，历史19条、starts3/SIGTERM2/shutdownComplete2/workerErrors0仍不变，无Soak新增日志，已读日志安全命中0。未观察新异常，正式60分钟窗口尚未结束。

- **2026-09-27T07:39:50.041Z**（约53分钟）：cursor **58777750**（上一采样+109、START+1228），lastCheck `07:39:20.230Z`，HEALTHY/failure0/latency92ms/errorPresent=false/leaseHeld=false；唯一Production enabled、hash未变，Incident/Event/Notification **14/24/39**，独立DB读回成功。原deployment SUCCESS、同一单实例RUNNING、replicas1/overlap0；日志读取成功，仍19条既有历史记录，starts3/SIGTERM2/shutdownComplete2/workerErrors0未变，无Soak新增故障日志，已读日志安全命中0。本轮无新异常，继续等待60分钟终点。

- **2026-09-27T07:44:50.087Z**（约58分钟，非END）：cursor **58777877**（上一采样+127、START+1355），lastCheck `07:44:35.405Z`，HEALTHY/failure0/latency91ms/errorPresent=false/leaseHeld=false；唯一Production enabled、hash未变，Incident/Event/Notification **14/24/39**，独立DB读回成功。原deployment SUCCESS、同一单实例RUNNING、replicas1/overlap0；日志读取成功，仍19条历史记录和既有生命周期/错误计数，无Soak新日志，已读日志安全命中0。本轮无新异常，未满60分钟，等待后续END/资源终点及Production Web验收，不提前宣告PASS。

- **END — 2026-09-27T07:50:20.212Z**：cursor **58777993**（START+1471），lastCheck `07:49:50.620Z`，HEALTHY/failure0/latency107ms/errorPresent=false/leaseHeld=false；唯一Production enabled、hash未变，Incident/Event/Notification **14/24/39**。独立DB读回成功；原deployment SUCCESS、同一RUNNING实例、replicas1/overlap0；日志成功取得完整19条既有记录，既有生命周期与错误计数未变，安全命中0。正式窗口超过60分钟；最终资源与Chrome只读验收通过。

## 2026-09-27 M9 Production Worker Smoke

- 用户单独授权创建并启用唯一 `Production Fuji RPC Health`，完成一次官方 Restart；没有启用其他 Monitor，没有 Web/Worker rebuild。
- Monitor id：`cmujg0um90001dibs3bjnamtc`；RPC_HEALTH，interval=30s，metadata `production=true / acceptance=false / demo=false / expectedChainId=43113`。Schema 无 name/production 列，名称与标记保留在既有 configJson，Web 的 Config JSON 可见；沿用真实43113 Chain Registry（其历史显示名仍为 DB Acceptance Fuji），不更改 Registry 或 Schema。
- 使用既有2000ms延迟阈值、连续失败阈值3。host-side helper只创建/启用目标及独立读回，不启动本地 Worker、不写 cursor；真正 tick 在 Railway 执行。创建前独立只读 Fuji chainId/head 成功；实际部署 RPC Health 仅在 observed chainId 与43113匹配后才写 HEALTHY 与最新 head。云端 chainId 校验成功的证据为已部署规则与持续 HEALTHY/cursor 状态，不声称存在额外 raw chainId 日志。
- First cursor **58776235**（lastCheck UTC `2026-09-27T06:34:33.366Z`，latency147ms）；second cursor **58776247**（`06:35:08.157Z`，106ms），真实推进，failure count=0。
- Restart 前 cursor **58776264**，HEALTHY；本轮仅一次 Railway 官方 restart，deployment仍为 `46a00bce-3b86-4d26-beaa-3d38b631c823`。日志顺序 SIGTERM → shutdown complete → scheduler starting，新启动日志 enabled monitors=1。正常shutdown代码路径退出0，未出现timeout/error。
- Restart 后 cursor **58776275**（`06:36:17.797Z`），随后 **58776295**（`06:36:52.723Z`）及 **58776327**（`06:38:02.852Z`），均HEALTHY、failure0。持久化状态未清空、cursor未回退；RPC_HEALTH读取当前head而非历史日志扫描，不能把本项推广为 Treasury/Admin/ICM 历史扫描恢复验收。
- 平台最后读回1个 RUNNING instance、replicas1、overlap0；本次生命周期日志未显示 scheduler 并行运行。此观察不是 distributed leader election，也不是未来切换永无重叠的保证，不允许自动扩容。
- Production Chrome 用户会话 `/monitors`、重启后 `/overview` → `/monitors` PASS；最新项 HEALTHY、ACTIVE、111ms，名称/Production标记在配置中可见。Console error=0；另有12条warning，未声称warning=0。Overview保留既有验收Open Incident导致的CRITICAL，本轮未ACK或隐藏这些记录。
- Neon before/after：Incident **14→14**、Event **24→24**、Notification **39→39**，new/duplicate各为0；仅新增1个Monitor，总数12→13；唯一Production enabled=1，acceptance/Admin/Treasury/ICM enabled=0。
- 已读Railway日志（包含本次restart）Secret leak=0、raw error exposure=0、credential URL exposure=0，Worker error=0。既有Prisma OpenSSL检测告警未隐藏，真实Neon/Fuji在线成功。
- Telegram/Webhook/AI/链上写入=0；Failure injection NOT PERFORMED，Vercel redeploy=0。生产Worker与唯一Monitor保持运行/启用，未开始M9.5。
- Soak起始快照（独立Neon读回时间）：**2026-09-27T06:38:25.566Z**；monitor `cmujg0um90001dibs3bjnamtc`；cursor **58776327**；Incident **14**、Event **24**、Notification **39**；deployment `46a00bce-3b86-4d26-beaa-3d38b631c823`。这是固定基线，不代表持续增长的当前head。
- 本地验收helper语法与针对性ESLint PASS；未因本轮数据操作重跑已通过的全量构建。
- **PRODUCTION_WORKER_SMOKE_VERIFIED / PRODUCTION_SOAK_READY**，等待单独Soak授权。

## 2026-09-27 Railway Production 验收

- [x] 已明确授权项目/服务创建、既有 pooled secret 传输、Worker 部署及一次官方 Restart；未授权 Monitor enable。账户 Milli，workspace Milli's Projects，未升级计划。
- [x] Project `avalanche-sentinel`（`24b757df-8bc5-4bb3-b24a-e4e6fa59ca4e`），仅 service `sentinel-worker`（`43a560c4-f938-4093-ac02-20556520cd6a`）。Environment production（`327a7631-722e-45af-b3d5-8c878bbb1ac4`）。
- [x] Deployment `46a00bce-3b86-4d26-beaa-3d38b631c823`：SUCCESS，1 instance RUNNING，manifest region `sfo`，replicas=1，public domains=0，sleep=false，无 Cron。
- [x] Build 明确 `Dockerfile.worker`、Prisma Generate、Linux Node22，不含 Next Web build、环境文件或 secret Docker ARG。
- [x] Runtime 仅 pooled DB secret，direct/admin/session/notification/AI secrets 未配置；notifications disabled、Demo=false。
- [x] 实际 drain=30s、overlap=0、restart policy=ON_FAILURE、max retries=10。30s 与 Worker deadline 相同，不声称 hung tick 有额外平台宽限；本轮零 Monitor 快速停机通过。overlap=0 不替代 leader election，禁止多副本。
- [x] 一次官方 Restart（不是 rebuild）：旧实例 SIGTERM received / shutdown complete；新实例 scheduler starts、initial Neon read enabled=0。相同 deployment id；首次启动和重启共2次 Neon 成功读取，未观察意外重启/crash，Worker errors=0。
- [x] Runtime 日志窗口 UTC `2026-09-27T06:06:49.409328836Z`～`2026-09-27T06:10:32.079887362Z`，12条记录；Secret leak=0、raw error object exposure=0、credential URL exposure=0，build 日志亦为0。仅统计已读日志，不输出 raw logs 或 secrets。
- [x] 独立 Neon 前/首启/重启后：Monitors=12、enabled=0、Incidents=14、IncidentEvents=24、Notifications=39；Monitor 配置哈希一致，新增上述业务记录=0、enable changes=0。部署前 acceptance enabled=0、retryable notifications=0。
- [x] Worker 保持 RUNNING/idle；Telegram=0、external Webhook=0、AI=0、blockchain writes=0、Vercel redeploy=0，没有 migration。
- Fuji startup probe / active scan：**DEFERRED_TO_M9**，零 Monitor 路径不访问 RPC。未执行云端真实非空 tick/cursor recovery，不算本轮 blocker。
- 已知 Prisma OpenSSL 检测 warning 保留；两次真实 Neon 读取通过。历史本地加固记录见下，不将其误当云端 enabled Monitor 验收。
- 结论：**RAILWAY_WORKER_PRODUCTION_VERIFIED**；停止在 **PRODUCTION_MONITOR_ENABLE_AUTH_REQUIRED**，不自动进入 M9。

## M8B 上云前检查

- [x] `WORKER_REPLICAS=1` 冻结，无 distributed leader election；Compose replicas=1，禁止自动横向扩容。
- [x] SIGTERM/SIGINT 后不启动新 tick，active tick max=1；无 tick 时断连退出，active tick drain 后持久化完成再断连。
- [x] shutdown timeout=30s，涵盖 active tick 和 disconnect；超时退出码1，正常退出码0。容器 PID1直接 Node；平台宽限至少35s。
- [x] 本地 Vitest 覆盖 before-tick/during-tick、幂等停机、不再调度、超时、cursor 持久化及重启后同一事件去重。真实 Incident Engine 被调用，DB 采用测试替身，不修改 Production。
- [x] 统一 safe error formatter 不输出任意错误文本、stack、cause、headers、凭据 URL；测试注入含秘密的错误/custom name。
- [x] Production env-only，不读取 `.env.local`；Linux image 不含环境文件，不依赖 Windows/WSL/本机 Web。
- 本地执行 `node worker/predeploy-acceptance.mjs` 验证真实 pooled Neon、Fuji chainId=43113、容器 start/SIGTERM/restart/SIGINT；前后 MonitorState/Notification 哈希与 Incident 数比较，所有 Monitor disabled。此检查不是云 Worker 部署验收。
- 关闭通知时 Worker 不派发也不更新队列；不注入 Telegram/Webhook/AI 凭据。验收结束移除唯一命名临时容器。
- Prisma Generate/Validate、full Vitest、ESLint、TypeScript、Worker Docker build、Next build、Compose config 必须全部 PASS。
- M8B 完成后停在 `WORKER_PLATFORM_REQUIRED`；不得自行创建服务。云日志、平台重启策略及真实已启用 Monitor 的 cursor 验收属于后续授权阶段。

### 2026-09-27 本地验收记录

- 本地 Node 24.19.0 / npm 11.17.0（匹配 packageManager）；容器 Node 22 Linux。未升级依赖。
- Prisma Generate / Validate、Vitest **16 files / 61 tests**、ESLint（0 error / 0 warning）、TypeScript、Next production build、Worker Docker build、Compose config：PASS。
- 本地镜像 `avalanche-sentinel-worker:m8b`：start、SIGTERM、restart、SIGINT PASS；正常退出码0，Worker error logs=0。
- 真实 pooled Neon SELECT/readback PASS；从已配置 Chain Registry 读取 RPC，Fuji eth_chainId=43113 PASS。所有 Monitor enabled=0，状态/游标/通知快照哈希不变，新增 Incident=0，观察日志 Secret leak=0。
- 单元测试已覆盖有界 hung tick/disconnect 与错误脱敏。容器独立 hung-tick fixture 使用同一 scheduler、缩短 deadline=100ms 验证真实进程退出码1；Production 常量为30秒。该 fixture 无数据库或网络调用。
- 首轮验收脚本曾把 Prisma OpenSSL 提示行误当 JSON，修正为只解析结构化结果后通过。既有 Prisma OpenSSL 检测告警仍记录为 KNOWN WARNING；真实 Neon 查询通过，不假称告警消失。
- 后续曾观察一轮 Worker error count=1，以及一次只读 preflight 失败（无可靠根因证据）；未隐藏或当作通过。补充安全阶段/白名单代码诊断后，最终完整重验：Worker errors=0，SIGTERM/restart/SIGINT exit codes=[0,0,0]，bounded timeout PASS；宿主机 Neon SELECT1 与 enabled Monitor=0 独立读回通过。先前间歇失败根因仍未证实，云平台阶段必须保留连接错误监控与重启退避。
- 没有 Production Worker 部署、Monitor 启用、数据库写入、外发通知、AI 调用或链上写入。验收容器已停止并移除。

前提：取得逐项部署/真实环境授权；记录环境、镜像/部署版本、Neon branch、UTC 时间。仅检查 Fuji C-Chain **43113** 的只读 RPC；不发送链上交易、不自动发送 Telegram/Webhook/AI 请求。任何秘密只报告 `SET/MISSING`，不打印值。

## 1. Database 与部署前门禁

- [ ] 备份/Neon branch 恢复点和迁移兼容性已核对；`DATABASE_URL` 为 pooled，Migration Job 的 `DATABASE_URL_UNPOOLED` 为同一目标 branch 的 direct。
- [ ] `prisma migrate status` 无待迁移；若有已批准迁移，只由独立 Job 运行 `npm run prisma:deploy`，完成后再次 readback。不得运行 `migrate dev`、`db push`、`migrate reset`。
- [ ] 既有验收 Monitor 全部 `enabled=false`；首启 Production Monitor **0**，可重试通知 **0**。区分 acceptance、Demo 和正式 Monitor。

## 2. Web（Vercel Production）

- [ ] Production 构建成功；目标 URL 为 HTTPS（可先用 `*.vercel.app`），访问保护/自定义域名状态与计划一致。
- [ ] `/login` 可打开；真实管理员口令登录后 Cookie `HttpOnly`、`Secure`、`SameSite=Lax`、8 小时到期；登出使会话失效。错误口令不能访问受保护 API。
- [ ] `/overview`、`/monitors`、`/incidents`、`/incidents/[id]` 与对应受认证 `/api/v1/*` 返回真实 Neon 数据；检查加载、空、错误/重试状态，不接受静默 Mock Healthy。
- [ ] 未登录直接请求受保护 API 应为 401；认证 API 故障不应泄露数据库、环境或凭据详情。目标平台日志做秘密脱敏检查。

## 3. Worker（先安全启动，再受控启用）

- [ ] 平台只有 **1** 个 Worker 副本，always-on、带崩溃重启退避和停止宽限；无 `.env.local`、Windows/WSL/Docker Desktop/本机 Web 依赖。
- [ ] `SENTINEL_DISABLE_EXTERNAL_NOTIFICATIONS=1`，Demo 关闭，Telegram/Webhook/AI 不配置；确认启用正式 Monitor 仍为 **0**。
- [ ] 进程存活，Neon 只读查询成功；Fuji RPC `eth_chainId == 43113` 且能读取最新区块，不把 Fuji 误认成 Avalanche Mainnet。
- [ ] 在另行批准的唯一正式 Monitor 上做最小受控读取后，读回 `monitor_state.lastCheckAt`、cursor、状态；如重复扫描同一区间，验证 Incident/Event 不重复。未获启用授权时本项保持未执行。
- [ ] 重启单副本后检查 cursor/lease 延续、无重复 Incident、无意外通知；无正式 Monitor 时只记录进程/DB/RPC 检查，不虚报“latest successful tick”。

## 4. 安全计数与退出条件

- [ ] 意外新增 Incident = **0**；意外外发通知 = **0**；链上写入 = **0**。出现异常即停止 Worker、禁用相关 Monitor、保留证据。
- [ ] 镜像、部署环境、Web/Worker 日志均无 Secret 泄露；Prisma OpenSSL 告警与实际查询结果分别记录，不用“告警消失”代替功能验证。
- [ ] 记录 Web 回退到前一部署、Worker 停止→前一镜像单副本重启的演练证据；数据库迁移不自动回滚。

未真正执行以上步骤之前，状态只能是 **smoke plan ready**，不得报告 Production smoke passed。
