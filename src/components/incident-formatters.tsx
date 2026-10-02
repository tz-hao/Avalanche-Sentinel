import React from "react";

// Known Chinese translations for monitors, severity, status, and provenance
export const MONITOR_TYPE_CHINESE: Record<string, string> = {
  RPC_HEALTH: "RPC 节点健康",
  TREASURY: "金库大额异动",
  ADMIN: "特权与合约升级",
  ICM_DELIVERY: "ICM 跨链消息交付",
  CUSTOM_EVENT: "自定义事件阈值",
  VALIDATOR_HEALTH: "验证节点健康",
};

export const SEVERITY_CHINESE: Record<string, string> = {
  CRITICAL: "高危",
  WARNING: "警告",
  INFO: "提示",
};

export const STATUS_CHINESE: Record<string, string> = {
  OPEN: "待处置",
  ACKNOWLEDGED: "已确认",
  RECOVERED: "已恢复",
};

export const PROVENANCE_CHINESE: Record<string, string> = {
  rpc: "RPC 节点巡检",
  log: "链上事件日志",
  icm: "ICM 跨链通信",
  demo: "合成演示数据",
  manual: "人工录入",
};

export const EVENT_TYPE_CHINESE: Record<string, string> = {
  DETECTED: "首次检出",
  DETECTED_AGAIN: "再次触发",
  ACKNOWLEDGED: "已确认处置",
  RECOVERED: "状态已恢复",
  DELIVERED: "目标链已接收",
  ICM_DELIVERY_PENDING: "ICM 跨链交付等待中",
  TREASURY_OUTFLOW: "金库大额流出",
  ADMIN_EVENT: "特权或合约升级事件",
  RPC_CHAIN_MISMATCH: "RPC Chain ID 不匹配",
  RPC_LATENCY: "RPC 延迟过高",
  RPC_FAILURE: "RPC 持续不可用",
  CUSTOM_EVENT: "自定义事件阈值命中",
  VALIDATOR_UNHEALTHY: "验证节点不可用",
  DEMO_CREATED: "演示数据创建",
};

export function formatMonitorType(type?: string | null) {
  if (!type) return "未提供";
  const name = MONITOR_TYPE_CHINESE[type];
  return name ? `${name} (${type})` : type;
}

export function formatSeverity(severity: string) {
  const name = SEVERITY_CHINESE[severity];
  return name ? `${name} (${severity})` : severity;
}

export function formatStatus(status: string) {
  const name = STATUS_CHINESE[status];
  return name ? `${name} (${status})` : status;
}

export function formatProvenance(prov: string) {
  const name = PROVENANCE_CHINESE[prov];
  return name ? `${name} (${prov})` : prov;
}

export function formatDeliveryStatus(val: string) {
  if (val === "DELIVERED") return "已送达 (DELIVERED)";
  if (val === "PENDING") return "等待接收 (PENDING)";
  if (val === "NOT_OBSERVED") return "未观测到 (NOT_OBSERVED)";
  return val;
}

export function formatExecutionStatus(val: string) {
  if (val === "FAILED") return "执行失败 (FAILED)";
  if (val === "SUCCESS") return "执行成功 (SUCCESS)";
  if (val === "PENDING") return "等待执行 (PENDING)";
  if (val === "NOT_OBSERVED") return "未观测到 (NOT_OBSERVED)";
  return val;
}

// ----------------------------------------------------
// Title Explanation & Dual Display
// ----------------------------------------------------
const KNOWN_TITLE_MAP: Record<string, string> = {
  "ICM Delivery Pending": "ICM 跨链交付等待中",
  "ICM Delivery Timeout": "ICM 跨链交付超时",
  "ICM Delivery Delayed": "ICM 跨链交付延迟",
  "Treasury Outflow": "金库资产大额流出",
  "Treasury Transfer": "金库大额转账异动",
  "Treasury Native Outflow": "金库原生代币大额流出",
  "Treasury": "金库大额异动",
  "Treasury Transfer Threshold Exceeded": "金库转出金额超过配置阈值",
  "Admin": "特权变更或合约升级",
  "Admin Event": "管理特权变更事件",
  "Upgrade Event": "合约逻辑代理升级事件",
  "Admin or Upgrade Event": "特权变更或合约升级事件",
  "Ownership Transfer": "特权所有权移交事件",
  "Ownership Transferred": "特权所有权移交事件",
  "RPC_UNAVAILABLE": "RPC 节点服务不可用",
  "RPC Unavailable": "RPC 节点服务不可用",
  "Demo Incident": "演示模式合成事件",
  "Validator Health Unavailable": "验证节点健康检查不可用",
};

export function resolveTitleExplanation(title: string): string | null {
  if (!title) return null;
  // If already contains Chinese characters, no additional translation needed
  if (/[\u4e00-\u9fa5]/.test(title)) return null;

  if (KNOWN_TITLE_MAP[title]) {
    return KNOWN_TITLE_MAP[title];
  }

  // Prefix/Pattern matching
  if (/^ICM Delivery Pending/i.test(title)) {
    return "ICM 跨链交付等待中";
  }
  if (/^Treasury\s+Outflow/i.test(title)) {
    return "金库资产大额流出";
  }
  if (/^Admin\b/i.test(title)) {
    return "特权变更或合约升级事件";
  }

  return null;
}

export function formatIncidentTitle(title?: string | null): React.ReactNode {
  if (!title) return "—";
  const zh = resolveTitleExplanation(title);
  if (!zh) return title;
  return (
    <span className="incident-title-dual">
      <span className="title-zh">{zh}</span>{" "}
      <span className="title-raw text-slate-400 font-normal">
        (<span>{title}</span>)
      </span>
    </span>
  );
}

