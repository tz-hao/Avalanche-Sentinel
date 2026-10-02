"use client";

import React, { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log unexpected frontend errors
    console.error("Frontend Boundary Error:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <div className="w-16 h-16 rounded-full bg-rose-950/80 border border-rose-600 flex items-center justify-center text-2xl font-mono text-rose-400 mb-4 shadow-lg">
        ✕
      </div>
      <h1 className="text-xl font-bold text-slate-100 mb-2">
        系统前端运行异常
      </h1>
      <p className="text-xs text-rose-300 max-w-lg mb-6 font-mono break-all p-3 rounded bg-slate-900 border border-slate-800">
        {error.message || "前端渲染过程中发生意外错误，请尝试重新加载。"}
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="px-4 py-2 text-xs font-semibold text-slate-950 bg-rose-400 hover:bg-rose-300 rounded-md transition-colors"
        >
          重试渲染
        </button>
        <Link
          href="/overview"
          className="px-4 py-2 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md transition-colors"
        >
          返回总览页
        </Link>
      </div>
    </div>
  );
}
