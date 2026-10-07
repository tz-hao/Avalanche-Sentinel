"use client";

import React, { useState } from "react";
import type { ChainRecord, MonitorRecord, MonitorType } from "@/contracts/domain";
import type { CreateMonitorInput } from "@/contracts/monitor-config";
import { sentinelApi, SentinelApiError } from "@/lib/sentinel-api";

interface CreateMonitorModalProps {
  chains: ChainRecord[];
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  editingMonitor?: MonitorRecord;
}

const MONITOR_TYPE_LABELS: Record<MonitorType, { name: string; desc: string }> = {
  RPC_HEALTH: {
    name: "RPC 节点健康监控",
    desc: "持续探测 RPC 响应延迟与连续失败次数",
  },
  TREASURY: {
    name: "金库大额异动监控",
    desc: "监听金库资产转账是否超出原子阈值或流向未加白地址",
  },
  ADMIN: {
    name: "特权与合约升级监控",
    desc: "监听合约所有权变更、管理员角色授予及逻辑合约升级",
  },
  ICM_DELIVERY: {
    name: "ICM 跨链消息交付监控",
    desc: "跨链消息发出后在目标链的接收与延迟状态追踪",
  },
  CUSTOM_EVENT: {
    name: "自定义事件阈值监控",
    desc: "解析指定合约事件 ABI，对数值字段做阈值监控",
  },
  VALIDATOR_HEALTH: {
    name: "验证节点健康监控",
    desc: "周期性探测 Avalanche 验证节点健康探测接口",
  },
};

