# 2026-10-07 本地可靠性修复

本次修改基于已冻结 Demo 的后续工作树，未提交 Git、未部署或修改 Production。AI 服务已由用户确认恢复；本轮没有真实模型调用。

## 行为变化

- Monitor 检查超过 `max(60 秒, intervalSec × 3)` 视为过期；没有检查也属于未知。过期的 HEALTHY 不再展示为当前健康，已有 DOWN/DEGRADED 不被抹去。
- Worker 每 5 秒更新独立 `worker_heartbeats`；超过 30 秒显示心跳过期，没有记录显示未知。心跳与单次 tick 完成时间分别记录；总体 HEALTHY 要求监控检查新鲜且 Worker 心跳正常。心跳不代表多副本协调，副本数仍固定 1。
- 总览与监控页每 15 秒刷新真实 API。扫描失败保存安全错误类、失败数和 DEGRADED，不提前推进 cursor、不人为恢复已有 Incident；成功后失败数清零。
- Admin 受支持 ABI 严格解码，证据保存原始 topics/data、eventName、decodedArgs，以及 owner/role/implementation 等事实。格式不符合 ABI 时拒绝，不把未知事件当作已解码事实。历史证据不改写。
- 新监控默认停用；显式 API enabled=true 保持可用。只允许编辑停用、无有效 lease 的配置；类型与链不能改变。保存保留 cursor/证据并清除旧检查状态；启用后重新巡检。RPC 等私密端点编辑留空时保留原值，不预填暴露凭据。
- 事件支持 from/to（含时区的 ISO 时间）、q、severity/status、limit 和 keyset cursor；按 openedAt/id 稳定排序。搜索发生在数据库分页之前。时间范围与 cursor 不合法返回 400。
- Telegram 与 Webhook 请求都有 10 秒超时，通知批次有 15 秒预算。投递与巡检独立调度、各自最多一个活跃任务；停机停止新任务，等待中的任务仍受统一 30 秒关闭期限约束。通知入队幂等语义不变，不宣称 Telegram exactly-once。
- AI 正常摘要、Evidence 校验和模型配置保持不变；402/429/401/403 返回安全的额度/限流/认证错误码与中文提示，不暴露原始响应。已有超时分支保留。

## 数据库与上线顺序

新增迁移 `20261007130000_worker_heartbeat`，创建心跳表并将新 Monitor 的数据库默认值设为 false。不会改动已有 Monitor enabled 值或 Incident。

上线需要单独授权，并按以下顺序进行：先用 direct/unpooled 连接应用迁移，再更新现有单副本 Worker 与 Web；旧 Worker 不会写新心跳，新 Web 将如实展示 UNKNOWN，不能跳过迁移直接上线。此次仅在可丢弃的 localhost PostgreSQL 中验证迁移，未连接 Neon。

## 验证范围

离线单元与组件测试覆盖过期判定、心跳缺失/过期、总体健康判定、扫描错误状态与 cursor 保留、Admin ABI、分页同时间排序与过滤、停用后编辑、通知超时和并行调度，以及 AI 安全错误映射。

浏览器使用隔离本地数据库的明确标记合成夹具，不代表 Fuji/Neon/Production 的真实状态。没有启动本地 Worker、真实 RPC、通知、AI 或链上操作。验收完成后关闭测试 Web 和可丢弃数据库；Production 的运行基线保持原样。

## 最终本地验收结果

2026-10-07 最终代码验收：

| 检查 | 结果 |
| --- | --- |
| Vitest | 25 个测试文件、117 个测试全部通过 |
| ESLint | 退出码 0，无 error/warning |
| TypeScript | `tsc --noEmit` 通过 |
| Next production build | Next.js 16.3.5 构建通过 |
| Prisma Generate / Validate | 通过 |
| 迁移重放 | 在第二个全新 localhost PostgreSQL 数据库中，全部 4 个迁移通过 |
| 迁移独立 SQL 读回 | `worker_heartbeats` 存在，`monitors.enabled` 默认值为 false |
| Diff 空白检查 | `git diff --check` 通过 |

本地浏览器使用生产构建连接隔离夹具库，验证以下真实页面行为：

- 登录后总览显示“尚无 Worker 心跳记录”，不伪造 RUNNING；数据库中已过期的 HEALTHY 探针显示 UNKNOWN。
- 监控页读回持久化 cursor `123`、失败数 `0` 和过期提示；停用 Admin 监控可编辑，保存后仍停用，类型与链不可改。
- 53 条合成历史记录第一页返回 50 条、第二页返回 3 条。搜索旧事件能命中第二页记录，证明不是当前页内过滤。
- 时间表单通过实际键盘输入提交，URL 保存 ISO UTC 起止范围；刷新后本地时间值与匹配事件保留。新增组件测试覆盖输入保留与筛选时重置 cursor。
- 375px 检查监控页/新建弹窗与事件页，768px 检查总览/事件页，1440px 检查事件页；检查页面均无 document 横向溢出。
- 当前 QA Tab 捕获的 Console error 数为 0。未声称检查工具未提供的 Network 日志，也未执行 ACK、启用或 AI 请求。

临时 Web 已关闭；唯一可丢弃测试容器停止后自动移除，其中的合成 QA 数据不保留。未进行 Git 提交/推送、远程发布、Production 迁移、Neon/Fuji 验收、Worker 真实运行或通知发送。本地 PASS 不代表新增版本已在 Production 验收。
