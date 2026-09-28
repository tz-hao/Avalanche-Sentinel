"use client";

import React, { useEffect, useState, useCallback } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { IncidentRecord } from "@/contracts/domain";
import { sentinelApi, SentinelApiError } from "@/lib/sentinel-api";
import { StatusBadge } from "@/components/StatusBadge";
import { LoadingState, ErrorState, EmptyState } from "@/components/StateFeedback";
import { ForensicEvidenceTimeline } from "@/components/ForensicEvidenceTimeline";
import { Metric,dateLabel,chainLabel } from "@/components/ForensicUI";
import { TimelineViewer } from "@/components/TimelineViewer";

export default function IncidentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";

  const [incident, setIncident] = useState<IncidentRecord | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<boolean>(false);

  const [acknowledging, setAcknowledging] = useState<boolean>(false);
  const [ackError, setAckError] = useState<string | null>(null);
  const [ackSuccessNotice, setAckSuccessNotice] = useState<string | null>(null);
  const [generatedSummary, setGeneratedSummary] = useState<{ text: string; evidenceHash: string } | null>(null);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const handleRetry = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    setAckError(null);
    setGeneratedSummary(null);
    setSummaryError(null);

    try {
      const res = await sentinelApi.incident(id);
      setIncident(res.data.incident);
    } catch (err) {
      if (err instanceof SentinelApiError) {
        if (err.status === 401) {
          router.push("/login" as Route);
          return;
        }
        if (err.status === 404) {
          setNotFound(true);
          return;
        }
        if (err.status === 503 || err.code === "AUTH_NOT_CONFIGURED") {
          setError("系统配置错误：管理员服务尚未配置 (SENTINEL_ADMIN_PASSWORD 缺失)。请先完成服务端配置。");
          return;
        }
      }
      setError(err instanceof Error ? err.message : "读取安全事件详情失败。");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    async function loadInitialIncident() {
      try {
        const res = await sentinelApi.incident(id);
        if (!cancelled) setIncident(res.data.incident);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof SentinelApiError) {
          if (err.status === 401) {
            router.push("/login" as Route);
            return;
          }
          if (err.status === 404) {
            setNotFound(true);
            return;
          }
          if (err.status === 503 || err.code === "AUTH_NOT_CONFIGURED") {
            setError("系统配置错误：管理员服务尚未配置 (SENTINEL_ADMIN_PASSWORD 缺失)。请先完成服务端配置。");
            return;
          }
        }
        setError(err instanceof Error ? err.message : "读取安全事件详情失败。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInitialIncident();
    return () => { cancelled = true; };
  }, [id, router]);

  const handleAcknowledge = async () => {
    if (!id) return;
    setAcknowledging(true);
    setAckError(null);
    setAckSuccessNotice(null);

    try {
      const res = await sentinelApi.acknowledge(id);
      setIncident(res.data.incident);
      setAckSuccessNotice("已成功确认事件，状态已转入处置中 (ACKNOWLEDGED)。");
    } catch (err) {
      if (err instanceof SentinelApiError && err.status === 401) {
        router.push("/login" as Route);
        return;
      }
      setAckError(err instanceof Error ? err.message : "确认事件失败，请重试。");
    } finally {
      setAcknowledging(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (!id || generatingSummary) return;
    setGeneratingSummary(true);
    setSummaryError(null);
    try {
      const response = await sentinelApi.generateSummary(id);
      setGeneratedSummary({ text: response.data.summary, evidenceHash: response.data.evidenceHash });
    } catch (err) {
      if (err instanceof SentinelApiError && err.status === 401) {
        router.push("/login" as Route);
        return;
      }
      setSummaryError(err instanceof SentinelApiError && err.code === "AI_NOT_CONFIGURED" ? "Summary unavailable：AI provider 尚未配置。" : "Summary unavailable：请查看下方原始 Evidence，稍后可重试。");
    } finally {
      setGeneratingSummary(false);
    }
  };

  if (loading) {
    return <LoadingState message="正在追溯链上存证与事件时间线..." />;
  }

  if (notFound) {
    return (
      <EmptyState
        title="未找到该安全事件 (404)"
        description={`找不到 ID 为 "${id}" 的安全事件记录，可能已被清理或 ID 输入有误。`}
        action={
          <Link
            href="/incidents"
            className="mt-3 px-4 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-md inline-block"
          >
            ← 返回事件列表
          </Link>
        }
      />
    );
  }

  if (error || !incident) {
    return (
      <ErrorState
        title="事件详情读取失败"
        message={error || "无法加载安全事件，请检查网络或后端状态。"}
        onRetry={handleRetry}
      />
    );
  }


  const isRecovered=incident.status==="RECOVERED",isAcknowledged=incident.status==="ACKNOWLEDGED";
  const explorerUrl=incident.monitor?.chain?.explorerUrl??null;
  const icmFacts=incident.evidence.provenance==="icm"?incident.evidence.facts:null;
  const deliveryFacts=incident.events?.find(e=>e.type==="DELIVERED")?.evidence.facts;
  const icmValue=(value:unknown)=>typeof value==="string"||typeof value==="number"?String(value):"未观察到";
  const delivery=icmValue(deliveryFacts?.deliveryStatus??icmFacts?.deliveryStatus);
  const execution=icmValue(deliveryFacts?.executionStatus??icmFacts?.executionStatus);
  const transactions=new Set([incident.evidence.txHash,...(incident.events??[]).map(e=>e.evidence.txHash)].filter(Boolean));
  return <div className="forensic-layout"><div className="forensic-canvas"><header className="case-header"><div className="case-header-top"><Link href="/incidents">← 返回事件列表</Link><button className="button" onClick={handleRetry}>重新读取</button></div><p className="eyebrow">FORENSIC EVIDENCE WORKSPACE</p><div className="incident-card-top"><StatusBadge type="severity" value={incident.severity}/><StatusBadge type="incident" value={incident.status}/></div><h1>{incident.title}</h1><p className="muted">{incident.evidence.rule}</p><p className="mono">INCIDENT {incident.id}</p><dl className="metric-grid"><Metric label="Chain" value={chainLabel(incident.evidence.chainId,incident.evidence.chainName)}/><Metric label="Detected" value={dateLabel(incident.openedAt)} mono/><Metric label="Monitor Type" value={incident.monitor?.type??"未提供"}/></dl><nav className="workspace-tabs" aria-label="事件工作区"><a href="#evidence">证据时间线</a><a href="#lifecycle">事件生命周期</a><a href="#case-file">Case File</a></nav></header>
    {icmFacts&&<section aria-label="ICM Teleporter 消息状态"><h2>ICM / Teleporter 消息状态</h2><div className="icm-state-grid"><div className={`icm-state ${delivery==="DELIVERED"?"icm-delivered":""}`}><p className="eyebrow">DELIVERY</p><strong>{delivery}</strong><p className="evidence-caption">{delivery==="DELIVERED"?"Message delivery completed.":"Destination delivery not observed within configured observation window."}</p></div><div className={`icm-state ${execution==="FAILED"?"icm-failed":""}`}><p className="eyebrow">EXECUTION · INDEPENDENT</p><strong>{execution}</strong><p className="evidence-caption">{execution==="FAILED"?"Destination execution failed.":"执行结果以目标链证据为准。"}</p></div></div><dl className="evidence-grid"><Metric label="Source Chain" value={icmValue(icmFacts.sourceChainName??incident.evidence.chainName)}/><Metric label="Destination Chain" value={icmValue(icmFacts.destinationChainName??icmFacts.destinationChainId)}/><Metric label="Message ID" value={icmValue(icmFacts.messageId)} mono/><Metric label="Receive Tx" value={icmValue(deliveryFacts?.destinationTxHash)} mono/></dl><p className="evidence-caption">交付与执行相互独立。缺少接收证据不证明 Relayer、Validator 或链故障。</p></section>}
    <ForensicEvidenceTimeline incident={incident} explorerUrl={explorerUrl}/>
    <section className="summary-section" aria-label="AI Summary"><div className="section-heading"><div><h2>AI Summary · INTERPRETATION ONLY</h2><p className="evidence-caption">Generated from incident evidence · 解释性内容，原始 Evidence 为准</p></div><button className="button" onClick={handleGenerateSummary} disabled={generatingSummary}>{generatingSummary?"生成中...":generatedSummary?"重新生成":"生成摘要"}</button></div>{generatedSummary?<><p>{generatedSummary.text}</p><p className="hash-value mono">Evidence SHA-256: {generatedSummary.evidenceHash}</p></>:incident.summary?<p>历史摘要（未记录 Evidence 哈希）：{incident.summary}</p>:<p className="evidence-caption">Not generated · 当前没有摘要；仅主动请求后调用 provider，未配置时不可用。</p>}{summaryError&&<p role="alert">{summaryError}</p>}</section>
    </div>
    <div className="forensic-canvas forensic-lifecycle"><section id="lifecycle" className="lifecycle" aria-label="事件生命周期"><h2>事件生命周期 / Lifecycle</h2><p className="evidence-caption">记录检出、确认与恢复；确认不是恢复。</p><TimelineViewer events={incident.events?.filter(event=>["DETECTED","DETECTED_AGAIN","ACKNOWLEDGED","RECOVERED"].includes(event.type))}/>{!isRecovered?<div className="summary-section"><button onClick={handleAcknowledge} disabled={acknowledging} className="button button-primary" aria-label="确认处置安全事件">{acknowledging?"正在确认...":isAcknowledged?"已确认处置 (再次确认)":"确认处置 (Acknowledge)"}</button><p className="evidence-caption">Acknowledging does not mark this incident as recovered.</p></div>:<p className="evidence-caption">事件已恢复闭环 (已归档)</p>}{ackSuccessNotice&&<p role="status">{ackSuccessNotice}</p>}{ackError&&<p role="alert">操作失败：{ackError}</p>}</section></div>
    <aside id="case-file" className="case-file" aria-label="Case File"><p className="eyebrow">AUDITABLE OBSERVATION</p><h2>事件元数据 <span className="eyebrow">CASE FILE</span></h2><section><p className="eyebrow">INCIDENT</p><dl><Metric label="ID" value={incident.id} mono/><Metric label="Severity" value={incident.severity}/><Metric label="Status" value={incident.status}/><Metric label="Detected" value={dateLabel(incident.openedAt)} mono/><Metric label="Acknowledged" value={dateLabel(incident.acknowledgedAt)} mono/><Metric label="Recovered" value={dateLabel(incident.recoveredAt)} mono/></dl></section><section><p className="eyebrow">MONITOR</p><dl><Metric label="Monitor ID" value={incident.monitorId} mono/><Metric label="Type" value={incident.monitor?.type??"—"}/><Metric label="Environment" value={incident.evidence.provenance==="demo"?"DEMO":"DTO 未提供"}/><Metric label="Chain ID" value={incident.evidence.chainId} mono/></dl></section><section><p className="eyebrow">EVIDENCE</p><dl><Metric label="Tx count · unique in record" value={transactions.size}/><Metric label="Event count" value={incident.events?.length??0}/><Metric label="Evidence SHA-256" value="API 未提供" mono/><Metric label="Provenance" value={incident.evidence.provenance}/></dl></section><section><p className="eyebrow">RELATED</p><dl>{incident.evidence.target&&<Metric label="Target / Contract" value={incident.evidence.target} mono/>}{incident.evidence.txHash&&<Metric label="Tx Hash" value={incident.evidence.txHash} mono/>}{typeof icmFacts?.messageId === "string" &&<Metric label="Message ID" value={icmValue(icmFacts.messageId)} mono/>}</dl><p className="muted">观测不等于攻击归因。原始证据优先于摘要和调查判断。</p></section></aside></div>;
}
