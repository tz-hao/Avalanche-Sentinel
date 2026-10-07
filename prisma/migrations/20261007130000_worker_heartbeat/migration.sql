CREATE TABLE "worker_heartbeats" (
    "workerId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastHeartbeatAt" TIMESTAMP(3) NOT NULL,
    "lastTickCompletedAt" TIMESTAMP(3),
    CONSTRAINT "worker_heartbeats_pkey" PRIMARY KEY ("workerId")
);
CREATE INDEX "worker_heartbeats_lastHeartbeatAt_idx" ON "worker_heartbeats"("lastHeartbeatAt");
ALTER TABLE "monitors" ALTER COLUMN "enabled" SET DEFAULT false;
