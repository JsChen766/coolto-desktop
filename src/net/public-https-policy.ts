import { isIP } from "node:net";
import { BlockList } from "node:net";

const PRIVATE = new BlockList();
PRIVATE.addSubnet("0.0.0.0", 8, "ipv4");
PRIVATE.addSubnet("10.0.0.0", 8, "ipv4");
PRIVATE.addSubnet("127.0.0.0", 8, "ipv4");
PRIVATE.addSubnet("169.254.0.0", 16, "ipv4");
PRIVATE.addSubnet("172.16.0.0", 12, "ipv4");
PRIVATE.addSubnet("192.168.0.0", 16, "ipv4");
PRIVATE.addSubnet("224.0.0.0", 4, "ipv4");
PRIVATE.addAddress("255.255.255.255", "ipv4");
PRIVATE.addAddress("::", "ipv6");
PRIVATE.addAddress("::1", "ipv6");
PRIVATE.addSubnet("fc00::", 7, "ipv6");
PRIVATE.addSubnet("fe80::", 10, "ipv6");
PRIVATE.addSubnet("ff00::", 8, "ipv6");

const BLOCKED_SUFFIXES = [
  ".localhost", ".local", ".internal", ".lan", ".home", ".corp", ".private",
];

export function isPrivateOrLocalIp(address: string): boolean {
  const host = address.replace(/^\[|\]$/g, "");
  const version = isIP(host);
  if (version === 4) return PRIVATE.check(host, "ipv4");
  if (version === 6) {
    const mapped = mappedIpv4(host);
    if (mapped) return isPrivateOrLocalIp(mapped);
    return PRIVATE.check(host, "ipv6");
  }
  return true;
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host === "metadata.google.internal") return true;
  return BLOCKED_SUFFIXES.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix));
}

export function assertPublicHttpsUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("只接受完整的 HTTPS 岗位链接");
  }
  if (url.protocol !== "https:") throw new Error("岗位链接只允许 HTTPS");
  if (url.username || url.password) throw new Error("岗位链接不能包含用户名或密码");
  if (isBlockedHostname(url.hostname)) throw new Error("不能抓取内网或本机地址");
  if (isIP(url.hostname.replace(/^\[|\]$/g, "")) && isPrivateOrLocalIp(url.hostname)) {
    throw new Error("不能抓取内网或本机地址");
  }
  return url;
}

function mappedIpv4(address: string): string | undefined {
  const lower = address.toLowerCase();
  if (!lower.startsWith("::ffff:") || !lower.includes(".")) return undefined;
  return address.slice(address.lastIndexOf(":") + 1);
}
