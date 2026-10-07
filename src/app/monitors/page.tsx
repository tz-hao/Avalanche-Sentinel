"use client";

import React, { useEffect, useState, useCallback } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import type { ChainRecord, MonitorRecord } from "@/contracts/domain";
import { sentinelApi, SentinelApiError } from "@/lib/sentinel-api";
import { PageHeader, Metric, Icon, MonitorIdentity, dateLabel, chainLabel } from "@/components/ForensicUI";
import { StatusBadge } from "@/components/StatusBadge";
import { LoadingState, ErrorState, EmptyState } from "@/components/StateFeedback";
import { displaySafe } from "@/components/display-safety";
import { CreateMonitorModal } from "@/components/CreateMonitorModal";

const MONITOR_TYPE_NAMES: Record<string, string> = {
  RPC_HEALTH: "RPC 节点健康",
  TREASURY: "金库大额异动",
  ADMIN: "特权与合约升级",
  ICM_DELIVERY: "ICM 跨链消息交付",
  CUSTOM_EVENT: "自定义事件阈值",
  VALIDATOR_HEALTH: "验证节点健康",
};

export default function MonitorsPage() {
  const router = useRouter();
  const [chains, setChains] = useState<ChainRecord[]>([]);
  const [monitors, setMonitors] = useState<MonitorRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [editingMonitor, setEditingMonitor] = useState<MonitorRecord | undefined>();
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleRetry = useCallback(async () => {
    setLoading(true);
    setError(null);
    setActionError(null);
    try {
      const [chainsRes, monitorsRes] = await Promise.all([
        sentinelApi.chains(),
        sentinelApi.monitors(),
      ]);
      setChains(chainsRes.data.chains);
      setMonitors(monitorsRes.data.monitors);
        setError(null);
    } catch (err) {
      if (err instanceof SentinelApiError) {
        if (err.status === 401) {
          router.push("/login" as Route);
          return;
        }
        if (err.code === "AUTH_NOT_CONFIGURED") {
          setError("系统配置错误：管理员服务尚未配置 (SENTINEL_ADMIN_PASSWORD 缺失)。请先完成服务端配置。");
          return;
        }
      }
      setError(err instanceof Error ? err.message : "获取监控列表失败。");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    async function loadInitialMonitors() {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const [chainsRes, monitorsRes] = await Promise.all([
          sentinelApi.chains(),
          sentinelApi.monitors(),
        ]);
        if (cancelled) return;
        setChains(chainsRes.data.chains);
        setMonitors(monitorsRes.data.monitors);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof SentinelApiError) {
          if (err.status === 401) {
            router.push("/login" as Route);
            return;
          }
          if (err.code === "AUTH_NOT_CONFIGURED") {
            setError("系统配置错误：管理员服务尚未配置 (SENTINEL_ADMIN_PASSWORD 缺失)。请先完成服务端配置。");
            return;
          }
        }
        setError(err instanceof Error ? err.message : "获取监控列表失败。");
      } finally {
        inFlight = false;
        if (!cancelled) setLoading(false);
      }
    }

    void loadInitialMonitors();
    const refresh = setInterval(() => { void loadInitialMonitors(); }, 15_000);
    return () => { cancelled = true; clearInterval(refresh); };
  }, [router]);

  const handleToggleEnable = async (monitor: MonitorRecord) => {
    setTogglingId(monitor.id);
    setActionError(null);
    try {
      const updated = !monitor.enabled;
      const response = await sentinelApi.updateMonitor(monitor.id, { enabled: updated });
      setMonitors((prev) =>
        prev.map((m) => (m.id === monitor.id ? response.data.monitor : m))
      );
    } catch (err) {
      if (err instanceof SentinelApiError && err.status === 401) {
        router.push("/login" as Route);
        return;
      }
      setActionError(
        err instanceof Error ? `修改状态失败: ${err.message}` : "修改监控项启停状态失败。"
      );
    } finally {
      setTogglingId(null);
    }
  };

  if (loading) {
    return <LoadingState message="正在加载监控节点与多链配置..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="监控项数据读取失败"
        message={error}
        onRetry={handleRetry}
      />
    );
  }


  const enabledCount=monitors.filter(m=>m.enabled).length;
  return <div><PageHeader title="监控项目" eyebrow="监控控制中心" description="配置并查看 Sentinel 持续观察的链上安全规则。"><button className="button" onClick={handleRetry} aria-label="刷新监控项列表"><Icon name="refresh"/>刷新</button><button className="button button-primary" onClick={()=>{setEditingMonitor(undefined);setCreateModalOpen(true);}}>新建监控项</button></PageHeader>
    <dl className="stat-row"><Metric label="已启用" value={enabledCount}/><Metric label="已停用" value={monitors.length-enabledCount}/><Metric label="降级运行 (仅已启用)" value={monitors.filter(m=>m.enabled&&m.status==="DEGRADED").length}/><Metric label="异常离线 (仅已启用)" value={monitors.filter(m=>m.enabled&&m.status==="DOWN").length}/></dl>
    {actionError&&<div role="alert" className="toast-error">{actionError}<button className="button" onClick={()=>setActionError(null)}>关闭</button></div>}
    {!monitors.length?<EmptyState title="暂无配置的监控项" description="尚未配置监控规则。立即创建监控项以开启链上实时观测。" action={<button className="button" onClick={()=>setCreateModalOpen(true)}>立即新建监控项</button>}/>:<div className="monitor-grid">{monitors.map(m=><article key={m.id} className={`monitor-card ${!m.enabled?"monitor-card-disabled":""}`}><div className="monitor-card-top"><span className="eyebrow">{m.type}</span><MonitorIdentity monitor={m}/></div><h2>{typeof m.config.name==="string"?m.config.name:`${MONITOR_TYPE_NAMES[m.type]??m.type} (${m.type})`}</h2><p className="muted">{chainLabel(m.chain.chainId,m.chain.name)} · <span className="mono">Chain ID {m.chain.chainId}</span></p><div className="incident-card-top"><span className="neutral-badge">{m.enabled?"已启用":"已停用"}</span>{m.enabled?<StatusBadge type="monitor" value={m.status}/>:<span className="neutral-badge">当前状态: 已停用</span>}</div><dl className="metric-grid"><Metric label="最近检查" value={dateLabel(m.lastCheckAt)} mono/><Metric label="响应延迟" value={m.latencyMs==null?"—":`${m.latencyMs} ms`}/><Metric label="巡检周期" value={`${m.intervalSec} 秒`}/><Metric label="游标 / 连续失败数" value={`${m.cursorBlock ?? "—"} / ${m.consecutiveFail ?? "—"}`} mono/></dl>{m.stale&&<p className="monitor-error">检查结果已过期或尚未巡检，不能视为当前健康。</p>}{m.target&&<p className="mono">{m.target}</p>}{m.lastError&&<p className="monitor-error">{m.enabled?"当前错误":"历史状态（已停用）"}：{String(displaySafe(m.lastError))}</p>}<details className="config-detail"><summary>查看配置参数 (JSON)</summary><p className="mono">监控项 ID: {m.id}</p>{!m.enabled&&<p className="muted">历史检测状态：{m.recordedStatus ?? m.status}，不代表当前运行健康。</p>}<pre>{JSON.stringify(displaySafe(m.config),null,2)}</pre></details><div className="monitor-actions"><span className="muted">管理操作需人工确认</span><details><summary className="button">··· 管理操作</summary><button className="button" disabled={m.enabled} onClick={()=>{setEditingMonitor(m);setCreateModalOpen(true);}}>编辑配置（先停用）</button><button type="button" className="button button-danger" disabled={togglingId===m.id} onClick={()=>{if(window.confirm(`确认${m.enabled?"停用":"启用"}监控项？此操作将影响 Worker 后续巡检。`))void handleToggleEnable(m);}} aria-label={`${m.enabled?"停用":"启用"}监控项 ${MONITOR_TYPE_NAMES[m.type]??m.type}`}>{togglingId===m.id?"处理中...":m.enabled?"停用监控项":"启用监控项"}</button></details></div></article>)}</div>}
    {createModalOpen&&<CreateMonitorModal key={editingMonitor?.id ?? "new"} editingMonitor={editingMonitor} chains={chains} isOpen onClose={()=>setCreateModalOpen(false)} onCreated={handleRetry}/>}</div>;
}
