"use client";

import React, { useEffect, useState, useCallback } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MonitorType, MonitorRecord, OverviewRecord } from "@/contracts/domain";
import { sentinelApi, SentinelApiError } from "@/lib/sentinel-api";
import { Icon, PageHeader, Metric, IncidentCard, dateLabel } from "@/components/ForensicUI";
import { StatusBadge } from "@/components/StatusBadge";
import { LoadingState, ErrorState, EmptyState } from "@/components/StateFeedback";

const MONITOR_NAMES: Record<MonitorType, { name: string; category: "core" | "enhanced"; desc: string }> = {
  RPC_HEALTH: { name: "RPC 节点健康", category: "core", desc: "网络连通性与节点延迟探测" },
  TREASURY: { name: "金库大额异动", category: "core", desc: "金库资产流出与白名单核验" },
  ADMIN: { name: "管理特权与合约升级", category: "core", desc: "所有权移交、角色变更与逻辑代理升级" },
  ICM_DELIVERY: { name: "ICM 跨链消息交付", category: "core", desc: "Avalanche 跨子网通信跨链交付时效" },
  CUSTOM_EVENT: { name: "自定义事件数值阈值", category: "enhanced", desc: "特定智能合约业务事件数值监控" },
  VALIDATOR_HEALTH: { name: "验证节点运行状态", category: "enhanced", desc: "Avalanche 验证者节点指标与运行探测" },
};

export default function OverviewPage() {
  const router = useRouter();
  const [monitors, setMonitors] = useState<MonitorRecord[]>([]);
  const [data, setData] = useState<OverviewRecord | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const handleRetry = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, monitorResponse] = await Promise.all([sentinelApi.overview(), sentinelApi.monitors()]);
      setData(res.data);
      setMonitors(monitorResponse.data.monitors);
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
      setError(err instanceof Error ? err.message : "获取运营总览数据失败。");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    async function loadInitialOverview() {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const [res, monitorResponse] = await Promise.all([sentinelApi.overview(), sentinelApi.monitors()]);
        if (!cancelled) { setData(res.data); setMonitors(monitorResponse.data.monitors); setError(null); }
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
        setError(err instanceof Error ? err.message : "获取运营总览数据失败。");
      } finally {
        inFlight = false;
        if (!cancelled) setLoading(false);
      }
    }

    void loadInitialOverview();
    const refresh = setInterval(() => { void loadInitialOverview(); }, 15_000);
    return () => { cancelled = true; clearInterval(refresh); };
  }, [router]);

  if (loading) {
    return <LoadingState message="正在加载安全运营中心实时状态..." />;
  }

  if (error || !data) {
    return (
      <ErrorState
        title="总览数据读取失败"
        message={error || "无法加载安全运营总览状态，请检查后端服务连接。"}
        onRetry={handleRetry}
      />
    );
  }


  const activeProduction=monitors.filter(m=>m.enabled&&m.config.production===true);
  const latest=activeProduction.filter(m=>m.lastCheckAt).sort((a,b)=>String(b.lastCheckAt).localeCompare(String(a.lastCheckAt)))[0];
  const critical=data.overallStatus==="CRITICAL";
  return <div className="section-stack"><PageHeader title="运营总览" eyebrow="安全运营指挥中心" description="实时掌握 Avalanche 链上安全状态、监控运行情况与事件证据。"><span className="eyebrow">检出 → 调查 → 验证</span><button className="button" onClick={handleRetry} aria-label="刷新总览数据"><Icon name="refresh"/>刷新状态</button></PageHeader>
    <section className="panel" aria-label="Worker 心跳"><h2>Worker 运行状态</h2><p>{data.worker?.status==="RUNNING"?"心跳正常":data.worker?.status==="STALE"?"心跳已过期，请检查 Worker":"尚无 Worker 心跳记录"}</p><p className="muted">最近心跳：{dateLabel(data.worker?.lastHeartbeatAt)} · 心跳正常不代表每个监控都健康</p></section>
    <section className={`panel posture ${critical?"posture-critical":""}`} aria-label="整体安全态势"><div className="posture-icon"><Icon/></div><div><p className="eyebrow">安全运行态势</p><h2 className="posture-title">{critical?"存在高优先级安全事件":data.overallStatus==="HEALTHY"?"系统运行正常":data.overallStatus==="DEGRADED"?"存在待复核事件或监控降级":"尚未建立观测基线"}</h2><StatusBadge type="overall" value={data.overallStatus}/><p className="muted">当前启用 {activeProduction.length} 个生产监控探针 (Production)。全局事件统计包括历史及验收事件，不等同于当前探针故障。</p></div><dl className="metric-grid"><Metric label="运行中监控项" value={data.activeMonitors}/><Metric label="待处置事件" value={data.openIncidents}/><Metric label="高危紧急事件" value={data.criticalIncidents}/></dl></section>
    <section className="panel" aria-label="Fuji C-Chain 实时状态"><div className="section-heading"><h2><Icon name="pulse"/>Fuji C-Chain 实时状态</h2><span className="neutral-badge">只读观测 · 非区块浏览器</span></div><dl className="metric-grid"><Metric label="最新观测区块 / Worker 游标" value={latest?.cursorBlock ?? "—"} mono/><Metric label="最近检查时间" value={dateLabel(latest?.lastCheckAt)} mono/><div className="metric"><dt>生产环境 RPC 状态</dt><dd>{latest?<StatusBadge type="monitor" value={latest.status}/>: "暂无运行中生产探针数据"}</dd></div></dl><div className="block-strip" aria-hidden="true">{Array.from({length:16},(_,i)=><span key={i} className={`block-cell ${i===15&&latest?.lastCheckAt?"block-cell-current":""}`}/>)}</div><p className="activity-note">进度示意，不代表已读取 16 个区块。游标来自持久化检查状态，不代表完整实时区块流；缺失指标保持未提供。</p></section>
    <section aria-label="监控体系状态"><div className="section-heading"><h2><Icon name="grid"/>监控项目状态</h2><Link href="/monitors">进入监控中心 →</Link></div><div className="core-monitor-grid">{(["RPC_HEALTH","TREASURY","ADMIN","ICM_DELIVERY"] as MonitorType[]).map(type=>{const state=data.monitorStatuses.find(m=>m.type===type);const enabled=state?.count??0;return <div key={type} className={`monitor-card ${!enabled?"monitor-card-disabled":""}`}><p className="eyebrow">{type}</p><h3>{MONITOR_NAMES[type].name}</h3>{enabled?<StatusBadge type="monitor" value={state!.status}/>:<span className="neutral-badge">未启用</span>}<p className="muted">{MONITOR_NAMES[type].desc}</p><dl className="metric-grid"><Metric label="已启用实例" value={enabled}/><Metric label="最近检查" value={dateLabel(monitors.find(m=>m.type===type&&m.enabled)?.lastCheckAt)} mono/></dl><Link href="/monitors">查看详情 →</Link></div>;})}</div></section>
    <section><div className="section-heading"><h2><Icon name="file"/>近期安全事件</h2><Link href="/incidents">全部事件 →</Link></div>{!data.recentIncidents.length?<EmptyState title="当前暂无安全事件" description="当前没有已记录的链上安全事件。"/>:<div className="recent-grid">{data.recentIncidents.map(incident=><IncidentCard key={incident.id} incident={incident}/>)}</div>}</section></div>;
}
