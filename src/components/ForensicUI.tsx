import React from "react";
import Link from "next/link";
import type { Route } from "next";
import type { IncidentRecord, MonitorRecord } from "@/contracts/domain";
import { StatusBadge } from "./StatusBadge";
import { formatIncidentTitle } from "./incident-formatters";

export function SentinelMark() {
  return <svg viewBox="0 0 40 44" width="36" height="40" aria-hidden="true"><path fill="currentColor" d="M20 1 37 9v14c0 10-9 17-17 20C12 40 3 33 3 23V9Z"/><path fill="none" stroke="var(--sentinel-bg)" strokeWidth="3" d="m12 26 8-15 8 15M16 22h8"/></svg>;
}
export function Icon({ name = "shield", className = "" }: { name?: string; className?: string }) {
  const paths: Record<string, string> = {
    shield: "M12 3 20 6v6c0 5-4 8-8 10-4-2-8-5-8-10V6ZM8 12l3 3 5-6",
    grid: "M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z",
    pulse: "M2 12h5l3-7 4 14 3-7h5",
    file: "M5 3h9l5 5v13H5ZM14 3v6h5M8 13h8M8 17h5",
    refresh: "M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-3l2 7M4 12l2 7a8 8 0 0 0 13-3",
    link: "m10 14 4-4M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 8l2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0",
    menu: "M4 6h16M4 12h16M4 18h16",
  };
  return <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.shield}/></svg>;
}
export function PageHeader({ title, eyebrow, description, children }: {title:string;eyebrow:string;description:string;children?:React.ReactNode}) {
  return <header className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{description}</p></div><div className="page-actions">{children}</div></header>;
}
export function Metric({ label, value, mono = false }: {label:string;value:React.ReactNode;mono?:boolean}) {
  return <div className="metric"><dt>{label}</dt><dd className={mono ? "mono" : ""}>{value ?? "—"}</dd></div>;
}
export function dateLabel(value?:string|null) {
  return value ? new Date(value).toLocaleString("zh-CN", {hour12:false}) : "—";
}
export function chainLabel(id:string, name:string) {
  return id === "43113" ? "Avalanche Fuji C-Chain" : name;
}
export function monitorEnvironment(m:MonitorRecord) {
  return m.config.demo === true ? "DEMO" : m.config.acceptance === true ? "ACCEPTANCE" : m.config.production === true ? "PRODUCTION" : "UNCLASSIFIED";
}
export function MonitorIdentity({ monitor }: {monitor:MonitorRecord}) {
  const env = monitorEnvironment(monitor);
  return <span className={`environment env-${env.toLowerCase()}`}>{env}</span>;
}
const MONITOR_TYPE_SHORT: Record<string, string> = {
  RPC_HEALTH: "RPC 节点健康",
  TREASURY: "金库大额异动",
  ADMIN: "特权与合约升级",
  ICM_DELIVERY: "ICM 跨链交付",
  CUSTOM_EVENT: "自定义事件阈值",
  VALIDATOR_HEALTH: "验证节点健康",
};

export function IncidentCard({ incident }: {incident:IncidentRecord}) {
  const typeText = incident.monitor?.type ? `${MONITOR_TYPE_SHORT[incident.monitor.type] ?? incident.monitor.type} (${incident.monitor.type})` : `来源: ${incident.evidence.provenance.toUpperCase()}`;
  return <Link href={`/incidents/${incident.id}` as Route} className="incident-card"><div className="incident-card-top"><StatusBadge type="severity" value={incident.severity} size="sm"/><StatusBadge type="incident" value={incident.status} size="sm"/></div><h3>{formatIncidentTitle(incident.title)}</h3><p className="muted">{typeText} · {chainLabel(incident.evidence.chainId,incident.evidence.chainName)}</p><div className="incident-card-bottom"><time dateTime={incident.openedAt}>{dateLabel(incident.openedAt)}</time><span>证据详情 →</span></div></Link>;
}

