# Avalanche Sentinel

Avalanche Sentinel 是一个只读的 Avalanche 安全与运维监控 MVP：Worker 轮询监控，规则创建 Incident，Dashboard 复盘证据与恢复状态。

## 本地启动

1. 复制 `.env.example` 为 `.env.local`，只填写本地数据库与管理员会话变量；不要提交该文件。
2. `npm.cmd run prisma:generate`
3. 使用 **direct/unpooled** `DATABASE_URL_UNPOOLED` 创建或验证迁移，再使用 pooled `DATABASE_URL` 运行应用。
4. `npm.cmd run dev` 与另一个终端的 `npm.cmd run worker`。

当前项目不会自动连接 Fuji、Neon、Telegram、Webhook 或 AI 服务。只有配置相应环境变量并显式启动 Worker 后，才会进行只读 RPC/通知请求。

容器化 Web、显式数据库迁移与 Worker 启动步骤见 [部署前检查清单](docs/deployment-checklist.md)。默认 `docker compose up` 不会启动 Worker。

## 安全边界

- 不保存钱包、私钥、助记词或用户资产授权。
- 所有 API 均由单管理员 HttpOnly 会话保护。
- 资产阈值使用原子单位整数字符串；不会使用浮点数。
- ICM pending 只报告观察窗口内目标链接收证据缺失；交付与应用执行状态独立，不断言具体故障根因。
- `SENTINEL_DEMO_MODE=true` 才会暴露合成 Demo Incident；默认不触发外部通知。
