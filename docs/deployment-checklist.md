# 部署前检查清单

本项目默认不启动 Worker。`compose.yaml` 的默认服务只有 Web；数据库迁移与 Worker 分别由显式 profile 启动。

## 配置与迁移

1. 复制 `.env.example` 为本机私有的 `.env`，填写 pooled `DATABASE_URL`、direct `DATABASE_URL_UNPOOLED`、`SENTINEL_ADMIN_PASSWORD` 和高熵 `SENTINEL_SESSION_SECRET`。不要提交该文件。
2. 先在隔离 Postgres 分支或本地数据库验证迁移，再运行：

   ```powershell
   docker compose --env-file .env --profile migrate run --rm migrate
   ```

3. 使用只读 SQL 或 Prisma Studio 独立确认六张核心表及 `incident_events.dedupeKey` 索引已创建。迁移命令成功本身不代表数据库已可用。

## Web 与 Worker

```powershell
# 只启动受认证保护的 Web 服务；不会读取 RPC、发送通知或创建 Demo 事件。
docker compose --env-file .env up --build web

# 仅在获得真实 RPC 与通知发送的单独授权后，显式启动 Worker。
docker compose --env-file .env --profile worker up --build worker
```

启动 Worker 前，逐项确认链 ID、RPC URL、合约地址、ABI/event topic、监控阈值和通知目标。Worker 只执行 RPC 读取；本项目没有链上写入路径。

## 上线前读回

- 登录后确认 Dashboard 是真实 API 返回，不是演示数据。
- 以受控测试数据验证 Monitor 创建、Ack 和恢复 Timeline。
- Worker 重启后确认 cursor、lease 与事件去重继续生效。
- 仅在通知凭据已获授权时，核对 Telegram/Webhook 的独立接收证据。
