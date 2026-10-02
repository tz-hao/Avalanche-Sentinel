"use client";

import React, { useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { sentinelApi, SentinelApiError } from "@/lib/sentinel-api";
import { SentinelMark, Icon } from "@/components/ForensicUI";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setErrorMessage("请输入管理员口令。");
      return;
    }

    setErrorMessage(null);
    setSubmitting(true);

    try {
      await sentinelApi.login(password);
      router.push("/overview" as Route);
    } catch (err) {
      if (err instanceof SentinelApiError) {
        if (err.status === 503 || err.code === "AUTH_NOT_CONFIGURED") {
          setErrorMessage("系统配置错误：管理员服务尚未配置 (SENTINEL_ADMIN_PASSWORD 缺失)。请先完成服务端配置。");
          return;
        }
        setErrorMessage(err.message);
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("登录验证失败，请重试。");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="login-screen"><section className="login-brand"><div className="brand"><SentinelMark/><span>Avalanche<br/>Sentinel</span></div><p className="eyebrow">链上观测 · 存证优先</p><h1>以链上证据为凭<span>持续监控区块链</span></h1><p className="muted">守望链上状态，让每一次判断都有证据可循。</p><p className="eyebrow">FUJI 测试网 · 只读模式</p></section><section className="login-card" aria-labelledby="access-title"><Icon/><p className="eyebrow">受保护管理控制台</p><h2 id="access-title">管理员访问认证</h2><p className="muted">单管理员认证 · 安全运营工作区</p>{errorMessage&&<div role="alert" aria-live="assertive" className="login-error"><span>{errorMessage}</span></div>}<form noValidate onSubmit={handleLogin}><div><label htmlFor="admin-password">管理员安全口令</label><input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required aria-required="true" aria-invalid={!!errorMessage} placeholder="••••••••••••••••" disabled={submitting}/></div><button type="submit" className="button button-primary" disabled={submitting}>{submitting?"正在验证口令...":"进入监控控制台"}</button></form><p className="login-foot">受保护的安全管理控制台<br/>口令仅用于建立短时 HttpOnly 会话。</p></section></div>;
}
