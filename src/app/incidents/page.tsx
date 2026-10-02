"use client";

import React, { useEffect, useState, useCallback, Suspense } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { IncidentRecord, IncidentStatus, Severity } from "@/contracts/domain";
import { sentinelApi, SentinelApiError } from "@/lib/sentinel-api";
import { PageHeader, Icon, IncidentCard, dateLabel, chainLabel } from "@/components/ForensicUI";
import { formatIncidentTitle, formatIncidentRule } from "@/components/incident-formatters";
import { LoadingState, ErrorState, EmptyState } from "@/components/StateFeedback";

function IncidentsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedSeverity = searchParams.get("severity") as Severity | null;
  const selectedStatus = searchParams.get("status") as IncidentStatus | null;

  const [search, setSearch] = useState("");
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const handleRetry = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedSeverity) params.set("severity", selectedSeverity);
      if (selectedStatus) params.set("status", selectedStatus);

      const res = await sentinelApi.incidents(params);
      setIncidents(res.data.incidents);
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
      setError(err instanceof Error ? err.message : "获取安全事件列表失败。");
    } finally {
      setLoading(false);
    }
  }, [selectedSeverity, selectedStatus, router]);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialIncidents() {
      try {
        const params = new URLSearchParams();
        if (selectedSeverity) params.set("severity", selectedSeverity);
        if (selectedStatus) params.set("status", selectedStatus);
        const res = await sentinelApi.incidents(params);
        if (!cancelled) setIncidents(res.data.incidents);
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
        setError(err instanceof Error ? err.message : "获取安全事件列表失败。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInitialIncidents();
    return () => { cancelled = true; };
  }, [selectedSeverity, selectedStatus, router]);

  const updateFilters = (key: "severity" | "status", value: string | null) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (value) {
      nextParams.set(key, value);
    } else {
      nextParams.delete(key);
    }
    const query = nextParams.toString();
    router.push((query ? `${pathname}?${query}` : pathname) as Route);
  };

  const clearAllFilters = () => {
    router.push(pathname as Route);
  };

  const hasActiveFilters = !!(selectedSeverity || selectedStatus);

  const filtered=incidents.filter(i=>[i.id,i.title,i.monitorId,i.monitor?.type,i.evidence.rule,i.evidence.txHash,i.evidence.target].join(" ").toLowerCase().includes(search.toLowerCase().trim()));
  const preview=filtered[0];
  return <div><PageHeader title="安全事件" eyebrow="安全事件收件箱" description="从规则命中到证据复盘，区分观测事实与事件处置状态。"><button className="button" onClick={handleRetry} aria-label="刷新事件列表"><Icon name="refresh"/>刷新</button></PageHeader><section className="panel filter-panel" aria-label="事件筛选"><div className="filter-group" role="group" aria-label="处置状态筛选"><span className="filter-label">处置状态</span>{[null,"OPEN","ACKNOWLEDGED","RECOVERED"].map(st=><button key={st??"all"} className="filter-chip" aria-pressed={selectedStatus===st} onClick={()=>updateFilters("status",st)}>{st==="OPEN"?"待处置 (OPEN)":st==="ACKNOWLEDGED"?"已确认知悉 (ACK)":st==="RECOVERED"?"已恢复 (RECOVERED)":"全部状态"}</button>)}</div><div className="filter-group" role="group" aria-label="严重级别筛选"><span className="filter-label">严重级别</span>{[null,"CRITICAL","WARNING","INFO"].map(sev=><button key={sev??"all"} className="filter-chip" aria-pressed={selectedSeverity===sev} onClick={()=>updateFilters("severity",sev)}>{sev==="CRITICAL"?"高危 (CRITICAL)":sev==="WARNING"?"警告 (WARNING)":sev==="INFO"?"提示 (INFO)":"全部级别"}</button>)}</div><label className="muted" htmlFor="incident-search">搜索当前事件列表 · 事件 ID / 监控项 / 交易哈希 / 关键词</label><input id="incident-search" className="search-input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索事件、交易或规则"/>{hasActiveFilters&&<button className="button" onClick={clearAllFilters}>清空全部筛选条件</button>}</section>
    {loading?<LoadingState message="正在筛选并检索安全事件记录..."/>:error?<ErrorState title="事件列表检索失败" message={error} onRetry={handleRetry}/>:!filtered.length?<EmptyState title="未发现匹配的安全事件" description="当前返回列表中没有匹配记录，不能据此推断系统健康。"/>:<div className="inbox-layout"><section className="inbox-list" aria-label="安全事件列表">{filtered.map(i=><IncidentCard key={i.id} incident={i}/>)}</section><aside className="panel inbox-preview" aria-label="最近匹配事件摘要"><p className="eyebrow">最近匹配事件 · 预览</p><h2>{formatIncidentTitle(preview.title)}</h2><p className="muted">{formatIncidentRule(preview.evidence.rule)}</p><p>{chainLabel(preview.evidence.chainId,preview.evidence.chainName)}</p><p className="mono">{preview.id}</p><p className="muted">{dateLabel(preview.openedAt)}</p><Link className="button" href={`/incidents/${preview.id}` as Route}>进入证据工作区 →</Link><p className="muted">ACKNOWLEDGED 仅表示已确认知悉，不表示链上问题已恢复。RECOVERED 由规则恢复证据决定。</p></aside></div>}</div>;
}
export default function IncidentsPage(){return <Suspense fallback={<LoadingState message="正在初始化事件中心..."/>}><IncidentsContent/></Suspense>;}
