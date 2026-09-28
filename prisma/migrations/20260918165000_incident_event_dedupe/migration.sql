-- Make evidence deduplication explicit for both log-derived and state-derived events.
ALTER TABLE "incident_events" ADD COLUMN "dedupeKey" TEXT;

UPDATE "incident_events"
SET "dedupeKey" = CASE
  WHEN "sourceTxHash" IS NOT NULL AND "logIndex" IS NOT NULL
    THEN 'tx:' || lower("sourceTxHash") || ':' || "logIndex"::text
  ELSE 'state:' || COALESCE("evidenceJson"->>'rule', "type")
END;

DELETE FROM "incident_events" duplicate
USING (
  SELECT "id", row_number() OVER (
    PARTITION BY "incidentId", "type", "dedupeKey"
    ORDER BY "createdAt", "id"
  ) AS row_number
  FROM "incident_events"
) retained
WHERE duplicate."id" = retained."id" AND retained.row_number > 1;

ALTER TABLE "incident_events" ALTER COLUMN "dedupeKey" SET NOT NULL;
DROP INDEX "incident_events_incidentId_type_sourceTxHash_logIndex_key";
CREATE UNIQUE INDEX "incident_events_incidentId_type_dedupeKey_key"
  ON "incident_events"("incidentId", "type", "dedupeKey");
