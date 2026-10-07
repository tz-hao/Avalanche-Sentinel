"use client";

import React, { useEffect, useState, Suspense } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { IncidentRecord } from "@/contracts/domain";
import { sentinelApi, SentinelApiError } from "@/lib/sentinel-api";
import { PageHeader, Icon, IncidentCard, dateLabel, chainLabel } from "@/components/ForensicUI";
import { formatIncidentTitle, formatIncidentRule } from "@/components/incident-formatters";
import { LoadingState, ErrorState, EmptyState } from "@/components/StateFeedback";

function localDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0,16);
}

function IncidentsContent({ query }: { query: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = new URLSearchParams(query);
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [from, setFrom] = useState(localDate(params.get("from") ?? ""));
  const [to, setTo] = useState(localDate(params.get("to") ?? ""));
  const [result, setResult] = useState<{ incidents: IncidentRecord[]; nextCursor?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const selectedSeverity = params.get("severity");
  const selectedStatus = params.get("status");

  useEffect(() => {
    let cancelled = false;
    sentinelApi.incidents(new URLSearchParams(query)).then(res => {
      if (!cancelled) setResult(res.data);
    }).catch(err => {
      if (cancelled) return;
      if (err instanceof SentinelApiError && err.status === 401) { router.push("/login" as Route); return; }
      setError(err instanceof Error ? err.message : "获取安全事件列表失败。");
    });
    return () => { cancelled = true; };
  }, [query, retry, router]);

  function navigate(next: URLSearchParams) {
    router.push((next.size ? pathname + "?" + next : pathname) as Route);
  }
  function updateFilters(key: string, value: string | null) {
    const next = new URLSearchParams(query);
    next.delete("cursor");
    if (value) next.set(key, value); else next.delete(key);
    navigate(next);
  }
  const retryLoad = () => { setError(null); setResult(null); setRetry(value => value + 1); };
  const incidents = result?.incidents ?? [];
  const preview = incidents[0];

  return <div>
    <PageHeader title="安全事件" eyebrow="安全事件收件箱" description="从规则命中到证据复盘，区分观测事实与事件处置状态。"><button className="button" onClick={retryLoad} aria-label="刷新事件列表"><Icon name="refresh"/>刷新</button></PageHeader>
    <section className="panel filter-panel" aria-label="事件筛选">
      <div className="filter-group" role="group" aria-label="处置状态筛选"><span className="filter-label">处置状态</span>{[null,"OPEN","ACKNOWLEDGED","RECOVERED"].map(st => <button key={st ?? "all"} className="filter-chip" aria-pressed={selectedStatus === st} onClick={() => updateFilters("status", st)}>{st === "OPEN" ? "待处置 (OPEN)" : st === "ACKNOWLEDGED" ? "已确认知悉 (ACK)" : st === "RECOVERED" ? "已恢复 (RECOVERED)" : "全部状态"}</button>)}</div>
      <div className="filter-group" role="group" aria-label="严重级别筛选"><span className="filter-label">严重级别</span>{[null,"CRITICAL","WARNING","INFO"].map(sev => <button key={sev ?? "all"} className="filter-chip" aria-pressed={selectedSeverity === sev} onClick={() => updateFilters("severity", sev)}>{sev === "CRITICAL" ? "高危 (CRITICAL)" : sev === "WARNING" ? "警告 (WARNING)" : sev === "INFO" ? "提示 (INFO)" : "全部级别"}</button>)}</div>
      <form className="history-query" onSubmit={event => {
        event.preventDefault();
        const next = new URLSearchParams(query);
        next.delete("cursor");
        if (from && to && new Date(from) > new Date(to)) { setError("起始时间不能晚于结束时间。"); return; }
        for (const [key, value] of [["q", search.trim()], ["from", from], ["to", to]]) {
          if (value) next.set(key, key === "q" ? value : new Date(value).toISOString()); else next.delete(key);
        }
        navigate(next);
      }}>
        <label htmlFor="incident-search">搜索全部事件<input id="incident-search" className="search-input" maxLength={200} value={search} onChange={e => setSearch(e.target.value)} placeholder="事件 ID、交易哈希、目标或关键词" /></label>
        <label>检出时间起点（本地时间）<input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label>检出时间终点（本地时间）<input type="datetime-local" value={to} onChange={e => setTo(e.target.value)} /></label>
        <button className="button" type="submit">应用筛选</button>
      </form>
      {!!query && <button className="button" onClick={() => navigate(new URLSearchParams())}>清空全部筛选条件</button>}
    </section>
    {error ? <ErrorState title="事件列表检索失败" message={error} onRetry={retryLoad}/> : !result ? <LoadingState message="正在筛选并检索安全事件记录..."/> : !preview ? <EmptyState title="未发现匹配的安全事件" description="筛选条件下没有匹配记录，不能据此推断系统健康。"/> : <div className="inbox-layout">
      <section className="inbox-list" aria-label="安全事件列表">{incidents.map(i => <IncidentCard key={i.id} incident={i}/>)}</section>
      <aside className="panel inbox-preview" aria-label="最近匹配事件摘要"><p className="eyebrow">最近匹配事件 · 预览</p><h2>{formatIncidentTitle(preview.title)}</h2><p className="muted">{formatIncidentRule(preview.evidence.rule)}</p><p>{chainLabel(preview.evidence.chainId, preview.evidence.chainName)}</p><p className="mono">{preview.id}</p><p className="muted">{dateLabel(preview.openedAt)}</p><Link className="button" href={("/incidents/" + preview.id) as Route}>进入证据工作区 →</Link><p className="muted">ACKNOWLEDGED 仅表示已确认知悉，不表示链上问题已恢复。RECOVERED 由规则恢复证据决定。</p></aside>
    </div>}
    {result && <nav className="monitor-actions" aria-label="事件分页"><span>本页 {incidents.length} 条</span>{params.has("cursor") && <button className="button" onClick={() => updateFilters("cursor", null)}>返回第一页</button>}{result.nextCursor && <button className="button" onClick={() => updateFilters("cursor", result.nextCursor!)}>下一页</button>}</nav>}
  </div>;
}

function IncidentRoot() {
  const query = useSearchParams().toString();
  return <IncidentsContent key={query} query={query}/>;
}
export default function IncidentsPage() {
  return <Suspense fallback={<LoadingState message="正在初始化事件中心..."/>}><IncidentRoot/></Suspense>;
}
