import React from "react";
import type { IncidentStatus, MonitorStatus, Severity } from "@/contracts/domain";

export type OverallStatus = "HEALTHY" | "DEGRADED" | "CRITICAL" | "UNKNOWN";

interface StatusBadgeProps {
  type: "monitor" | "overall" | "severity" | "incident" | "provenance";
  value: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function StatusBadge({ type, value, size = "md", className = "" }: StatusBadgeProps) {
  let text = value;
  let symbol = "●";
  let colorClasses = "bg-slate-800 text-slate-300 border-slate-700";
  let ariaText = value;

  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs font-mono tracking-tight",
    md: "px-2.5 py-1 text-xs font-medium tracking-wide",
    lg: "px-3 py-1.5 text-sm font-semibold tracking-wide",
  }[size];

  if (type === "overall") {
    switch (value as OverallStatus) {
      case "HEALTHY":
        symbol = "✓";
        text = "正常运行 (HEALTHY)";
        ariaText = "全局状态：正常运行";
        colorClasses = "bg-emerald-950/80 text-emerald-300 border-emerald-700/80";
        break;
      case "DEGRADED":
        symbol = "▲";
        text = "服务降级 (DEGRADED)";
        ariaText = "全局状态：服务降级";
        colorClasses = "bg-amber-950/80 text-amber-300 border-amber-600/80";
        break;
      case "CRITICAL":
        symbol = "✕";
        text = "危险告警 (CRITICAL)";
        ariaText = "全局状态：危险告警";
        colorClasses = "bg-rose-950/90 text-rose-300 border-rose-600/90";
        break;
      default:
        symbol = "?";
        text = "状态未知 (UNKNOWN)";
        ariaText = "全局状态：未知";
        colorClasses = "bg-slate-800 text-slate-300 border-slate-600";
    }
  } else if (type === "monitor") {
    switch (value as MonitorStatus) {
      case "HEALTHY":
        symbol = "✓";
        text = "正常 / HEALTHY";
        ariaText = "监控状态：正常";
        colorClasses = "bg-emerald-950/60 text-emerald-300 border-emerald-800/80";
        break;
      case "DEGRADED":
        symbol = "▲";
        text = "降级 / DEGRADED";
        ariaText = "监控状态：降级";
        colorClasses = "bg-amber-950/60 text-amber-300 border-amber-700/80";
        break;
      case "DOWN":
        symbol = "✕";
        text = "离线 / DOWN";
        ariaText = "监控状态：离线";
        colorClasses = "bg-rose-950/80 text-rose-300 border-rose-700";
        break;
      default:
        symbol = "?";
        text = "未知 / UNKNOWN";
        ariaText = "监控状态：未知";
        colorClasses = "bg-slate-800 text-slate-400 border-slate-700";
    }
  } else if (type === "severity") {
    switch (value as Severity) {
      case "CRITICAL":
        symbol = "CRIT";
        text = "高危 / CRITICAL";
        ariaText = "严重等级：高危";
        colorClasses = "bg-rose-950 text-rose-300 border-rose-600 shadow-sm shadow-rose-950/50";
        break;
      case "WARNING":
        symbol = "WARN";
        text = "警告 / WARNING";
        ariaText = "严重等级：警告";
        colorClasses = "bg-amber-950/80 text-amber-300 border-amber-600/80";
        break;
      case "INFO":
        symbol = "INFO";
        text = "提示 / INFO";
        ariaText = "严重等级：提示";
        colorClasses = "bg-sky-950/70 text-sky-300 border-sky-700/70";
        break;
    }
  } else if (type === "incident") {
    switch (value as IncidentStatus) {
      case "OPEN":
        symbol = "●";
        text = "待处置 / OPEN";
        ariaText = "事件状态：待处置";
        colorClasses = "bg-rose-950/70 text-rose-200 border-rose-700";
        break;
      case "ACKNOWLEDGED":
        symbol = "◐";
        text = "已确认 / ACKNOWLEDGED";
        ariaText = "事件状态：已确认";
        colorClasses = "bg-sky-950/70 text-sky-200 border-sky-700";
        break;
      case "RECOVERED":
        symbol = "○";
        text = "已恢复 / RECOVERED";
        ariaText = "事件状态：已恢复";
        colorClasses = "bg-emerald-950/70 text-emerald-200 border-emerald-800";
        break;
    }
  } else if (type === "provenance") {
    symbol = "SRC";
    text = `来源: ${value.toUpperCase()}`;
    ariaText = `证据来源：${value}`;
    colorClasses = "bg-indigo-950/60 text-indigo-300 border-indigo-800/80 font-mono";
  }

  return (
    <span
      role="status"
      aria-label={ariaText}
      className={`inline-flex items-center gap-1.5 rounded border ${colorClasses} ${sizeClasses} ${className}`}
    >
      <span aria-hidden="true" className="font-mono font-bold opacity-80 select-none">
        [{symbol}]
      </span>
      <span>{text}</span>
    </span>
  );
}
