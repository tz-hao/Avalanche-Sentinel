// @vitest-environment jsdom
import React from "react";
import {afterEach,describe,expect,it} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
import {displaySafe} from "./display-safety";
import {monitorEnvironment,chainLabel} from "./ForensicUI";
import {EvidenceViewer} from "./EvidenceViewer";
import type {MonitorRecord} from "@/contracts/domain";

afterEach(cleanup);
describe("Sentinel Forensic UI evidence boundaries",()=>{
 it("redacts credential URLs and secrets without changing source evidence",()=>{
  const input={rpcUrl:"https://private.invalid/key",tokenDecimals:6,asset:"USDC",rawAmount:"20000000",apiKey:"sensitive",nested:{message:"postgresql://user:password@db.invalid/database"}};
  const safe=displaySafe(input);
  expect(safe).toEqual({rpcUrl:"[ENDPOINT REDACTED]",tokenDecimals:6,asset:"USDC",rawAmount:"20000000",apiKey:"[REDACTED]",nested:{message:"[URL REDACTED]"}});
  expect(input.rpcUrl).toBe("https://private.invalid/key");
 });
 it("does not claim Mainnet for the verified Fuji chain",()=>{
  expect(chainLabel("43113","DB Acceptance Fuji")).toBe("Avalanche Fuji C-Chain");
  expect(chainLabel("1","Other configured chain")).toBe("Other configured chain");
 });
 it("labels monitor metadata without assuming Production",()=>{
  const m:MonitorRecord={id:"test-monitor",type:"RPC_HEALTH",chainId:"fuji",intervalSec:30,enabled:false,status:"UNKNOWN",config:{acceptance:true},chain:{id:"fuji",name:"Fuji",chainId:"43113"}};
  expect(monitorEnvironment(m)).toBe("ACCEPTANCE");
  expect(monitorEnvironment({...m,config:{production:true}})).toBe("PRODUCTION");
  expect(monitorEnvironment({...m,config:{}})).toBe("UNCLASSIFIED");
 });
 it("keeps delivery and failed execution as separate evidence facts",()=>{
  render(React.createElement(EvidenceViewer,{evidence:{chainId:"43113",chainName:"Fuji",rule:"ICM delivery observation",observedAt:"2026-09-27T00:00:00Z",provenance:"icm",facts:{deliveryStatus:"DELIVERED",executionStatus:"FAILED"}}}));
  expect(screen.getByText("DELIVERED")).toBeDefined();
  expect(screen.getByText("FAILED")).toBeDefined();
  expect(screen.getByText(/当前 API 未提供服务端存证哈希/)).toBeDefined();
  expect(screen.queryByText(/Relayer failed/)).toBeNull();
 });
});