// ----------------------------------------------------
// Rule Explanation & Dual Display
// ----------------------------------------------------
const KNOWN_RULE_MAP: Record<string, string> = {
  "ICM delivery observation": "ICM 跨链交付状态观测",
  "Teleporter ReceiveCrossChainMessage observed": "已观测到 Teleporter 跨链接收存证",
  "TREASURY_TRANSFER_THRESHOLD": "金库转出金额超过配置阈值",
  "Transfer": "代币转账事件",
  "Ownership / Role / Upgrade event": "特权所有权 / 角色授权 / 逻辑合约升级事件",
  "Ownership": "特权所有权变更事件",
  "Upgrade": "逻辑合约升级事件",
  "RPC chain ID must match configured chain": "RPC 节点 Chain ID 与配置目标链不匹配",
  "RPC_UNAVAILABLE": "RPC 节点服务不可用",
  "validator health endpoint unavailable": "验证节点健康检查端点不可用",
  "Demo Mode synthetic incident": "演示模式合成事件快照",
  "M5B_WEBHOOK_ACCEPTANCE": "验收测试 Webhook 事件规则",
};

export function resolveRuleExplanation(rule: string): string | null {
  if (!rule) return null;
  // If already contains Chinese, do not dual-wrap
  if (/[\u4e00-\u9fa5]/.test(rule)) return null;

  if (KNOWN_RULE_MAP[rule]) {
    return KNOWN_RULE_MAP[rule];
  }

  // Pattern matching
  if (/^ICM delivery pending\s*>=\s*/i.test(rule)) {
    return "ICM 跨链交付等待超过观测窗口";
  }
  if (/^native\s+outflow\s*>/i.test(rule)) {
    return "原生代币 (AVAX) 转出金额超过配置阈值";
  }
  const tokenOutflowMatch = rule.match(/^([A-Za-z0-9_]+)\s+outflow\s*>\s*(.+)$/i);
  if (tokenOutflowMatch) {
    return `${tokenOutflowMatch[1]} 资产转出金额超过配置阈值`;
  }
  if (/^RPC latency\s*>\s*/i.test(rule)) {
    return "RPC 响应延迟超过配置阈值";
  }
  if (/^RPC consecutive failures\s*>=\s*/i.test(rule)) {
    return "RPC 连续请求失败次数达到阈值";
  }

  return null;
}

export function formatIncidentRule(rule?: string | null): React.ReactNode {
  if (!rule) return "—";
  const zh = resolveRuleExplanation(rule);
  if (!zh) return rule;
  return (
    <span className="rule-dual-display">
      <span className="rule-zh">{zh}</span>{" "}
      <span className="rule-raw text-xs opacity-75 font-mono">
        (<span>{rule}</span>)
      </span>
    </span>
  );
}

// ----------------------------------------------------
// Timeline Event Message Explanation & Dual Display
// ----------------------------------------------------
const KNOWN_MESSAGE_MAP: Record<string, string> = {
  "Destination delivery not observed within configured observation window. Investigate delivery path.":
    "在配置的观测窗口内未观测到目标链接收存证，请排查交付路径。",
  "Ownership": "检测到特权所有权变更事件，请核查操作意图与权限变更。",
  "Ownership / Role / Upgrade event": "检测到特权所有权、角色授权或逻辑合约升级事件，请核对操作人。",
  "Admin event": "检测到管理员特权变更事件，请人工复核。",
  "Contract implementation upgraded": "合约逻辑实现升级事件，请复核新实现地址与审计记录。",
  "Transfer": "捕获到代币转账异动事件。",
  "Large transfer detected": "首次捕获到大额转账异动，已记录存证。",
  "Treasury outflow exceeded threshold": "金库资产流出金额超过配置阈值。",
  "RPC failure": "RPC 节点健康探测失败，请检查网络或节点可用性。",
  "RPC unavailable": "RPC 节点服务不可用，请核对节点 RPC 端点。",
  "RPC chain ID mismatch": "RPC 节点返回的 Chain ID 与配置不匹配。",
};

export function resolveMessageExplanation(message: string): string | null {
  if (!message) return null;
  // If already contains Chinese, it is already clear to Chinese users
  if (/[\u4e00-\u9fa5]/.test(message)) return null;

  if (KNOWN_MESSAGE_MAP[message]) {
    return KNOWN_MESSAGE_MAP[message];
  }

  // Pattern matching
  if (/^Destination delivery not observed/i.test(message)) {
    return "在配置的观测窗口内未观测到目标链接收存证，请排查交付路径。";
  }

  return null;
}

export function formatTimelineMessage(message?: string | null): React.ReactNode {
  if (!message) return "—";
  const zh = resolveMessageExplanation(message);
  if (!zh) return message;
  return (
    <span className="timeline-message-dual">
      <span className="message-zh">{zh}</span>{" "}
      <span className="message-raw text-xs text-slate-400 font-mono">
        (<span>{message}</span>)
      </span>
    </span>
  );
}

// ----------------------------------------------------
// Event Type Formatter
// ----------------------------------------------------
export function formatEventType(type: string): React.ReactNode {
  const zh = EVENT_TYPE_CHINESE[type];
  if (!zh) return type;
  return (
    <span className="event-type-dual">
      <span>{zh}</span>{" "}
      <span className="mono text-xs opacity-75 font-normal">
        (<span>{type}</span>)
      </span>
    </span>
  );
}
