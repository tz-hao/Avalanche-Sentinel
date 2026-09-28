"use client";
import React, {useEffect, useState} from "react";
import Link from "next/link";
import type {Route} from "next";
import {usePathname,useRouter} from "next/navigation";
import {sentinelApi} from "@/lib/sentinel-api";
import type {MonitorRecord} from "@/contracts/domain";
import {Icon,SentinelMark,dateLabel,chainLabel} from "./ForensicUI";

export function SystemStatusRail() {
  const pathname=usePathname();
  const [snapshot,setSnapshot]=useState<{path:string;monitors:MonitorRecord[]}|null>(null);
  useEffect(()=>{let cancelled=false;sentinelApi.monitors().then(r=>{if(!cancelled)setSnapshot({path:pathname,monitors:r.data.monitors});}).catch(()=>{if(!cancelled)setSnapshot(null);});return()=>{cancelled=true;};},[pathname]);
  const current=snapshot?.path===pathname?snapshot.monitors.find(m=>m.enabled&&m.config.production===true):undefined;
  return <div className="system-rail" aria-label="系统状态"><span className="rail-label"><Icon name="pulse"/>只读观测 / READ ONLY</span><span>{current?chainLabel(current.chain.chainId,current.chain.name):"Network: —"}</span><span className="rail-secondary">Chain ID <b className="mono">{current?.chain.chainId??"—"}</b></span><span className="rail-secondary">Latest Block <b className="mono">—</b></span><span className="rail-update" title={current?.lastCheckAt??undefined}>Last Check: {dateLabel(current?.lastCheckAt)}</span><span className="rail-secondary">Worker: 状态未提供</span></div>;
}
export function Navigation() {
  const pathname=usePathname(),router=useRouter();
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(false);
  if(pathname==="/login")return null;
  const items:Array<{href:Route;label:string;icon:string}>=[{href:"/overview",label:"运营总览",icon:"grid"},{href:"/monitors",label:"监控项目",icon:"pulse"},{href:"/incidents",label:"安全事件",icon:"file"}];
  async function logout(){setBusy(true);setError(false);try{await sentinelApi.logout();router.push("/login");}catch{setError(true);}finally{setBusy(false);}}
  return <><div className="mobile-bar"><Link href="/overview" className="brand"><SentinelMark/><span>Avalanche Sentinel</span></Link><button aria-label="切换导航菜单" aria-expanded={open} aria-controls="sentinel-sidebar" onClick={()=>setOpen(!open)}><Icon name="menu"/></button></div>{open&&<button className="drawer-backdrop" aria-label="关闭导航菜单" onClick={()=>setOpen(false)}/>}<aside id="sentinel-sidebar" className={`sidebar ${open?"sidebar-open":""}`} onKeyDown={e=>{if(e.key==="Escape")setOpen(false);}}><Link href="/overview" className="brand" aria-label="Avalanche Sentinel 首页" onClick={()=>setOpen(false)}><SentinelMark/><span>Avalanche<br/>Sentinel<small>SECURITY OPERATIONS</small></span></Link><p className="sidebar-caption">监测链上状态<br/>从可验证的证据开始</p><nav aria-label="主导航">{items.map(x=><Link key={x.href} href={x.href} aria-current={pathname.startsWith(x.href)?"page":undefined} onClick={()=>setOpen(false)}><Icon name={x.icon}/><span>{x.label}</span></Link>)}</nav><div className="sidebar-foot"><p>FUJI · READ ONLY</p><p>SENTINEL CONSOLE</p><span>SECURE AVALANCHE<br/>TOGETHER</span><button onClick={logout} disabled={busy} aria-label="退出登录">{busy?"正在退出...":"退出登录"}</button>{error&&<p role="alert">退出失败，请重试。</p>}</div></aside></>;
}
export function AppShell({children}:{children:React.ReactNode}) {
  const pathname=usePathname();
  if(pathname==="/login")return <main id="main-content" className="login-main">{children}</main>;
  return <div className="app-shell"><a className="skip-link" href="#main-content">跳至主要内容</a><Navigation/><div className="app-body"><SystemStatusRail/><main id="main-content" className="main-content">{children}</main><footer className="app-footer">TRUST THE EVIDENCE. MONITOR THE CHAIN.<span>Avalanche Sentinel · Read-only chain observation</span></footer></div></div>;
}
