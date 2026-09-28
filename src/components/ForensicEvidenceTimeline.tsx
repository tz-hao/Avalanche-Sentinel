import React from "react";
import type {IncidentRecord} from "@/contracts/domain";
import {EvidenceViewer} from "./EvidenceViewer";
import {dateLabel} from "./ForensicUI";

export function ForensicEvidenceTimeline({incident,explorerUrl}:{incident:IncidentRecord;explorerUrl?:string|null}) {
  const observed=(incident.events??[]).filter(e=>!["ACKNOWLEDGED","RECOVERED"].includes(e.type));
  return <section id="evidence" aria-label="Evidence Timeline"><h2>证据时间线 / Evidence</h2><p className="evidence-caption">仅展示已保存的规则观测和链上存证，不推断攻击意图或责任方。</p><div className="evidence-timeline"><article className="evidence-step"><span className="step-number" aria-hidden="true">01</span><h3>规则命中 · Evidence Snapshot</h3><EvidenceViewer evidence={incident.evidence} explorerUrl={explorerUrl}/></article>{observed.map((event,index)=><article className="evidence-step" key={event.id}><span className="step-number" aria-hidden="true">{String(index+2).padStart(2,"0")}</span><h3>{event.type}</h3><p className="evidence-caption">{event.message} · {dateLabel(event.createdAt)}</p><details className="config-detail"><summary>查看该节点证据</summary><EvidenceViewer evidence={event.evidence} explorerUrl={explorerUrl}/></details></article>)}</div></section>;
}

