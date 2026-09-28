"use client";

import {displaySafe} from "./display-safety";
import React, { useState } from "react";
import type { IncidentEventRecord } from "@/contracts/domain";

interface TimelineViewerProps {
  events?: IncidentEventRecord[];
}

function getEventTypeMeta(type: string) {
  switch (type) {
    case "DETECTED":
      return {
        label: "首次检出 (DETECTED)",
        icon: "⚡",
        color: "text-rose-400 border-rose-700 bg-rose-950/60",
      };
    case "DETECTED_AGAIN":
      return {
        label: "再次触发 (DETECTED_AGAIN)",
        icon: "↻",
        color: "text-rose-300 border-rose-800 bg-rose-950/40",
      };
    case "ACKNOWLEDGED":
      return {
        label: "已确认处置 (ACKNOWLEDGED)",
        icon: "✓",
        color: "text-sky-300 border-sky-700 bg-sky-950/60",
      };
    case "RECOVERED":
      return {
        label: "状态已恢复 (RECOVERED)",
        icon: "●",
        color: "text-emerald-300 border-emerald-700 bg-emerald-950/60",
      };
    case "DELIVERED":
      return {
        label: "目标链已接收 (DELIVERED，执行结果另见证据)",
        icon: "⇄",
        color: "text-cyan-300 border-cyan-700 bg-cyan-950/60",
      };
    default:
      return {
        label: type,
        icon: "•",
        color: "text-slate-300 border-slate-700 bg-slate-800",
      };
  }
}

export function TimelineViewer({ events = [] }: TimelineViewerProps) {
  const [expandedEventIds, setExpandedEventIds] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedEventIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (!events.length) {
    return (
      <div className="p-6 text-center text-xs text-slate-400 border border-slate-800 rounded-lg bg-slate-900/30">
        暂无时间线记录
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
        <span className="text-cyan-400 font-mono">⏱</span>
        <span>事件演进时间线 (Incident Timeline)</span>
        <span className="text-xs font-normal text-slate-400 font-mono">
          ({events.length} 个节点)
        </span>
      </h3>

      <div className="relative pl-6 border-l-2 border-slate-800 space-y-6">
        {events.map((event, index) => {
          const meta = getEventTypeMeta(event.type);
          const isExpanded = !!expandedEventIds[event.id];

          return (
            <div key={event.id || index} className="relative group">
              {/* Timeline marker icon */}
              <div
                className={`absolute -left-[31px] top-1 w-6 h-6 rounded-full border flex items-center justify-center text-xs font-bold ${meta.color}`}
                aria-hidden="true"
              >
                {meta.icon}
              </div>

              {/* Event card */}
              <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800 group-hover:border-slate-700 transition-colors">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <span
                    className={`inline-block px-2 py-0.5 text-xs font-semibold rounded border ${meta.color}`}
                  >
                    {meta.label}
                  </span>
                  <div className="text-xs text-slate-400 font-mono">
                    {new Date(event.createdAt).toLocaleString("zh-CN", { hour12: false })}
                  </div>
                </div>

                <p className="text-sm text-slate-200 mt-1">{event.message}</p>

                {/* Optional Expandable Snapshot */}
                {event.evidence && (
                  <div className="mt-3 pt-2 border-t border-slate-800/80">
                    <button
                      type="button"
                      onClick={() => toggleExpand(event.id)}
                      className="text-xs text-cyan-400 hover:text-cyan-300 font-mono inline-flex items-center gap-1"
                    >
                      <span>{isExpanded ? "收起节点存证快照 ▲" : "查看节点存证快照 ▼"}</span>
                    </button>

                    {isExpanded && (
                      <div className="mt-2 p-3 bg-slate-950 rounded border border-slate-800 font-mono text-xs text-slate-300">
                        {event.evidence.txHash && (
                          <div className="mb-1 text-slate-400">
                            TxHash:{" "}
                            <span className="text-slate-200 break-all">
                              {event.evidence.txHash}
                            </span>
                          </div>
                        )}
                        <pre className="text-[11px] text-cyan-200/80 overflow-x-auto">
                          {JSON.stringify(displaySafe(event.evidence.facts || {}), null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
