// Presentation-only redaction; never changes the persisted Evidence snapshot.
export function displaySafe(value: unknown, key = ""): unknown {
  if (/password|secret|api.?key|bot.?token|authorization|cookie/i.test(key)) return "[REDACTED]";
  if (/rpc.?url|health.?url|endpoint/i.test(key)) return "[ENDPOINT REDACTED]";
  if (typeof value === "string") return value.replace(/(?:https?|postgres(?:ql)?):\/\/[^\s"<>]+/gi, "[URL REDACTED]");
  if (Array.isArray(value)) return value.map(item => displaySafe(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([name,item]) => [name,displaySafe(item,name)]));
  return value;
}
