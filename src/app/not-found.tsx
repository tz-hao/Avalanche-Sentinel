import React from "react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center text-2xl font-mono text-cyan-400 mb-4 shadow-lg">
        404
      </div>
      <h1 className="text-xl font-bold text-slate-100 mb-2">
        页面未找到 (404)
      </h1>
      <p className="text-xs text-slate-400 max-w-md mb-6 font-mono">
        请求的安全运营路径不存在或资源已被归档移除。
      </p>
      <div className="flex items-center gap-3">
        <Link
          href="/overview"
          className="px-4 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-md transition-colors"
        >
          返回安全总览
        </Link>
        <Link
          href="/incidents"
          className="px-4 py-2 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md transition-colors"
        >
          查看事件列表
        </Link>
      </div>
    </div>
  );
}
