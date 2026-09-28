ALTER TABLE "monitor_state" ADD COLUMN "destinationCursorBlock" BIGINT;

CREATE TABLE "icm_messages" (
    "id" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "sourceTxHash" TEXT NOT NULL,
    "sourceLogIndex" INTEGER NOT NULL,
    "sourceBlockNumber" BIGINT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "destinationTxHash" TEXT,
    "destinationLogIndex" INTEGER,
    "destinationBlockNumber" BIGINT,
    "receivedAt" TIMESTAMP(3),
    "executionStatus" TEXT NOT NULL DEFAULT 'NOT_OBSERVED',
    "incidentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "icm_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "icm_messages_monitorId_messageId_key" ON "icm_messages"("monitorId", "messageId");
CREATE UNIQUE INDEX "icm_messages_monitorId_sourceTxHash_sourceLogIndex_key" ON "icm_messages"("monitorId", "sourceTxHash", "sourceLogIndex");
CREATE INDEX "icm_messages_monitorId_receivedAt_idx" ON "icm_messages"("monitorId", "receivedAt");
ALTER TABLE "icm_messages" ADD CONSTRAINT "icm_messages_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
