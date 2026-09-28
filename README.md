# Avalanche Sentinel

面向 Avalanche 的安全与运维监控 MVP。独立 Worker 读取 RPC 和链上事件，由确定性规则生成 Incident；Web Dashboard 展示监控状态、事件时间线与证据，帮助管理员判断“发生了什么、依据是什么、哪些结论仍待确认”。

这里的“只读”指不签名、不发送链上交易。应用仍会将监控状态、Incident 和通知记录写入 PostgreSQL；管理员创建监控、确认事件和生成 Demo 属于应用层写操作，生成 AI 摘要会调用外部服务，都不等同于只读浏览。

- 源码仓库：[tz-hao/Avalanche-Sentinel](https://github.com/tz-hao/Avalanche-Sentinel)
- Production Web：[Avalanche Sentinel](https://avalanche-sentinel-mocha.vercel.app/)（需要管理员登录，不公开提供口令）
- 设计原则：真实 API 优先、证据可复盘、异常不隐藏、外部副作用按范围授权。

## 验收基线与适用范围

本版本对应已完成的 `PRODUCTION_SOAK_VERIFIED`、`FINAL_UI_VERIFIED` 与 `PRODUCTION_DEMO_READY` 里程碑。以下是 **2026-09-27 验收时的历史快照**，不是当前在线状态或持续可用性承诺：

- Web Production 已完成登录、页面、认证 API、Network、Console 与指定窗口的 Runtime Logs 验收。
- Railway Worker 保持单副本；唯一启用的 Production Monitor 为 Fuji RPC Health，网络 Chain ID 为 `43113`。
- 正式 Soak 窗口为 63 分 37.587 秒，持久化 cursor 前进 1471；Incident、Event、Notification 数量未新增。
- Admin、Treasury、ICM 和 Acceptance Monitor 在该窗口保持禁用；未发送 Telegram/Webhook，未调用 AI，未执行链上写入。
- Soak 采用 START/MID/END 与间隔采样，不代表逐秒连续覆盖。历史告警和一次已恢复的宿主机读回异常仍保留在验收记录中。

完整依据见 [Production Smoke / Soak 记录](docs/production-smoke.md)。文档中的早期阶段和较少的测试数量是当时的记录，不应覆盖后续验收结果，也不代表每种监控都已在 Production 长期启用。

## 功能

### 监控类型

| 类型 | 实现能力 | 重要边界 |
| --- | --- | --- |
| `RPC_HEALTH` | 读取 Chain ID、最新区块与请求延迟，跟踪连续失败和恢复 | 默认延迟阈值 2000 ms、连续失败阈值 3；可配置预期 Chain ID，不能仅凭 HTTP 成功判定网络正确 |
| `TREASURY` | 检查目标地址 Native 转出，以及指定 ERC-20 的 `Transfer` 日志；支持阈值、收款白名单和扫描范围 | 金额使用 BigInt 最小单位；Native 检测针对区块中的顶层交易，不是内部调用 trace 的全覆盖 |
| `ADMIN` | 匹配 `OwnershipTransferred`、`RoleGranted`、`RoleRevoked`、`Upgraded` 等受支持的事件 topic | 只在配置地址与事件范围内检测；权限变更需要人工复核，不自动判定攻击 |
| `ICM_DELIVERY` | 关联已验证 Teleporter source/destination 消息证据，保存投递状态与等待窗口 | Delivery Pending 不等于 Relayer 故障；消息交付与应用执行结果必须分开理解 |
| `CUSTOM_EVENT` | 使用受限事件 ABI、字段名和整数阈值匹配自定义事件 | 不接受可执行表达式，不运行用户提供的 JavaScript |
| `VALIDATOR_HEALTH` | 读取显式配置的健康数据源 | 没有可信数据源时不能宣称健康；不是默认覆盖所有 Avalanche Validator 的服务 |

Monitor 默认检查间隔为 30 秒，创建契约允许 15–3600 秒。Worker 调度循环与 Monitor 的检查间隔是两个不同概念：调度循环会检查哪些 Monitor 已到执行时间，并不在每次 tick 都扫描全部目标。

### Incident 与 Evidence

- 严重程度：`INFO`、`WARNING`、`CRITICAL`。
- 生命周期：`OPEN` → `ACKNOWLEDGED` → `RECOVERED`；恢复也可以由规则直接从 OPEN 触发，不要求先 ACK。
- ACK 表示管理员已知悉，不代表链上问题已解决；恢复由检测逻辑更新，不提供任意手动恢复来隐藏异常。
- Evidence Snapshot 保存规则、链、目标、观察时间、来源与事实；适用时附带交易哈希、区块号和准确的 logIndex。
- Timeline 保留事件发生、确认和恢复等记录；事件证据不会因 Dashboard 刷新而重新编造。
- 持久化 cursor、事件唯一性和通知幂等用于重启续扫与去重；它们不构成无限扩展、多副本或所有外部系统 exactly-once 的保证。

### Web 页面

| 页面 | 用途 |
| --- | --- |
| `/login` | 单管理员口令登录，建立短时会话 |
| `/overview` | 整体状态、开放事件、启用监控、最近检查与近期事件 |
| `/monitors` | 监控列表、类型化创建、启停与检查结果 |
| `/incidents` | 按 severity、status、time 等 URL 条件筛选事件 |
| `/incidents/[id]` | 事件规则、目标、Evidence、Timeline 与 ACK 操作 |

页面使用真实 API，明确展示加载、空、失败、不可用和重试状态。未配置、未检查或缺少数据时不能替换为 Mock Healthy、伪成功或静默 fallback。

## 架构与技术栈

```text
浏览器 → Next.js Web / 认证 API → PostgreSQL
                                    ↑
独立 Worker → 只读 RPC / 健康数据源 → 状态、cursor、Incident、Evidence
      └────→ 通知队列 → Telegram / 签名 Webhook（需显式配置与授权）
```

- Web：Next.js 16 App Router、React 19、TypeScript、Tailwind CSS 4。
- 数据层：Prisma 6、PostgreSQL；Production 使用 Neon pooled 连接运行应用。
- Worker：Node.js、TypeScript / tsx、viem，Polling + Block Cursor。
- 校验与测试：Zod、Vitest、Testing Library、ESLint、TypeScript。
- 部署：Web 和 Worker 分别构建；Web 使用 Vercel，Worker 使用 Railway。Docker Compose 用于显式区分 Web、迁移和 Worker 启动。

核心数据包括 `chains`、`monitors`、`monitor_state`、`incidents`、`incident_events`、`notifications`，另有 ICM 消息持久化模型。数据库表结构和索引以 [Prisma schema](prisma/schema.prisma) 与已提交迁移为准。

### 目录

```text
src/
  app/                 页面及 /api/v1 路由
  components/          Dashboard、表单与证据展示组件
  contracts/           领域类型、API 类型、Monitor 配置校验
  lib/                 前端 API 客户端
  server/              会话、数据库、Incident、通知、AI 与 Demo
worker/                调度、lease、监控规则及验收 helper
prisma/
  schema.prisma        数据模型
  migrations/          已提交的数据库迁移
docs/                  契约、部署说明与分阶段验收记录
Dockerfile             Web 镜像
Dockerfile.worker      Worker / 迁移镜像
compose.yaml           显式服务与 profile 配置
```

测试文件与对应模块相邻，使用 `*.test.ts` / `*.test.tsx`，不要求独立的 `tests/` 目录。

## 本地运行

以下示例使用 Windows PowerShell 与 `npm.cmd`。项目声明包管理器为 `npm@11.17.0`，保留 `package-lock.json`，使用 `npm ci` 安装，不自行升级依赖。Docker 使用 Node 22；项目未声明 `engines`，本地应使用兼容的 Node 版本。下方 `node --env-file` 示例要求支持该参数的运行时，Node 22 可使用。

### 1. 安装与私有配置

```powershell
Set-Location 'C:\Users\71546\Desktop\Avalanche Sentinel'
npm.cmd ci
Copy-Item -LiteralPath .env.example -Destination .env.local
```

复制命令仅用于首次配置；若 `.env.local` 已存在，不要覆盖。私下编辑该文件，至少填写：

- `DATABASE_URL`：开发数据库的 pooled 连接。
- `DATABASE_URL_UNPOOLED`：同一开发数据库的 direct/unpooled 连接，用于迁移。
- `SENTINEL_ADMIN_PASSWORD`：管理员口令。
- `SENTINEL_SESSION_SECRET`：至少 32 字符的高强度随机会话密钥。

使用独立的本地或开发数据库，不要复制 Production 凭据来启动本地 Worker。尤其不能让本地 Worker 和 Railway Worker 同时扫描同一套 Production Monitor。

`.env.local` 已被 Git 忽略。环境变量仅用于服务端，不使用 `NEXT_PUBLIC_` 暴露口令、数据库连接或通知凭据。

### 2. 生成客户端与初始化开发数据库

```powershell
npm.cmd run prisma:generate
node --env-file=.env.local node_modules/prisma/build/index.js validate
```

Prisma CLI 不会像 Next.js 一样自动加载 `.env.local`，因此这里显式传入环境文件。`generate` 和 `validate` 不等于数据库迁移已经完成。

确认连接目标是允许初始化的独立开发数据库后，应用已有迁移：

```powershell
node --env-file=.env.local node_modules/prisma/build/index.js migrate deploy
```

**该命令会写数据库。** 迁移使用 schema 中的 `DATABASE_URL_UNPOOLED`；不要以 pooled URL 代替 direct URL，也不要将上述开发初始化步骤直接用于 Production。修改 schema 并生成新迁移属于单独的开发工作，不是启动应用的必要步骤。

### 3. 启动 Web

```powershell
npm.cmd run dev
```

打开 `http://localhost:3000/login`，使用本地配置的管理员口令登录，然后查看 overview、monitors 与 incidents。Next.js 开发模式加载项目根目录的 `.env.local`。

新数据库没有预置 Chain Registry 或监控数据，页面显示空状态是正常结果。项目没有通用的自动 seed 命令；链配置通过认证的 Chain Registry API 管理。先验证真实网络、Chain ID 和 RPC，再创建相应 Monitor，不要从截图或旧验收记录猜测目标。

注意两个 ID 的区别：注册链时的 `chainId` 是网络数字字符串，例如 Fuji C-Chain 的 `43113`；创建 Monitor 请求中的 `chainId` 是已注册 Chain 记录的数据库 `id`，不是直接填写 `43113`。

### 4. 可选：启动本地 Worker

仅在确认开发数据库、网络和扫描目标后，在另一个终端执行：

```powershell
Set-Location 'C:\Users\71546\Desktop\Avalanche Sentinel'
$env:SENTINEL_DISABLE_EXTERNAL_NOTIFICATIONS = '1'
npm.cmd run worker
```

开发模式 Worker 可以加载本地环境文件；`NODE_ENV=production` 时仅使用平台注入的 `process.env`，不依赖 `.env.local`、Windows、WSL 或 localhost Web。

启动 Worker 会读取真实 RPC，并持久化状态和 Incident；即使链上只读，也不是没有外部访问或数据库写入。当前创建 Monitor 的模型默认 `enabled=true`：**不要假定新 Monitor 默认暂停**。如果需要先审阅配置，在 Worker 停止时创建并禁用，确认后再启动。

`SENTINEL_DISABLE_EXTERNAL_NOTIFICATIONS=1` 用于禁止 Worker 处理外部通知投递；同时保持 Demo 关闭、不配置 AI。停止当前开发 Worker 可使用 Ctrl+C，触发受控关闭。

## 环境变量

完整说明见 [部署环境变量清单](docs/deployment-env.md)。下表只列名称和用途，不包含任何真实值：

| 变量 | 用途与范围 |
| --- | --- |
| `DATABASE_URL` | Web / Worker 运行数据库连接，Production 使用 pooled |
| `DATABASE_URL_UNPOOLED` | 迁移用 direct 连接，不注入浏览器，不作为常规运行连接 |
| `SENTINEL_ADMIN_PASSWORD` | Web 服务端校验单管理员口令，不落库 |
| `SENTINEL_SESSION_SECRET` | Web 会话签名，至少 32 字符 |
| `WORKER_ID` | Worker lease 标识；不能代替多副本 leader election |
| `SENTINEL_DISABLE_EXTERNAL_NOTIFICATIONS` | 设置为 `1` 时 Worker 不执行通知投递；安全验收配置应显式启用 |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | 可选 Telegram 配置；配置完整不代表获准发送 |
| `SENTINEL_WEBHOOK_URL` / `SENTINEL_WEBHOOK_SECRET` | 可选 Webhook 目标和签名密钥 |
| `AI_SUMMARY_ENDPOINT` / `AI_SUMMARY_API_KEY` / `AI_SUMMARY_MODEL` | 可选摘要服务，只供服务端使用 |
| `SENTINEL_DEMO_MODE` | 仅精确值 `true` 开启合成 Demo，默认关闭 |
| `DEMO_NOTIFICATIONS_ENABLED` | 仅精确值 `true` 允许 Demo 创建通知队列记录，默认关闭 |

RPC 配置保存在 Chain Registry 的 `rpcUrl`；部分 Monitor 有专用或覆盖 RPC 配置。不要假定设置一个不存在的 `FUJI_RPC_URL` 环境变量就能完成 Chain Registry。RPC 中若包含凭据，也必须按 Secret 管理，不能放进截图、文档或日志。

## API 与认证

API 基础路径为 `/api/v1`。登录入口接收管理员口令；Dashboard 数据及管理操作要求管理员会话。前端应沿用 [API 客户端](src/lib/sentinel-api.ts) 与 [共享契约](src/contracts/api.ts)，而不是另造接口。

| 方法 | 路径 | 行为 |
| --- | --- | --- |
| `POST` / `DELETE` | `/admin/session` | 登录 / 注销 |
| `GET` | `/overview` | 整体健康与近期事件 |
| `GET` / `POST` | `/chains` | 读取 / 注册链配置；POST 会写数据库 |
| `GET` / `POST` | `/monitors` | 读取 / 创建监控 |
| `PATCH` | `/monitors/:id` | 更新启停或检查间隔 |
| `GET` | `/incidents` | 按查询条件读取事件列表 |
| `GET` | `/incidents/:id` | 读取事件详情与时间线 |
| `POST` | `/incidents/:id/ack` | 确认知悉事件；写入应用状态 |
| `POST` | `/incidents/:id/summary` | 显式生成 AI 摘要；需模型配置，会产生外部调用 |
| `POST` | `/demo/incident` | 显式创建合成事件；仅 Demo 开启时可用，会写数据库 |

会话 cookie 为 HttpOnly、SameSite=Lax，Production 使用 Secure，有效期 8 小时。管理员口令不写入浏览器持久化存储。没有多用户、RBAC、SAML、计费或多 Workspace。

未登录、配置缺失、数据库不可达和请求失败必须以真实状态处理；`401` 不是监控健康结果，`503` 也不能替换为假数据。接口类型和错误语义见 [前端交接契约](docs/frontend-contract.md)。

## 通知、AI 与 Demo

- Telegram / Webhook 使用持久化通知记录与幂等标识，失败按有限重试策略处理。未配置时记录未配置或跳过，不伪造发送成功。
- Webhook 使用 `x-sentinel-signature` 的 HMAC-SHA256 签名和 `idempotency-key`；接收方仍需校验签名并实现幂等。
- AI 仅总结已有规则和证据，不参与触发、定级或自动响应。缺少模型配置不阻塞 Incident；显式生成摘要不是只读浏览。
- Demo 创建的 Evidence 标记为 `demo` / synthetic，不与真实 RPC 证据混淆；默认不创建外部通知队列记录。需要至少一个启用 Monitor 才能创建 Demo Incident。
- “凭据已配置”“通知已入队”“外部请求成功”“目标独立读回通过”是不同阶段，不能互相替代。

## 测试与本地质量门禁

```powershell
npm.cmd run prisma:generate
node --env-file=.env.local node_modules/prisma/build/index.js validate
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

开发时可使用 `npm.cmd run test:watch`。本地生产模式需要先 build，再执行 `npm.cmd run start`。

测试覆盖共享配置、前端状态与证据展示、Incident/通知逻辑、Worker 规则、调度与重启等模块。Vitest 通过不等于真实数据库、Fuji、通知目标或 Production 平台已验收；后者需要明确目标、授权和独立读回。

构建和静态检查也不能代替浏览器检查。涉及页面变更时应覆盖登录、overview、monitors、incidents、Evidence、窄屏和真实错误状态；只有实际读取到 Console / Network 日志才能声明该项已检查。

## Docker 与部署边界

Docker Web / Worker 镜像使用 Node 22。Compose 默认仅启动 Web，Worker 和迁移分别由显式 profile 控制；Compose 不内置 PostgreSQL，需要自行提供获准使用的数据库连接。

仅验证 Compose 配置，不启动服务：

```powershell
docker compose --env-file .env.local config --quiet
```

使用 `--quiet` 避免把展开后的连接和密钥打印到终端。不要把完整 `docker compose config` 输出作为公开验收日志。

对于已获准使用的开发数据库，Web 可单独启动：

```powershell
docker compose --env-file .env.local up --build -d web
```

需要迁移或 Worker 时，先按 [部署前检查清单](docs/deployment-checklist.md) 核对目标，再执行对应 profile；这里不提供“一键全部启动”的 Production 命令。不要用默认启动行为推断 Worker 已运行。

### Worker 运行约束

- **固定 `WORKER_REPLICAS=1`**：这是平台副本配置约束，不是代码读取该环境变量就能强制限流。当前未实现 distributed leader election，不得直接扩成多副本。
- 同一进程最多一个 active tick。收到 SIGTERM / SIGINT 后停止启动新 tick，等待正在执行的 tick 和数据库断开。
- 关闭等待有 30 秒上限；超时非零退出，不无限 hang。Compose 给出 35 秒 stop grace period，平台关闭宽限需与应用上限匹配。
- 重启从已持久化 state / cursor 继续，而不是从内存位置猜测。超时被终止时仍需靠去重避免重扫造成重复，不保证未完成 tick 已经提交。
- 日志使用安全错误格式，不输出完整 error object、原始请求头、带凭据的连接字符串或 Secret。

Production Web、Worker、环境配置、迁移和通知发送是独立动作。上传源码、构建成功或通过一次 Smoke 不构成继续部署、重启、启用 Monitor 或发通知的授权。

## 常见问题

**登录后没有数据？** 新数据库可能尚未注册链和 Monitor；先检查空状态与认证 API。Worker 未运行时不会产生新的检查时间，不能用假数据补齐。

**Monitor 已启用，但检查时间不更新？** 核对 Worker 是否运行、是否使用同一数据库、链是否启用以及 Monitor interval；再只读检查安全日志。不要先重复启动一个 Worker。

**数据库不可达？** 核对 pooled / direct 用途、连接目标、权限及网络。不要公开粘贴连接字符串，也不要自动退回其他数据库。

**ICM Pending 是否证明投递失败？** 不是。它表示配置观察范围内尚缺目标链证据；交付确认、应用执行失败与具体根因是不同事实。

**如何复现历史链上事件？** 先独立验证 Chain ID、合约 bytecode、receipt、topic、blockNumber、logIndex 和解码结果，再用小范围扫描验证命中、去重和零误报。历史截图、交易哈希和示例预期值本身不是验收证据。

**为什么 disabled Monitor 仍有历史告警？** 禁用阻止后续监控，不删除已有 Incident。历史 OPEN 或异常不能仅为了展示全绿而 ACK、恢复或隐藏。

## 安全与已知限制

- 不保存钱包、私钥或助记词，不执行资产转移、授权、升级或自动响应。
- 不提交 `.env`、`.env.local`、Production 凭据、平台 token、浏览器登录状态、`node_modules`、`.next` 或本地缓存。
- 资产金额、阈值和区块位置使用整数 / BigInt 或整数序列化字符串，不使用浮点数处理链上资产。
- 不把未经独立验证的网络、合约、ABI 或消息 topic 作为真实监控依据。
- 公共 RPC 有延迟、速率限制和可用性风险；有限窗口、重试与持久化 cursor 不是全面链上取证或最终性保证。
- 本项目是单管理员、单 Worker 副本的 MVP，不宣称已完成第三方安全审计、全链覆盖或高可用集群验收。
- 历史验收中的 OpenSSL 提示和浏览器 warning 应按记录解释，不因核心路径通过就宣称所有 warning 已消除。
- 发现凭据暴露应停止上传和外部操作，处理 staging、历史与凭据轮换；不能仅靠后续删除文件掩盖泄漏。

## 文档导航

- [前端交接契约](docs/frontend-contract.md)：共享类型、页面和 API 错误状态。
- [部署环境变量清单](docs/deployment-env.md)：Web / Worker / 迁移配置分离。
- [部署前检查清单](docs/deployment-checklist.md)：构建、容器、迁移与授权门。
- [部署计划](docs/deployment-plan.md)：架构、Worker 平台及分阶段部署记录。
- [Production Smoke / Soak](docs/production-smoke.md)：真实读回、重启、采样窗口与验收边界。
- [Release Readiness](docs/release-readiness.md)：M7A 发布产物历史验收，不代替后续 Production 记录。

## License

本仓库使用 [MIT License](LICENSE)。
