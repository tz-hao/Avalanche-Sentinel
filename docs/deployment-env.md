# Production environment matrix（仅变量名，不含值）

所有 Secret 均通过对应平台 Secret/Environment Variables 注入。Vercel 只配置 Production 所需 Web 变量；Worker 平台单独配置 Worker 变量；Migration Job 使用独立、短时授权上下文。不要放入源码、README、Docker image、浏览器 bundle、日志或 `NEXT_PUBLIC_*`。[Vercel Environment Variables](https://vercel.com/docs/environment-variables)。

| 分类 | 变量 | 作用域 | 用途/约束 |
| --- | --- | --- | --- |
| WEB REQUIRED | `DATABASE_URL` | Web / Worker / Migration | Neon **pooled** 应用连接；三处可各自注入同一目标 branch 的凭据。 |
| WEB REQUIRED | `SENTINEL_ADMIN_PASSWORD` | Web only | 正式单管理员口令，仅服务端校验；不可复用临时验收口令。 |
| WEB REQUIRED | `SENTINEL_SESSION_SECRET` | Web only | 会话签名密钥，至少 32 字符、高熵；轮换会使旧会话失效。 |
| WORKER REQUIRED | `DATABASE_URL` | Worker | pooled 查询；不要给 Worker direct 迁移连接。 |
| WORKER REQUIRED | `SENTINEL_DISABLE_EXTERNAL_NOTIFICATIONS` | Worker | 初始部署设 `1`，代码会跳过外发并记录 `SKIPPED`；解除需单独目标/发送授权。 |
| MIGRATION REQUIRED | `DATABASE_URL` | Migration only | Prisma datasource 的 pooled `url` 配置项，和 direct URL 指向同一目标 branch。 |
| MIGRATION REQUIRED | `DATABASE_URL_UNPOOLED` | Migration only | Prisma `directUrl`；仅迁移/需 direct 的运维操作，绝不放入高并发 Web/Worker runtime。 |
| OPTIONAL | `WORKER_ID` | Worker | 单实例标识；未配时按 PID 自动生成。`WORKER_REPLICAS=1` 是平台副本数要求，非应用变量。 |
| OPTIONAL | `NODE_ENV` | Web / Worker | Web 由 Vercel Production 设置；Worker 镜像已设 `production`。不要以 Development 模式运行正式服务。 |
| OPTIONAL | `SENTINEL_DEMO_MODE` | Web / Worker | 初始保持 `false`；Web 的 Demo API 仅显式启用时可用。 |
| OPTIONAL | `DEMO_NOTIFICATIONS_ENABLED` | Web / Worker | 初始保持 `false`；仅受控 Demo 使用。 |
| OPTIONAL—初始禁用 | `SENTINEL_WEBHOOK_URL`、`SENTINEL_WEBHOOK_SECRET` | Worker | 不配置；真实外发须先验证唯一目标并另获授权。 |
| DEFERRED | `TELEGRAM_BOT_TOKEN`、`TELEGRAM_CHAT_ID` | Worker | 不配置、不发送。 |
| DEFERRED | `AI_SUMMARY_ENDPOINT`、`AI_SUMMARY_API_KEY`、`AI_SUMMARY_MODEL` | Web | 不配置；只读摘要提供方验收另行进行，不参与 Incident 定级。 |

`FUJI_RPC_URL`、`ADMIN_PASSWORD`、`SESSION_SECRET` **不是当前代码读取的变量名**。Fuji RPC URL 保存在 `chains.rpcUrl`（以及部分 Monitor 配置的 `rpcUrl` 覆盖），属于数据库配置，不是公开前端变量；启用前核对 chainId **43113** 和目标。应用没有钱包或链上写入凭据。`SENTINEL_DISABLE_EXTERNAL_NOTIFICATIONS=1` 是额外保险；即使未配置渠道凭据，也不要把旧生产通知目标意外注入 Worker。
