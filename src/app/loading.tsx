import React from "react";
import { LoadingState } from "@/components/StateFeedback";

export default function Loading() {
  return (
    <div className="py-16">
      <LoadingState message="安全运营中心正在初始化路由与数据通道..." />
    </div>
  );
}
