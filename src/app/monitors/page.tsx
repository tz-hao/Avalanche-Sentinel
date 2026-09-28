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

export default function MonitorsPage() {
  const router = useRouter();
  const [chains, setChains] = useState<ChainRecord[]>([]);
  const [monitors, setMonitors] = useState<MonitorRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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
    } catch (err) {
      if (err instanceof SentinelApiError) {
        if (err.status === 401) {
          router.push("/login" as Route);
          return;
        }
        if (err.status === 503 || err.code === "AUTH_NOT_CONFIGURED") {
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

    async function loadInitialMonitors() {
      try {
        const [chainsRes, monitorsRes] = await Promise.all([
          sentinelApi.chains(),
          sentinelApi.monitors(),
        ]);
        if (cancelled) return;
        setChains(chainsRes.data.chains);
        setMonitors(monitorsRes.data.monitors);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof SentinelApiError) {
          if (err.status === 401) {
            router.push("/login" as Route);
            return;
          }
          if (err.status === 503 || err.code === "AUTH_NOT_CONFIGURED") {
            setError("系统配置错误：管理员服务尚未配置 (SENTINEL_ADMIN_PASSWORD 缺失)。请先完成服务端配置。");
            return;
          }
        }
        setError(err instanceof Error ? err.message : "获取监控列表失败。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInitialMonitors();
    return () => { cancelled = true; };
  }, [router]);

  const handleToggleEnable = async (monitor: MonitorRecord) => {
    setTogglingId(monitor.id);
    setActionError(null);
    try {
      const updated = !monitor.enabled;
      await sentinelApi.updateMonitor(monitor.id, { enabled: updated });
      setMonitors((prev) =>
        prev.map((m) => (m.id === monitor.id ? { ...m, enabled: updated } : m))
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
  return <div><PageHeader title="监控项目" eyebrow="MONITORING CONTROL CENTER" description="配置并查看 Sentinel 持续观察的链上安全规则。"><button className="button" onClick={handleRetry} aria-label="刷新监控项列表"><Icon name="refresh"/>刷新</button><button className="button button-primary" onClick={()=>setCreateModalOpen(true)}>新建监控项</button></PageHeader>
    <dl className="stat-row"><Metric label="Active" value={enabledCount}/><Metric label="Disabled" value={monitors.length-enabledCount}/><Metric label="Degraded · active only" value={monitors.filter(m=>m.enabled&&m.status==="DEGRADED").length}/><Metric label="Failed · active only" value={monitors.filter(m=>m.enabled&&m.status==="DOWN").length}/></dl>
    {actionError&&<div role="alert" className="toast-error">{actionError}<button className="button" onClick={()=>setActionError(null)}>关闭</button></div>}
    {!monitors.length?<EmptyState title="暂无配置的监控项" description="No data · 尚未配置监控规则。" action={<button className="button" onClick={()=>setCreateModalOpen(true)}>立即新建监控项</button>}/>:<div className="monitor-grid">{monitors.map(m=><article key={m.id} className={`monitor-card ${!m.enabled?"monitor-card-disabled":""}`}><div className="monitor-card-top"><span className="eyebrow">{m.type}</span><MonitorIdentity monitor={m}/></div><h2>{typeof m.config.name==="string"?m.config.name:m.type}</h2><p className="muted">{chainLabel(m.chain.chainId,m.chain.name)} · <span className="mono">Chain ID {m.chain.chainId}</span></p><div className="incident-card-top"><span className="neutral-badge">{m.enabled?"已启用 (ACTIVE)":"已暂停 (DISABLED)"}</span>{m.enabled?<StatusBadge type="monitor" value={m.status}/>:<span className="neutral-badge">CURRENT: DISABLED</span>}</div><dl className="metric-grid"><Metric label="Last Check" value={dateLabel(m.lastCheckAt)} mono/><Metric label="Latency" value={m.latencyMs==null?"—":`${m.latencyMs} ms`}/><Metric label="Interval" value={`${m.intervalSec} 秒`}/><Metric label="Cursor / Failure Count" value="未提供" mono/></dl>{m.target&&<p className="mono">{m.target}</p>}{m.lastError&&<p className="monitor-error">{m.enabled?"当前错误":"历史状态（已停用）"}：{String(displaySafe(m.lastError))}</p>}<details className="config-detail"><summary>查看详情 / Config JSON</summary><p className="mono">Monitor ID: {m.id}</p>{!m.enabled&&<p className="muted">历史检测状态：{m.status}，不代表当前运行健康。</p>}<pre>{JSON.stringify(displaySafe(m.config),null,2)}</pre></details><div className="monitor-actions"><span className="muted">管理操作不会自动执行</span><details><summary className="button">··· 操作</summary><button type="button" className="button button-danger" disabled={togglingId===m.id} onClick={()=>{if(window.confirm(`确认${m.enabled?"停用":"启用"}监控项？此操作将影响 Worker 后续巡检。`))void handleToggleEnable(m);}} aria-label={`${m.enabled?"停用":"启用"}监控项 ${m.type}`}>{togglingId===m.id?"处理中...":m.enabled?"Disable Monitor":"Enable Monitor"}</button></details></div></article>)}</div>}
    <CreateMonitorModal chains={chains} isOpen={createModalOpen} onClose={()=>setCreateModalOpen(false)} onCreated={handleRetry}/></div>;
}
