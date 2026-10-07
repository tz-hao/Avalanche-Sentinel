# 2026-10-07 可靠性修复：GitHub 与 Production 发布记录

## 授权与状态

用户明确授权同时完成源码提交/推送，以及现有数据库迁移、现有 Web 和单副本 Worker 更新。未授权新增/启用 Monitor、通知发送、AI 请求或链上写入，本轮未执行这些动作。

应用源码提交：`3cb9d6ea5ea49e41cac1344264cc3a472d517dec`，消息 `fix: harden monitoring reliability and incident management`，已推送到 [GitHub main](https://github.com/tz-hao/Avalanche-Sentinel/tree/main)。原 `v1.0.0-production-demo` Tag 未移动；没有 force push、历史重写或新 Release。

本次新增的只读验收 helper，以及最终发布记录后续作为独立提交上传；不会因此重新部署相同业务代码。

## Git 安全检查

- 发布前检查完整 index tree 共 121 个文件，当前本地 Secret 原值/数据库密码匹配为 0。
- 凭据模式命中的 4 个既有文件均为已人工核对的模板/测试占位值：`.env.example`、`forensic-ui.test.ts`、`http.test.ts`、`scheduler.test.ts`；没有把模式命中直接忽略。
- 未提交 `.env.local`、Production 凭据、浏览器状态、node_modules 或 `.next`。
- 独立 GitHub tree API 确认 main SHA 与本地提交一致，src/worker/prisma/docs/package.json/Docker 文件完整，环境及生成目录不在树中。
- Vercel / Railway 原项目都未连接 GitHub 自动部署；本次 push 本身没有触发另一次云部署。

## 数据库迁移

使用现有本地服务端配置，在内存核对 pooled 与 direct URL 指向同一目标 host/database，且 Railway pooled 值匹配。未打印连接串、密码或环境值。

`prisma migrate status` 确认仅待应用 `20261007130000_worker_heartbeat`。`prisma migrate deploy` 通过 direct/unpooled 连接成功应用；后续独立 SQL 读回确认：

- `worker_heartbeats` 存在。
- `monitors.enabled` 数据库默认值为 false。
- 4 个迁移全部完成，没有 rolled-back migration。
- 现有 Monitor 的 enabled 与配置没有改变；未运行 migrate dev/reset，未回滚任何旧迁移。

此前本地验收已在第二个全新可丢弃 PostgreSQL 中重放最终 4 个迁移。本次未新增 Neon project/branch，未分发 direct 连接到 Web/Worker。

## Railway Worker

- 原 project：`24b757df-8bc5-4bb3-b24a-e4e6fa59ca4e`。
- 原 service：`43a560c4-f938-4093-ac02-20556520cd6a` / `sentinel-worker`。
- 原 production environment：`327a7631-722e-45af-b3d5-8c878bbb1ac4`。
- 新 deployment：`447a2a42-2e91-4348-be71-69cc0fc79fd6`，SUCCESS。
- 源码来自已扫描提交的 `git archive` 白名单快照，不含环境文件、缓存、Git metadata；未上传本地登录状态。
- 独立官方 GraphQL 读回：replicas=1；新 instance `387fdb83-5ba6-405e-a26d-893800c6eeba` RUNNING，旧 instance EXITED；未创建第二个服务/Worker，未改扩容或 overlap 配置。
- 新 runtime 日志包含 scheduler start 和初始 enabled monitors=1；5 条日志的 Secret/raw-error/credential-URL 命中均为 0。已存在的 OpenSSL 检测 warning 保留，实际 Prisma 状态与心跳写入通过。
- 旧 deployment 日志独立确认 SIGTERM 与 shutdown complete；没有额外执行官方 restart。
- 新 Worker 启动 UTC `13:01:55.673`。独立 Neon 读回新鲜 heartbeat 和 lastTickCompletedAt，证明新代码实际执行，不只依赖平台 SUCCESS。

## Vercel Web

- 原 project：`tz-haos-projects/avalanche-sentinel` / `prj_eqLpbKcnFK426qvve4PZZo00pveu`。
- 新 deployment：`dpl_HYagcSPW1etTa7QxYrr3y1JApsjF`，READY / production，commit metadata 为上述应用源码 SHA。
- 先 `--prod --skip-domain` 构建，Worker 新心跳确认后 promote 同一构建；未新建 Vercel Project，未改 Production env。
- 官方 alias API 独立确认 `avalanche-sentinel-mocha.vercel.app` 指向此次 deployment。
- 原 [Production URL](https://avalanche-sentinel-mocha.vercel.app/) 保持不变。
- 用已配置口令在内存建立短时 HttpOnly 会话，未输出/保存 Cookie：session、overview、monitors、incidents(limit=1)、指定 Treasury detail 全部 HTTP 200。
- overview.worker=RUNNING；唯一 Production RPC monitor=HEALTHY、stale=false；分页 nextCursor 存在，Treasury Evidence API 正常。没有调用 summary POST、ACK 或 Monitor 写接口。
- runtime log 窗口 UTC `13:05:00` → `13:06:38.786`，5 条实际记录、scope 全匹配、无截断，5xx=0、AI requests=0、Secret/raw-error/credential URL 命中均为 0。不是把 0 条日志当安全通过。

## 状态与副作用核对

迁移前基线 UTC `12:54:50.417`：13 Monitor，24 Incident / 45 Event / 79 Notification，累计 SENT=2。累计 SENT 是历史数据，本次发送增量才是验收范围。

UTC `13:06:13.344` 再读回：上述计数完全不变；Monitor 配置、Chain（含 RPC）、Incident、Event、Notification 五类 SHA-256 均与基线一致。

唯一启用目标保持 `cmujg0um90001dibs3bjnamtc` / Production Fuji RPC Health；其他 12 个 Monitor 未启用。目标 expectedChainId=43113、failure=0；配置/RPC hash `21024a052d67b86ce6ce96b3aa9fc1535690ea0cb816a2d35264582e4d5f9196` 不变。

cursor 从基线 `59139406` 推进到新 Worker 下 `59139637`，再到 `59139686`；未修改 cursor、清零失败数、创建/ACK/Recover Incident。heartbeat 在 `13:06:10.842` 为新鲜状态。

终点 UTC `13:09:44.422` 再次读回：cursor `59139756`，HEALTHY/failure=0，heartbeat `13:09:40.981` 新鲜，lastTickCompletedAt `13:09:41.232`。所有计数及五类配置/业务哈希依旧不变。Railway 环境终点读回确认通知/Demo 禁用，direct/admin/session/notification/AI 凭据未注入 Worker。新增 Incident/Event/Notification/SENT 增量全部为 0。

通知仍保持禁用；没有通知或 AI 凭据新增到 Worker。没有本地 Worker、Telegram/Webhook 发送、AI provider 调用、链上写入、额外迁移或故障注入。

## 观察项与剩余门禁

- 宿主机独立 Neon 读回曾短暂出现 P1001，及一次未取得错误类别的失败；受控重试后成功。没有把宿主机异常写成已证明的 Worker 故障，也未删除这些观察记录。
- Vercel 连接器查询返回 not-found，既有已登录官方 CLI 对精确原项目访问成功；未绕过权限或改用其他账户/项目。
- Vercel curl beta 将命令末尾 `--scope` 当作 curl 选项而失败；没有修改访问保护。公开 HTTPS GET 成功，最终 authenticated API 与 alias/log readback 成功。
- 初次最终页面检查时浏览器会话已过期，曾停在原 Production login；用户随后自行登录，未向助手提供口令。该门禁已按下节完成；没有用本地结果代替 Production 浏览器验收。

## 最终 Production 浏览器验收

2026-10-07 UTC `13:36` → `13:37`，在用户已登录的应用内浏览器、原 Production 域名完成只读导航：overview → monitors → incidents → Treasury `cmu8b90py0005dihkc2bi1bm9` → `#evidence`。

- Overview：Worker 显示心跳正常；唯一生产 RPC 显示 HEALTHY。历史高危事件明确与当前生产探针故障区分，未将历史事件清零。
- Monitors：已启用 1、已停用 12、启用项降级/异常均为 0。唯一目标 Chain ID 43113，HEALTHY，延迟 101ms，cursor `59140432` / failures 0。Acceptance、Admin、Treasury、ICM 均保持停用；未打开管理操作或配置表单。
- Incidents：真实 24 条记录正常显示，筛选与时间输入、事件详情入口存在；没有创建数据来验证分页，也没有提交业务写操作。
- Treasury detail / Evidence：详情与证据锚点正常；交易哈希、区块 `58482509`、logIndex 0、USDC rawAmount `20000000` / decimals 6 / normalizedAmount 20 与阈值 10 正常显示。状态 ACKNOWLEDGED 与恢复时间空值明确区分；没有 ACK、复制敏感状态或生成 AI 摘要。
- 实际浏览器 Console error 记录为 0（读取 error level，limit=100），证据区域截图视觉检查正常。工具没有提供浏览器 Network capture，本次 Network 结论仍仅依赖前述独立 authenticated API 与 Vercel runtime log readback，不冒充浏览器 Network 检查。
- 终点 UTC `13:37:23.840` 独立 Neon 只读查询：cursor `59140466`，HEALTHY，failure=0，新鲜 heartbeat `13:37:17.046`。Monitor/Incident/Event/Notification/SENT 计数仍为 `13/24/45/79/2`，全部五类哈希仍与发布前基线一致；本次新增事件、通知及 SENT 增量为 0。

本轮源码发布、数据库迁移、现有 Web/单副本 Worker 上线，以及 API、日志和真实 Production 页面/Console 验收完成。未重复迁移、部署或 restart；未启用新增 Monitor，未发送通知、调用 AI 或进行链上写入。验收记录作为纯文档提交推送，不再次部署业务代码；冻结 Demo Tag 不变。
