"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
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
import {
  formatIncidentTitle,
  formatIncidentRule,
  formatMonitorType,
  formatSeverity,
  formatStatus,
  formatProvenance,
  formatDeliveryStatus,
  formatExecutionStatus,
} from "@/components/incident-formatters";

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
  const summaryInFlight = useRef(false);

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
      setAckSuccessNotice("已成功确认事件，状态已转入已确认 (ACKNOWLEDGED)。");
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
    if (!id || summaryInFlight.current) return;
    summaryInFlight.current = true;
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
      setSummaryError(err instanceof SentinelApiError && err.code === "AI_NOT_CONFIGURED" ? "AI 摘要暂不可用：AI Provider 尚未配置。" : err instanceof SentinelApiError && err.code === "AI_SUMMARY_TIMEOUT" ? "AI 摘要生成超时，请稍后重试。" : "AI 摘要暂不可用：请查看下方原始 Evidence，稍后可重试。");
    } finally {
      summaryInFlight.current = false;
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
  return <div className="forensic-layout"><div className="forensic-canvas"><header className="case-header"><div className="case-header-top"><Link href="/incidents">← 返回事件列表</Link><button className="button" onClick={handleRetry}>重新读取</button></div><p className="eyebrow">链上存证复盘工作区 (Forensic Workspace)</p><div className="incident-card-top"><StatusBadge type="severity" value={incident.severity}/><StatusBadge type="incident" value={incident.status}/></div><h1>{formatIncidentTitle(incident.title)}</h1><p className="muted">{formatIncidentRule(incident.evidence.rule)}</p><p className="mono">安全事件 ID: {incident.id}</p><dl className="metric-grid"><Metric label="目标链 / Chain" value={chainLabel(incident.evidence.chainId,incident.evidence.chainName)}/><Metric label="首次检出时间" value={dateLabel(incident.openedAt)} mono/><Metric label="触发监控类型" value={formatMonitorType(incident.monitor?.type)}/></dl><nav className="workspace-tabs" aria-label="事件工作区"><a href="#evidence">证据时间线</a><a href="#lifecycle">事件生命周期</a><a href="#case-file">案卷档案 (Case File)</a></nav></header>
    {icmFacts&&<section aria-label="ICM Teleporter 消息状态"><h2>ICM / Teleporter 跨链消息状态</h2><div className="icm-state-grid"><div className={`icm-state ${delivery==="DELIVERED"?"icm-delivered":""}`}><p className="eyebrow">DELIVERY · 跨链交付</p><strong>{formatDeliveryStatus(delivery)}</strong><p className="evidence-caption">{delivery==="DELIVERED"?"跨链消息已完成目标链交付。":"在设定的观测窗口内未观测到目标链接收。"}</p></div><div className={`icm-state ${execution==="FAILED"?"icm-failed":""}`}><p className="eyebrow">EXECUTION · 应用执行 (相互独立)</p><strong>{formatExecutionStatus(execution)}</strong><p className="evidence-caption">{execution==="FAILED"?"目标链应用层合约执行失败。":"执行结果以目标链存证为准。"}</p></div></div><dl className="evidence-grid"><Metric label="源链 / Source" value={icmValue(icmFacts.sourceChainName??incident.evidence.chainName)}/><Metric label="目标链 / Destination" value={icmValue(icmFacts.destinationChainName??icmFacts.destinationChainId)}/><Metric label="跨链消息 ID" value={icmValue(icmFacts.messageId)} mono/><Metric label="接收交易 (Receive Tx)" value={icmValue(deliveryFacts?.destinationTxHash)} mono/></dl><p className="evidence-caption">跨链交付与应用执行相互独立。Execution Failed 不等于 Delivery Failed；缺少接收证据不证明 Relayer、Validator 或网络故障。</p></section>}
    <ForensicEvidenceTimeline incident={incident} explorerUrl={explorerUrl}/>
    <section className="summary-section" aria-label="AI Summary"><div className="section-heading"><div><h2>AI 摘要解读 · 仅供调查参考 (AI Summary)</h2><p className="evidence-caption">基于事件存证生成 · 解释性内容，以原始证据 (Evidence) 为准</p></div><button className="button" onClick={handleGenerateSummary} disabled={generatingSummary}>{generatingSummary?"生成中…":generatedSummary?"重新生成":"生成摘要"}</button></div>{generatedSummary?<><div aria-live="polite">{generatedSummary.text.split(/^### /m).filter(part=>part.trim()).map((part,index)=>{const [heading,...lines]=part.split("\n");return <section key={index}><h3>{heading}</h3><p style={{whiteSpace:"pre-wrap"}}>{lines.join("\n").trim()}</p></section>;})}</div><p className="hash-value mono">Evidence SHA-256: {generatedSummary.evidenceHash}</p></>:incident.summary?<p>历史摘要（未记录 Evidence 哈希）：{incident.summary}</p>:<p className="evidence-caption">尚未生成摘要。</p>}{summaryError&&<p role="alert">{summaryError}</p>}<p className="evidence-caption">AI 摘要仅用于辅助调查与事实解释，不作为自动化响应依据。原始链上 Evidence 和时间线为事实来源。</p></section>
    </div>
    <div className="forensic-canvas forensic-lifecycle"><section id="lifecycle" className="lifecycle" aria-label="事件生命周期"><h2>事件生命周期 (Incident Lifecycle)</h2><p className="evidence-caption">记录检出、处置确认与恢复；处置确认 (ACK) 不等于状态恢复。</p><TimelineViewer events={incident.events?.filter(event=>["DETECTED","DETECTED_AGAIN","ACKNOWLEDGED","RECOVERED"].includes(event.type))}/>{!isRecovered?<div className="summary-section"><button onClick={handleAcknowledge} disabled={acknowledging} className="button button-primary" aria-label="确认处置安全事件">{acknowledging?"正在确认...":isAcknowledged?"已确认处置 (再次确认)":"确认处置 (Acknowledge)"}</button><p className="evidence-caption">处置确认 (ACK) 仅代表安全人员已知悉事件，不代表链上问题已恢复。</p></div>:<p className="evidence-caption">事件已恢复闭环 (已归档)</p>}{ackSuccessNotice&&<p role="status">{ackSuccessNotice}</p>}{ackError&&<p role="alert">操作失败：{ackError}</p>}</section></div>
    <aside id="case-file" className="case-file" aria-label="Case File"><p className="eyebrow">可审计存证档案 (AUDITABLE OBSERVATION)</p><h2>事件案卷档案 <span className="eyebrow">CASE FILE</span></h2><section><p className="eyebrow">INCIDENT · 事件基础信息</p><dl><Metric label="事件 ID" value={incident.id} mono/><Metric label="严重等级" value={formatSeverity(incident.severity)}/><Metric label="当前状态" value={formatStatus(incident.status)}/><Metric label="首次检出时间" value={dateLabel(incident.openedAt)} mono/><Metric label="处置确认时间" value={dateLabel(incident.acknowledgedAt)} mono/><Metric label="状态恢复时间" value={dateLabel(incident.recoveredAt)} mono/></dl></section><section><p className="eyebrow">MONITOR · 关联监控项</p><dl><Metric label="监控项 ID" value={incident.monitorId} mono/><Metric label="监控类型" value={formatMonitorType(incident.monitor?.type)}/><Metric label="环境标识" value={incident.evidence.provenance==="demo"?"DEMO (演示合成)":"PRODUCTION (生产观测)"}/><Metric label="所属 Chain ID" value={incident.evidence.chainId} mono/></dl></section><section><p className="eyebrow">EVIDENCE · 存证指标</p><dl><Metric label="关联交易总数" value={transactions.size}/><Metric label="时间线节点数" value={incident.events?.length??0}/><Metric label="存证哈希 (SHA-256)" value="API 未提供" mono/><Metric label="证据来源 (Provenance)" value={formatProvenance(incident.evidence.provenance)}/></dl></section><section><p className="eyebrow">RELATED · 链上对象</p><dl>{incident.evidence.target&&<Metric label="目标合约 / 地址" value={incident.evidence.target} mono/>}{incident.evidence.txHash&&<Metric label="交易哈希 (Tx Hash)" value={incident.evidence.txHash} mono/>}{typeof icmFacts?.messageId === "string" &&<Metric label="跨链消息 ID" value={icmValue(icmFacts.messageId)} mono/>}</dl><p className="muted">观测不等于攻击归因。原始证据优先于摘要和调查判断。</p></section></aside></div>;
}
