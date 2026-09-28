import React from "react";
import type { Metadata } from "next";
import "@/styles/globals.css";
import { AppShell } from "@/components/Navigation";
export const metadata: Metadata = { title:"Avalanche Sentinel · 安全运营与证据复盘", description:"Avalanche Fuji 只读监控与可追溯证据工作区" };
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="zh-CN"><body><AppShell>{children}</AppShell></body></html>;
}
