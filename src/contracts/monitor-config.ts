import { z } from "zod";

const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "必须是 EVM 地址");
const positiveInteger = z.number().int().positive();

export const rpcHealthConfigSchema = z.object({
  latencyThresholdMs: positiveInteger.default(2000),
  consecutiveFailureThreshold: z.number().int().min(1).max(10).default(3),
  expectedChainId: z.string().regex(/^\d+$/).optional(),
  rpcUrl: z.string().url().optional(),
});

export const treasuryConfigSchema = z.object({
  asset: z.object({ address: address.optional(), symbol: z.string().min(1).max(20), decimals: z.number().int().min(0).max(36) }),
  thresholdAtomic: z.string().regex(/^\d+$/, "阈值必须为最小单位整数"),
  allowlist: z.array(address).max(100).default([]),
  fromBlock: z.string().regex(/^\d+$/).optional(),
  toBlock: z.string().regex(/^\d+$/).optional(),
}).superRefine((value, ctx) => {
  if (value.fromBlock !== undefined && value.toBlock !== undefined && /^\d+$/.test(value.fromBlock) && /^\d+$/.test(value.toBlock)) {
    if (BigInt(value.fromBlock) > BigInt(value.toBlock)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "fromBlock 不能大于 toBlock", path: ["toBlock"] });
    }
  }
});

export const adminConfigSchema = z.object({
  eventKinds: z.array(z.enum(["OWNERSHIP", "ROLE", "UPGRADE"]))
    .min(1)
    .default(["OWNERSHIP", "ROLE", "UPGRADE"]),
  fromBlock: z.string().regex(/^\d+$/).optional(),
  toBlock: z.string().regex(/^\d+$/).optional(),
}).superRefine((value, ctx) => {
  if (value.fromBlock !== undefined && value.toBlock !== undefined && /^\d+$/.test(value.fromBlock) && /^\d+$/.test(value.toBlock)) {
    if (BigInt(value.fromBlock) > BigInt(value.toBlock)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "fromBlock 不能大于 toBlock", path: ["toBlock"] });
    }
  }
});

export const icmConfigSchema = z.object({
  destinationChainId: z.string().regex(/^\d+$/),
  destinationChainName: z.string().min(1).max(80).optional(),
  destinationRpcUrl: z.string().url(),
  destinationTarget: address,
  sourceEventTopic: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  destinationEventTopic: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  sourceBlockchainId: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
  destinationBlockchainId: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
  sourceFromBlock: z.string().regex(/^\d+$/).optional(),
  sourceToBlock: z.string().regex(/^\d+$/).optional(),
  destinationFromBlock: z.string().regex(/^\d+$/).optional(),
  destinationToBlock: z.string().regex(/^\d+$/).optional(),
  acceptance: z.boolean().default(false),
  baselineOnly: z.boolean().default(false),
  observationTimestampSec: z.number().int().positive().optional(),
  warningAfterSec: positiveInteger.default(180),
  criticalAfterSec: positiveInteger.default(600),
}).superRefine((value, ctx) => {
  for (const [start, end] of [[value.sourceFromBlock, value.sourceToBlock], [value.destinationFromBlock, value.destinationToBlock]]) {
    if (start !== undefined && end !== undefined && BigInt(start) > BigInt(end)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "扫描区间起点不能大于终点", path: ["toBlock"] });
  }
  if (value.observationTimestampSec !== undefined && !value.acceptance) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "历史观察时间仅可用于 acceptance 监控", path: ["observationTimestampSec"] });
  if (value.baselineOnly && !value.acceptance) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "baselineOnly 仅可用于 acceptance 监控", path: ["baselineOnly"] });
});

export const customEventConfigSchema = z.object({
  eventAbi: z.string().min(1).max(2048),
  valueField: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  thresholdAtomic: z.string().regex(/^\d+$/),
});

export const validatorHealthConfigSchema = z.object({
  healthUrl: z.string().url(),
  unhealthyAfterSec: positiveInteger.default(90),
});

export const createMonitorSchema = z.object({
  type: z.enum(["RPC_HEALTH", "TREASURY", "ADMIN", "ICM_DELIVERY", "CUSTOM_EVENT", "VALIDATOR_HEALTH"]),
  chainId: z.string().min(1),
  target: address.optional(),
  intervalSec: z.number().int().min(15).max(3600).default(30),
  config: z.record(z.unknown()),
}).superRefine((value, ctx) => {
  const configSchemas = {
    RPC_HEALTH: rpcHealthConfigSchema,
    TREASURY: treasuryConfigSchema,
    ADMIN: adminConfigSchema,
    ICM_DELIVERY: icmConfigSchema,
    CUSTOM_EVENT: customEventConfigSchema,
    VALIDATOR_HEALTH: validatorHealthConfigSchema,
  } as const;
  const result = configSchemas[value.type].safeParse(value.config);
  if (!result.success) ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.error.issues[0]?.message ?? "监控配置无效", path: ["config"] });
  if (value.type !== "RPC_HEALTH" && !value.target) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "此监控需要 target 地址", path: ["target"] });
});

export type CreateMonitorInput = z.infer<typeof createMonitorSchema>;
