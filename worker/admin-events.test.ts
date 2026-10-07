import { describe, expect, it } from "vitest";
import { encodeEventTopics, type Hex } from "viem";
import { adminAbi, decodeAdminEvent } from "./admin-events";

const a = "0xfe5da7aa2775b3f56704e9ad974071763c535713";
const b = "0xdb80e5ff833f38e1b641392b4695d3eac9172d0b";
describe("supported admin ABI decoding (offline fixtures)", () => {
  it("retains previous and new owners from indexed topics", () => {
    const topics = encodeEventTopics({ abi: adminAbi, eventName: "OwnershipTransferred", args: { previousOwner: a, newOwner: b } }) as Hex[];
    const result = decodeAdminEvent("0x", topics);
    expect(result.eventName).toBe("OwnershipTransferred");
    expect(JSON.stringify(result.decodedArgs).toLowerCase()).toContain(a);
    expect(JSON.stringify(result.decodedArgs).toLowerCase()).toContain(b);
    expect(() => decodeAdminEvent("0x", topics.slice(0,1))).toThrow();
  });
  it("decodes granted/revoked roles and upgrades without treating Transfer as admin", () => {
    for (const eventName of ["RoleGranted", "RoleRevoked"] as const) {
      const role = ("0x" + "12".repeat(32)) as Hex;
      const topics = encodeEventTopics({ abi: adminAbi, eventName, args: { role, account: a, sender: b } }) as Hex[];
      expect(decodeAdminEvent("0x", topics)).toMatchObject({ eventName, decodedArgs: { role } });
    }
    const topics = encodeEventTopics({ abi: adminAbi, eventName: "Upgraded", args: { implementation: a } }) as Hex[];
    expect(decodeAdminEvent("0x", topics).eventName).toBe("Upgraded");
    expect(() => decodeAdminEvent("0x", [("0x" + "00".repeat(32)) as Hex])).toThrow();
  });
});
