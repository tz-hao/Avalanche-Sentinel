import { NextResponse } from "next/server";

export function data<T>(value: T, init?: ResponseInit) {
  return NextResponse.json({ data: value }, init);
}

export function apiError(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, ...(details === undefined ? {} : { details }) } }, { status });
}

export function unexpectedError(error: unknown) {
  // Provider errors can contain connection URLs or credentials; never log the raw object.
  void error;
  console.error("Sentinel API error");
  return apiError(500, "INTERNAL_ERROR", "服务暂时不可用，请稍后重试。");
}