export function CreateMonitorModal({
  chains,
  isOpen,
  onClose,
  onCreated,
  editingMonitor,
}: CreateMonitorModalProps) {
  const initial = editingMonitor?.config ?? {};
  const asset = initial.asset as { symbol?: string; decimals?: number; address?: string } | undefined;
  const [name, setName] = useState(String(initial.name ?? ""));
  const [type, setType] = useState<MonitorType>(editingMonitor?.type ?? "RPC_HEALTH");
  const [chainId, setChainId] = useState<string>(editingMonitor?.chainId ?? chains[0]?.id ?? "");
  const [target, setTarget] = useState<string>(editingMonitor?.target ?? "");
  const [intervalSec, setIntervalSec] = useState<number>(editingMonitor?.intervalSec ?? 30);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form states per type
  // RPC_HEALTH
  const [latencyThresholdMs, setLatencyThresholdMs] = useState<number>(Number(initial.latencyThresholdMs ?? 2000));
  const [consecutiveFailureThreshold, setConsecutiveFailureThreshold] = useState<number>(Number(initial.consecutiveFailureThreshold ?? 3));

  // TREASURY
  const [treasurySymbol, setTreasurySymbol] = useState<string>(asset?.symbol ?? "USDC");
  const [treasuryDecimals, setTreasuryDecimals] = useState<number>(asset?.decimals ?? 6);
  const [treasuryAssetAddress, setTreasuryAssetAddress] = useState<string>(asset?.address ?? "");
  const [treasuryThresholdAtomic, setTreasuryThresholdAtomic] = useState<string>(String(initial.thresholdAtomic ?? "1000000000"));
  const [treasuryAllowlist, setTreasuryAllowlist] = useState<string>(Array.isArray(initial.allowlist) ? initial.allowlist.join("\n") : "");

  // ADMIN
  const eventKinds = Array.isArray(initial.eventKinds) ? initial.eventKinds : ["OWNERSHIP", "ROLE", "UPGRADE"];
  const [adminOwnership, setAdminOwnership] = useState<boolean>(eventKinds.includes("OWNERSHIP"));
  const [adminRole, setAdminRole] = useState<boolean>(eventKinds.includes("ROLE"));
  const [adminUpgrade, setAdminUpgrade] = useState<boolean>(eventKinds.includes("UPGRADE"));

  // ICM_DELIVERY
  const [icmDestChainId, setIcmDestChainId] = useState<string>(String(initial.destinationChainId ?? ""));
  const [icmDestRpcUrl, setIcmDestRpcUrl] = useState<string>("");
  const [icmDestTarget, setIcmDestTarget] = useState<string>(String(initial.destinationTarget ?? ""));
  const [icmSourceBlockchainId, setIcmSourceBlockchainId] = useState<string>(String(initial.sourceBlockchainId ?? ""));
  const [icmDestBlockchainId, setIcmDestBlockchainId] = useState<string>(String(initial.destinationBlockchainId ?? ""));
  const [icmWarningSec, setIcmWarningSec] = useState<number>(Number(initial.warningAfterSec ?? 180));
  const [icmCriticalSec, setIcmCriticalSec] = useState<number>(Number(initial.criticalAfterSec ?? 600));

  // CUSTOM_EVENT
  const [customEventAbi, setCustomEventAbi] = useState<string>(
    String(initial.eventAbi ?? "event Transfer(address indexed from, address indexed to, uint256 value)")
  );
  const [customValueField, setCustomValueField] = useState<string>(String(initial.valueField ?? "value"));
  const [customThresholdAtomic, setCustomThresholdAtomic] = useState<string>(String(initial.thresholdAtomic ?? "1000000000000000000"));

  // VALIDATOR_HEALTH
  const [valHealthUrl, setValHealthUrl] = useState<string>(editingMonitor ? "" : "http://127.0.0.1:9650/ext/health");
  const [valUnhealthySec, setValUnhealthySec] = useState<number>(Number(initial.unhealthyAfterSec ?? 90));

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);

    try {
      let config: Record<string, unknown> = {};

      if (type === "RPC_HEALTH") {
        config = {
          latencyThresholdMs: Number(latencyThresholdMs),
          consecutiveFailureThreshold: Number(consecutiveFailureThreshold),
        };
      } else if (type === "TREASURY") {
        const allowlistAddresses = treasuryAllowlist
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean);

        config = {
          asset: {
            symbol: treasurySymbol.trim(),
            decimals: Number(treasuryDecimals),
            ...(treasuryAssetAddress.trim() ? { address: treasuryAssetAddress.trim() } : {}),
          },
          thresholdAtomic: treasuryThresholdAtomic.trim(),
          allowlist: allowlistAddresses,
        };
      } else if (type === "ADMIN") {
        const eventKinds: Array<"OWNERSHIP" | "ROLE" | "UPGRADE"> = [];
        if (adminOwnership) eventKinds.push("OWNERSHIP");
        if (adminRole) eventKinds.push("ROLE");
        if (adminUpgrade) eventKinds.push("UPGRADE");

        if (eventKinds.length === 0) {
          throw new Error("请至少选择一种特权事件类型 (OWNERSHIP / ROLE / UPGRADE)");
        }
        config = { eventKinds };
      } else if (type === "ICM_DELIVERY") {
        config = {
          destinationChainId: icmDestChainId.trim(),
          destinationRpcUrl: icmDestRpcUrl.trim() || initial.destinationRpcUrl,
          destinationTarget: icmDestTarget.trim(),
          sourceEventTopic: "0x2a211ad4a59ab9d003852404f9c57c690704ee755f3c79d2c2812ad32da99df8",
          destinationEventTopic: "0x292ee90bbaf70b5d4936025e09d56ba08f3e421156b6a568cf3c2840d9343e34",
          ...(icmSourceBlockchainId.trim() ? { sourceBlockchainId: icmSourceBlockchainId.trim() } : {}),
          ...(icmDestBlockchainId.trim() ? { destinationBlockchainId: icmDestBlockchainId.trim() } : {}),
          warningAfterSec: Number(icmWarningSec),
          criticalAfterSec: Number(icmCriticalSec),
        };
      } else if (type === "CUSTOM_EVENT") {
        config = {
          eventAbi: customEventAbi.trim(),
          valueField: customValueField.trim(),
          thresholdAtomic: customThresholdAtomic.trim(),
        };
      } else if (type === "VALIDATOR_HEALTH") {
        config = {
          healthUrl: valHealthUrl.trim() || initial.healthUrl,
          unhealthyAfterSec: Number(valUnhealthySec),
        };
      }

      const input: CreateMonitorInput = {
        type,
        chainId: chainId || chains[0]?.id || "",
        ...(target.trim() ? { target: target.trim() } : {}),
        intervalSec: Number(intervalSec),
        config: { ...initial, ...config, name: name.trim() },
        enabled: false,
      };

      if (editingMonitor) await sentinelApi.updateMonitor(editingMonitor.id, { target: input.target, config: input.config, intervalSec: input.intervalSec });
      else await sentinelApi.createMonitor(input);
      onCreated();
      onClose();
    } catch (err) {
      if (err instanceof SentinelApiError) {
        setErrorMessage(err.message);
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("新建监控失败，请检查参数后重试。");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const selectedTypeMeta = MONITOR_TYPE_LABELS[type];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-monitor-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs overflow-y-auto"
    >
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl my-8 p-6 text-slate-100">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
          <div>
            <h2 id="create-monitor-title" className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <span className="text-cyan-400 font-mono">+</span>
              <span>{editingMonitor ? "编辑监控配置" : "新建监控项"}</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              支持 RPC 健康、金库流出、特权异动、ICM 跨链及扩展验证类型
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 p-1.5 rounded-lg hover:bg-slate-800"
            aria-label="关闭对话框"
          >
            ✕
          </button>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="mb-6 p-3 rounded bg-rose-950/80 border border-rose-700 text-rose-200 text-xs font-mono"
          >
            [错误] {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <p className="muted">{editingMonitor ? "保存后保持停用，原有证据与扫描游标保留。" : "新监控默认停用，确认配置后再人工启用。"}</p>
          <label className="block">监控名称<input className="search-input" value={name} maxLength={80} onChange={e => setName(e.target.value)} /></label>
          {/* Monitor Type Selection */}
          <div>
            <label htmlFor="monitor-type-select" className="block text-xs font-semibold text-slate-300 mb-1.5">
              监控类型 (Type) *
            </label>
            <select
              id="monitor-type-select"
              disabled={!!editingMonitor}
              value={type}
              onChange={(e) => setType(e.target.value as MonitorType)}
              className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:ring-2 focus:ring-cyan-500 focus:border-transparent font-medium"
            >
              {(Object.keys(MONITOR_TYPE_LABELS) as MonitorType[]).map((t) => (
                <option key={t} value={t}>
                  {t} - {MONITOR_TYPE_LABELS[t].name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">{selectedTypeMeta.desc}</p>
          </div>

          {/* Target Chain & Interval */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="monitor-chain-select" className="block text-xs font-semibold text-slate-300 mb-1.5">
                所属区块链 (Chain) *
              </label>
              <select
                id="monitor-chain-select"
                disabled={!!editingMonitor}
                value={chainId || chains[0]?.id || ""}
                onChange={(e) => setChainId(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:ring-2 focus:ring-cyan-500 font-medium"
              >
                {chains.map((chain) => (
                  <option key={chain.id} value={chain.id}>
                    {chain.name} (ChainID: {chain.chainId})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="monitor-interval" className="block text-xs font-semibold text-slate-300 mb-1.5">
                巡检周期 (秒, 15~3600) *
              </label>
              <input
                id="monitor-interval"
                type="number"
                min={15}
                max={3600}
                value={intervalSec}
                onChange={(e) => setIntervalSec(Number(e.target.value))}
                required
                className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 font-mono focus:ring-2 focus:ring-cyan-500"
              />
            </div>
          </div>

          {/* Target Address (Conditional: Optional for RPC_HEALTH, Required for others) */}
          <div>
            <label htmlFor="monitor-target" className="block text-xs font-semibold text-slate-300 mb-1.5">
              目标合约 / 节点地址 (Target Address) {type === "RPC_HEALTH" ? "(可选)" : "*"}
            </label>
            <input
              id="monitor-target"
              type="text"
              placeholder="0x..."
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              required={type !== "RPC_HEALTH"}
              pattern="^0x[a-fA-F0-9]{40}$"
              title="必须是合法的 42 位 EVM 十六进制地址 (以 0x 开头)"
              className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm font-mono text-slate-100 focus:ring-2 focus:ring-cyan-500"
            />
            {type !== "RPC_HEALTH" && (
              <span className="text-[11px] text-slate-400 mt-1 block">
                必须为 0x 开头的 40 位十六进制 EVM 合约地址
              </span>
            )}
          </div>

          {/* Dynamic Configuration per Monitor Type */}
          <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-4">
            <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
              {type} 详细规则配置
            </h3>

            {/* RPC_HEALTH */}
            {type === "RPC_HEALTH" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="rpc-latency" className="block text-xs text-slate-400 mb-1">
                    延迟阈值 (毫秒)
                  </label>
                  <input
                    id="rpc-latency"
                    type="number"
                    min={100}
                    value={latencyThresholdMs}
                    onChange={(e) => setLatencyThresholdMs(Number(e.target.value))}
                    required
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-slate-200"
                  />
                </div>
                <div>
                  <label htmlFor="rpc-failure" className="block text-xs text-slate-400 mb-1">
                    连续失败报警阈值 (次, 1~10)
                  </label>
                  <input
                    id="rpc-failure"
                    type="number"
                    min={1}
                    max={10}
                    value={consecutiveFailureThreshold}
                    onChange={(e) => setConsecutiveFailureThreshold(Number(e.target.value))}
                    required
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-slate-200"
                  />
                </div>
              </div>
            )}

            {/* TREASURY */}
            {type === "TREASURY" && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="treasury-symbol" className="block text-xs text-slate-400 mb-1">
                      资产代币符号 *
                    </label>
                    <input
                      id="treasury-symbol"
                      type="text"
                      value={treasurySymbol}
                      onChange={(e) => setTreasurySymbol(e.target.value)}
                      required
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-slate-200"
                    />
                  </div>
                  <div>
                    <label htmlFor="treasury-decimals" className="block text-xs text-slate-400 mb-1">
                      精度 (Decimals) *
                    </label>
                    <input
                      id="treasury-decimals"
                      type="number"
                      min={0}
                      max={36}
                      value={treasuryDecimals}
                      onChange={(e) => setTreasuryDecimals(Number(e.target.value))}
                      required
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-slate-200"
                    />
                  </div>
                  <div>
                    <label htmlFor="treasury-asset-addr" className="block text-xs text-slate-400 mb-1">
                      代币合约 (原生币可留空)
                    </label>
                    <input
                      id="treasury-asset-addr"
                      type="text"
                      placeholder="0x..."
                      value={treasuryAssetAddress}
                      onChange={(e) => setTreasuryAssetAddress(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-slate-200"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="treasury-threshold" className="block text-xs text-slate-400 mb-1">
                    告警阈值 (原子最小单位整数, 如 1000000) *
                  </label>
                  <input
                    id="treasury-threshold"
                    type="text"
                    pattern="^\d+$"
                    value={treasuryThresholdAtomic}
                    onChange={(e) => setTreasuryThresholdAtomic(e.target.value)}
                    required
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-slate-200"
                  />
                </div>

                <div>
                  <label htmlFor="treasury-allowlist" className="block text-xs text-slate-400 mb-1">
                    授权白名单地址 (每行或逗号分隔)
                  </label>
                  <textarea
                    id="treasury-allowlist"
                    rows={2}
                    placeholder="0x1111..., 0x2222..."
                    value={treasuryAllowlist}
                    onChange={(e) => setTreasuryAllowlist(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-slate-200"
                  />
                </div>
              </div>
            )}

            {/* ADMIN */}
            {type === "ADMIN" && (
              <div className="space-y-2">
                <span className="block text-xs text-slate-400 mb-2">
                  监听特权事件种类 (至少勾选一项):
                </span>
                <div className="flex flex-wrap gap-4 text-xs font-mono">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={adminOwnership}
                      onChange={(e) => setAdminOwnership(e.target.checked)}
                      className="rounded border-slate-700 text-cyan-600 focus:ring-cyan-500"
                    />
                    <span>OWNERSHIP (所有权移交)</span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={adminRole}
                      onChange={(e) => setAdminRole(e.target.checked)}
                      className="rounded border-slate-700 text-cyan-600 focus:ring-cyan-500"
                    />
                    <span>ROLE (角色权限分配)</span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={adminUpgrade}
                      onChange={(e) => setAdminUpgrade(e.target.checked)}
                      className="rounded border-slate-700 text-cyan-600 focus:ring-cyan-500"
                    />
                    <span>UPGRADE (逻辑合约升级)</span>
                  </label>
                </div>
              </div>
            )}

            {/* ICM_DELIVERY */}
            {type === "ICM_DELIVERY" && (
              <div className="space-y-3">
                <p className="text-xs text-slate-400">仅支持 Teleporter 已验证的 SendCrossChainMessage / ReceiveCrossChainMessage 事件；通过 messageID 关联，消息执行结果独立显示。</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="icm-dest-chain" className="block text-xs text-slate-400 mb-1">
                      目标链 ChainID (数字) *
                    </label>
                    <input
                      id="icm-dest-chain"
                      type="text"
                      pattern="^\d+$"
                      value={icmDestChainId}
                      onChange={(e) => setIcmDestChainId(e.target.value)}
                      required
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-slate-200"
                    />
                  </div>
                  <div>
                    <label htmlFor="icm-dest-target" className="block text-xs text-slate-400 mb-1">
                      目标链接收合约 (0x...) *
                    </label>
                    <input
                      id="icm-dest-target"
                      type="text"
                      pattern="^0x[a-fA-F0-9]{40}$"
                      value={icmDestTarget}
                      onChange={(e) => setIcmDestTarget(e.target.value)}
                      required
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-slate-200"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="icm-dest-rpc" className="block text-xs text-slate-400 mb-1">
                    目标链 RPC URL *
                  </label>
                  <input
                    id="icm-dest-rpc"
                    type={editingMonitor ? "password" : "url"}
                    placeholder={editingMonitor ? "留空保留现有 RPC" : ""}
                    value={icmDestRpcUrl}
                    onChange={(e) => setIcmDestRpcUrl(e.target.value)}
                    required={!editingMonitor}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-slate-200"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="icm-src-topic" className="block text-xs text-slate-400 mb-1">
                      源链 Blockchain ID (可选，0x + 64位十六进制)
                    </label>
                    <input
                      id="icm-src-topic"
                      type="text"
                      pattern="^0x[a-fA-F0-9]{64}$"
                      value={icmSourceBlockchainId}
                      onChange={(e) => setIcmSourceBlockchainId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-slate-200"
                    />
                  </div>
                  <div>
                    <label htmlFor="icm-dst-topic" className="block text-xs text-slate-400 mb-1">
                      目标链 Blockchain ID (可选，0x + 64位十六进制)
                    </label>
                    <input
                      id="icm-dst-topic"
                      type="text"
                      pattern="^0x[a-fA-F0-9]{64}$"
                      value={icmDestBlockchainId}
                      onChange={(e) => setIcmDestBlockchainId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-slate-200"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="icm-warn-sec" className="block text-xs text-slate-400 mb-1">
                      警告超时 (秒)
                    </label>
                    <input
                      id="icm-warn-sec"
                      type="number"
                      min={1}
                      value={icmWarningSec}
                      onChange={(e) => setIcmWarningSec(Number(e.target.value))}
                      required
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-slate-200"
                    />
                  </div>
                  <div>
                    <label htmlFor="icm-crit-sec" className="block text-xs text-slate-400 mb-1">
                      高危超时 (秒)
                    </label>
                    <input
                      id="icm-crit-sec"
                      type="number"
                      min={1}
                      value={icmCriticalSec}
                      onChange={(e) => setIcmCriticalSec(Number(e.target.value))}
                      required
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-slate-200"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* CUSTOM_EVENT */}
            {type === "CUSTOM_EVENT" && (
              <div className="space-y-3">
                <div>
                  <label htmlFor="custom-abi" className="block text-xs text-slate-400 mb-1">
                    事件 ABI 定义 (如 event Mint(address indexed to, uint256 amount)) *
                  </label>
                  <input
                    id="custom-abi"
                    type="text"
                    value={customEventAbi}
                    onChange={(e) => setCustomEventAbi(e.target.value)}
                    required
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-slate-200"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="custom-field" className="block text-xs text-slate-400 mb-1">
                      监测数值字段名 (valueField) *
                    </label>
                    <input
                      id="custom-field"
                      type="text"
                      pattern="^[A-Za-z_][A-Za-z0-9_]*$"
                      value={customValueField}
                      onChange={(e) => setCustomValueField(e.target.value)}
                      required
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-slate-200"
                    />
                  </div>
                  <div>
                    <label htmlFor="custom-threshold" className="block text-xs text-slate-400 mb-1">
                      阈值 (原子整数) *
                    </label>
                    <input
                      id="custom-threshold"
                      type="text"
                      pattern="^\d+$"
                      value={customThresholdAtomic}
                      onChange={(e) => setCustomThresholdAtomic(e.target.value)}
                      required
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-slate-200"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* VALIDATOR_HEALTH */}
            {type === "VALIDATOR_HEALTH" && (
              <div className="space-y-3">
                <div>
                  <label htmlFor="val-health-url" className="block text-xs text-slate-400 mb-1">
                    验证节点健康检测接口 (Health URL) *
                  </label>
                  <input
                    id="val-health-url"
                    type={editingMonitor ? "password" : "url"}
                    placeholder={editingMonitor ? "留空保留现有健康端点" : ""}
                    value={valHealthUrl}
                    onChange={(e) => setValHealthUrl(e.target.value)}
                    required={!editingMonitor}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-slate-200"
                  />
                </div>
                <div>
                  <label htmlFor="val-unhealthy-sec" className="block text-xs text-slate-400 mb-1">
                    判定不健康超时 (秒) *
                  </label>
                  <input
                    id="val-unhealthy-sec"
                    type="number"
                    min={1}
                    value={valUnhealthySec}
                    onChange={(e) => setValUnhealthySec(Number(e.target.value))}
                    required
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-slate-200"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-md transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                  <span>{editingMonitor ? "正在保存..." : "正在创建..."}</span>
                </>
              ) : (
                <span>{editingMonitor ? "保存配置" : "立即创建监控"}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
