-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MonitorType" AS ENUM ('RPC_HEALTH', 'TREASURY', 'ADMIN', 'ICM_DELIVERY', 'CUSTOM_EVENT', 'VALIDATOR_HEALTH');
CREATE TYPE "MonitorStatus" AS ENUM ('HEALTHY', 'DEGRADED', 'DOWN', 'UNKNOWN');
CREATE TYPE "Severity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RECOVERED');
CREATE TYPE "NotificationChannel" AS ENUM ('TELEGRAM', 'WEBHOOK');

-- CreateTable
CREATE TABLE "chains" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "chainId" BIGINT NOT NULL,
  "rpcUrl" TEXT NOT NULL,
  "explorerUrl" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "chains_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "monitors" (
  "id" TEXT NOT NULL,
  "type" "MonitorType" NOT NULL,
  "chainId" TEXT NOT NULL,
  "target" TEXT,
  "configJson" JSONB NOT NULL,
  "intervalSec" INTEGER NOT NULL DEFAULT 30,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "status" "MonitorStatus" NOT NULL DEFAULT 'UNKNOWN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "monitors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "monitor_state" (
  "monitorId" TEXT NOT NULL,
  "cursorBlock" BIGINT,
  "lastCheckAt" TIMESTAMP(3),
  "lastStatus" "MonitorStatus" NOT NULL DEFAULT 'UNKNOWN',
  "latencyMs" INTEGER,
  "consecutiveFail" INTEGER NOT NULL DEFAULT 0,
  "leaseOwner" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "lastError" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "monitor_state_pkey" PRIMARY KEY ("monitorId")
);

CREATE TABLE "incidents" (
  "id" TEXT NOT NULL,
  "monitorId" TEXT NOT NULL,
  "severity" "Severity" NOT NULL,
  "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "evidenceJson" JSONB NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledgedAt" TIMESTAMP(3),
  "recoveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "incident_events" (
  "id" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "evidenceJson" JSONB NOT NULL,
  "sourceTxHash" TEXT,
  "logIndex" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "incident_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notifications" (
  "id" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "eventType" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "sentAt" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chains_chainId_key" ON "chains"("chainId");
CREATE INDEX "monitors_chainId_enabled_idx" ON "monitors"("chainId", "enabled");
CREATE INDEX "monitor_state_leaseExpiresAt_idx" ON "monitor_state"("leaseExpiresAt");
CREATE INDEX "incidents_status_severity_openedAt_idx" ON "incidents"("status", "severity", "openedAt");
CREATE INDEX "incidents_monitorId_status_idx" ON "incidents"("monitorId", "status");
CREATE INDEX "incident_events_incidentId_createdAt_idx" ON "incident_events"("incidentId", "createdAt");
CREATE UNIQUE INDEX "incident_events_incidentId_type_sourceTxHash_logIndex_key" ON "incident_events"("incidentId", "type", "sourceTxHash", "logIndex");
CREATE INDEX "notifications_status_createdAt_idx" ON "notifications"("status", "createdAt");
CREATE UNIQUE INDEX "notifications_incidentId_channel_eventType_key" ON "notifications"("incidentId", "channel", "eventType");

ALTER TABLE "monitors" ADD CONSTRAINT "monitors_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "chains"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "monitor_state" ADD CONSTRAINT "monitor_state_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
