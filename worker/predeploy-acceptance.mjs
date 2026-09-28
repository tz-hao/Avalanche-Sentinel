// Host-side, local-only acceptance. Never inject notification/AI credentials.
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd(), true);
const image = "avalanche-sentinel-worker:m8b";
const name = "sentinel-m8b-predeploy-local";
const secretValues = Object.entries(process.env).filter(([key, value]) => value && /DATABASE_URL|PASSWORD|SECRET|TOKEN|API_KEY|RPC_URL/.test(key)).map(([, value]) => value);
for (const key of ["DATABASE_URL", "DATABASE_URL_UNPOOLED"]) {
  try { secretValues.push(decodeURIComponent(new URL(process.env[key]).password)); } catch { /* optional URL */ }
}
const childEnv = Object.fromEntries(["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "COMSPEC", "DATABASE_URL"].filter(key => process.env[key]).map(key => [key, process.env[key]]));
let leakCount = 0;
let phase = "preflight";
function docker(args, expectedExit = 0) {
  const result = spawnSync("docker", args, { env: childEnv, encoding: "utf8", timeout: 55_000 });
  const output = (result.stdout || "") + (result.stderr || "");
  leakCount += secretValues.filter(value => value && output.includes(value)).length;
  if (result.status !== expectedExit) {
    console.log(JSON.stringify({phase, commandExit: result.status, timeout: result.error?.code === "ETIMEDOUT", safeFailureCode: output.match(/P\d{4}|ENABLED_MONITORS_BLOCKED|FUJI_CONFIG_MISSING|FUJI_CHAIN_MISMATCH|READONLY_PROBE_FAILED/)?.[0] ?? "UNCLASSIFIED"}));
    throw new Error("DOCKER_ACCEPTANCE_COMMAND_FAILED");
  }
  return (args[0] === "logs" ? output : result.stdout).trim();
}
const probe = `
const {PrismaClient}=require('@prisma/client');
const {createHash}=require('node:crypto');
const fs=require('node:fs');
const p=new PrismaClient();
let stage='NEON';
(async()=>{
  await p.$queryRaw\`SELECT 1\`;
  const enabled=await p.monitor.count({where:{enabled:true}});
  if(enabled!==0)throw Error('ENABLED_MONITORS_BLOCKED');
  const chain=await p.chain.findFirst({where:{chainId:43113n}});
  if(!chain)throw Error('FUJI_CONFIG_MISSING');
  stage='FUJI';
  const r=await fetch(chain.rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]}),signal:AbortSignal.timeout(10000)});
  const data=await r.json();
  if(!r.ok||BigInt(data.result)!==43113n)throw Error('FUJI_CHAIN_MISMATCH');
  stage='STATE_READBACK';
  const states=await p.monitorState.findMany({orderBy:{monitorId:'asc'}});
  const notifications=await p.notification.findMany({orderBy:{id:'asc'}});
  const incidents=await p.incident.count();
  const hash=x=>createHash('sha256').update(JSON.stringify(x,(_,v)=>typeof v==='bigint'?v.toString():v)).digest('hex');
  console.log(JSON.stringify({neon:'PASS',fuji:43113,enabled,incidents,stateHash:hash(states),notificationHash:hash(notifications),envLocalPresent:fs.existsSync('/app/.env.local')}));
})().catch(error=>{
  console.log('READONLY_PROBE_FAILED');
  console.log(JSON.stringify({failedStage:stage,safeCode:/^P[0-9]{4}$/.test(error.code??'')?error.code:'UNCLASSIFIED'}));
  process.exitCode=1;
}).finally(()=>p.$disconnect());`;
let created = false;
const parseProbe = (output) => JSON.parse(output.split(/\r?\n/).findLast(line => line.startsWith("{")) ?? "null");
try {
  phase = "bounded-timeout";
  const hungTick = `const {createScheduler}=require('./worker/scheduler.ts');const s=createScheduler({tick:()=>new Promise(()=>{}),disconnect:async()=>{},exit:code=>process.exit(code),log:msg=>console.log(msg),shutdownTimeoutMs:100});void s.tick();setImmediate(()=>{void s.shutdown()});`;
  const timeoutLog = docker(["run", "--rm", "--entrypoint", "node", image, "--import", "tsx", "-e", hungTick], 1);
  if (!timeoutLog.includes("Worker shutdown timeout") || timeoutLog.includes("Worker shutdown complete")) throw new Error("TIMEOUT_TERMINATION_FAILED");
  phase = "preflight";
  const before = parseProbe(docker(["run", "--rm", "-e", "DATABASE_URL", "--entrypoint", "node", image, "-e", probe]));
  if (before.envLocalPresent) throw new Error("ENV_FILE_IN_IMAGE");
  phase = "start";
  docker(["run", "-d", "--name", name, "-e", "DATABASE_URL", "-e", "SENTINEL_DISABLE_EXTERNAL_NOTIFICATIONS=1", "-e", "SENTINEL_DEMO_MODE=false", "-e", "DEMO_NOTIFICATIONS_ENABLED=false", image]);
  created = true;
  // The read-only exec probe gives the scheduler time to initialize without sleeps.
  const running = parseProbe(docker(["exec", name, "node", "-e", probe]));
  if (docker(["inspect", "--format", "{{.State.Running}}", name]) !== "true") throw new Error("WORKER_NOT_RUNNING");
  phase = "sigterm";
  docker(["stop", "--time", "35", name]);
  const firstExit = docker(["inspect", "--format", "{{.State.ExitCode}}", name]);
  phase = "restart";
  docker(["start", name]);
  const after = parseProbe(docker(["exec", name, "node", "-e", probe]));
  docker(["stop", "--time", "35", name]);
  const secondExit = docker(["inspect", "--format", "{{.State.ExitCode}}", name]);
  phase = "sigint";
  docker(["start", name]);
  const interrupted = parseProbe(docker(["exec", name, "node", "-e", probe]));
  docker(["kill", "--signal", "SIGINT", name]);
  const thirdExit = docker(["wait", name]);
  const logs = docker(["logs", name]);
  const unchanged = [running, after, interrupted].every(x => x.stateHash === before.stateHash && x.notificationHash === before.notificationHash && x.incidents === before.incidents && x.enabled === 0);
  const workerErrors = (logs.match(/Worker (?:tick failed|shutdown failed|shutdown timeout)|Monitor failed/g) || []).length;
  const clean = firstExit === "0" && secondExit === "0" && thirdExit === "0" && (logs.match(/Worker shutdown complete/g) || []).length === 3;
  const safeErrorKinds = logs.match(/Worker (?:tick failed|shutdown failed): (?:PrismaClientInitializationError|PrismaClientKnownRequestError|TypeError|RangeError|AbortError|TimeoutError|UnknownError|Error)|Worker shutdown timeout/g) || [];
  console.log(JSON.stringify({containerStart: "PASS", boundedTimeout: "PASS", neon: after.neon, fuji: after.fuji, envOnly: !after.envLocalPresent, sigterm: clean ? "PASS" : "FAIL", sigint: thirdExit === "0" ? "PASS" : "FAIL", restart: clean ? "PASS" : "FAIL", workerErrors, safeErrorKinds, exitCodes: [firstExit, secondExit, thirdExit], stateUnchanged: unchanged, monitorsEnabled: after.enabled, duplicateIncidents: after.incidents - before.incidents, secretLeakCount: leakCount}));
  if (!clean || !unchanged || leakCount || workerErrors) process.exitCode = 1;
} catch {
  console.log(`WORKER_CONTAINER_ACCEPTANCE_BLOCKED: ${phase}`);
  process.exitCode = 1;
} finally {
  if (created) {
    try { docker(["stop", "--time", "35", name]); docker(["rm", name]); } catch { console.log("LOCAL_CONTAINER_CLEANUP_REQUIRED"); process.exitCode = 1; }
  }
}
