// Local acceptance helper. Raw platform logs/variables stay in memory only.
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd(), true);
const project = "24b757df-8bc5-4bb3-b24a-e4e6fa59ca4e";
const service = "43a560c4-f938-4093-ac02-20556520cd6a";
const environment = "327a7631-722e-45af-b3d5-8c878bbb1ac4";
const deployment = process.argv[3] ?? "46a00bce-3b86-4d26-beaa-3d38b631c823";
const selectors = ["--project", project, "--service", service, "--environment", environment];
const env = Object.fromEntries(["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "COMSPEC"].filter(key => process.env[key]).map(key => [key, process.env[key]]));
env.RAILWAY_NO_AUTO_UPDATE = "1";
function railway(args) {
  const result = spawnSync(process.execPath, ["C:/Users/71546/AppData/Roaming/npm/node_modules/@railway/cli/bin/railway.js", ...args], { env, encoding: "utf8", timeout: 45_000 });
  if (result.status !== 0) throw new Error("RAILWAY_READBACK_FAILED");
  return result.stdout;
}
try {
  const mode = process.argv[2];
  if (mode === "env") {
    const vars = JSON.parse(railway(["variable", "list", "--json", ...selectors]));
    const state = key => vars[key] ? "SET" : "MISSING";
    console.log(JSON.stringify({ databaseUrl: state("DATABASE_URL"), samePooledValue: Boolean(vars.DATABASE_URL) && vars.DATABASE_URL === process.env.DATABASE_URL,
      unpooled: state("DATABASE_URL_UNPOOLED"),
      prohibitedConfigured: ["SENTINEL_ADMIN_PASSWORD", "SENTINEL_SESSION_SECRET", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "WEBHOOK_URL", "WEBHOOK_SECRET", "AI_SUMMARY_API_KEY"].filter(key => vars[key]),
      notificationsDisabled: vars.SENTINEL_DISABLE_EXTERNAL_NOTIFICATIONS === "1",
      demoDisabled: vars.SENTINEL_DEMO_MODE === "false" && vars.DEMO_NOTIFICATIONS_ENABLED === "false" }));
  } else if (mode === "status") {
    const data = JSON.parse(railway(["deployment", "list", "--json", "--limit", "5", ...selectors]));
    console.log(JSON.stringify(data.map(item => ({ id: item.id, status: item.status, createdAt: item.createdAt }))));
  } else if (mode === "build" || mode === "logs") {
    const raw = railway(["logs", deployment, ...(mode === "build" ? ["--build"] : ["--deployment"]), "--lines", "500", "--json", ...selectors]);
    const records = raw.split(/\r?\n/).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
    const messages = records.map(item => item.message ?? "").join("\n");
    const secrets = Object.entries(process.env).filter(([key, value]) => value && /DATABASE_URL|PASSWORD|SECRET|TOKEN|API_KEY|RPC_URL/.test(key)).map(([, value]) => value);
    for (const key of ["DATABASE_URL", "DATABASE_URL_UNPOOLED"]) { try { secrets.push(decodeURIComponent(new URL(process.env[key]).password)); } catch { /* optional */ } }
    console.log(JSON.stringify({ mode, deployment, records: records.length, firstTimestamp: records[0]?.timestamp, lastTimestamp: records.at(-1)?.timestamp,
      secretLeakCount: secrets.filter(value => value && raw.includes(value)).length,
      credentialURLExposure: (messages.match(/(?:postgres(?:ql)?|https?):\/\/[^\s"<>]*:[^\s"<>]*@/gi) || []).length,
      rawErrorObjectExposure: (messages.match(/(?:error|Error):\s*\{|clientVersion\s*:|\bheaders\s*:\s*\{|^\s+at\s+/gm) || []).length,
      schedulerStarts: (messages.match(/Worker scheduler starting/g) || []).length,
      databaseReads: (messages.match(/Worker initial database read complete; enabled monitors=0/g) || []).length,
      initialEnabledCounts: [...messages.matchAll(/Worker initial database read complete; enabled monitors=(\d+)/g)].map(match => Number(match[1])),
      lifecycle: records.filter(item => ["Worker scheduler starting", "Worker SIGTERM received", "Worker shutdown complete"].includes(item.message)).map(item => ({ timestamp: item.timestamp, event: item.message })),
      sigterm: (messages.match(/Worker SIGTERM received/g) || []).length,
      shutdownComplete: (messages.match(/Worker shutdown complete/g) || []).length,
      workerErrors: (messages.match(/Worker (?:tick failed|shutdown failed|shutdown timeout)|Monitor failed/g) || []).length,
      dockerfileWorkerMention: messages.includes("Dockerfile.worker"), prismaGenerate: messages.includes("prisma:generate"), webBuild: messages.includes("next build"),
      npmErrorCodes: [...new Set(messages.match(/npm (?:ERR!|error) code [A-Z0-9_]+/g) || [])],
      knownOpenSSLWarning: messages.includes("failed to detect the libssl") }));
  } else if (mode === "db") {
    const { PrismaClient } = require("@prisma/client");
    const db = new PrismaClient();
    try {
      await db.$queryRaw`SELECT 1`;
      const monitors = await db.monitor.findMany({ orderBy: { id: "asc" } });
      console.log(JSON.stringify({ enabled: monitors.filter(item => item.enabled).length, incidents: await db.incident.count(), events: await db.incidentEvent.count(), notifications: await db.notification.count(), monitors: monitors.length,
        monitorHash: createHash("sha256").update(JSON.stringify(monitors, (_, value) => typeof value === "bigint" ? value.toString() : value)).digest("hex") }));
    } finally { await db.$disconnect(); }
  } else { throw new Error("UNKNOWN_READBACK_MODE"); }
} catch {
  console.log("SAFE_READBACK_BLOCKED");
  process.exitCode = 1;
}
