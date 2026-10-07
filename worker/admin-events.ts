import { decodeEventLog, parseAbi, type Hex } from "viem";

export const adminAbi = parseAbi([
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
  "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)",
  "event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)",
  "event Upgraded(address indexed implementation)",
]);

export function decodeAdminEvent(data: Hex, topics: readonly Hex[]) {
  const decoded = decodeEventLog({ abi: adminAbi, data, topics: topics as [Hex, ...Hex[]], strict: true });
  return { ...decoded.args, eventName: decoded.eventName, decodedArgs: decoded.args };
}
