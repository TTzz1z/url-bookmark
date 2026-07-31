import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { fetch } from "undici";
import { AppError } from "@/lib/errors";

const blockedIpv4 = new BlockList();
[
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
].forEach(([network, prefix]) =>
  blockedIpv4.addSubnet(network as string, prefix as number, "ipv4"),
);

const blockedIpv6 = new BlockList();
[
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:2::", 48],
  ["2001:10::", 28],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
].forEach(([network, prefix]) =>
  blockedIpv6.addSubnet(network as string, prefix as number, "ipv6"),
);

const proxyFakeIpv4 = new BlockList();
proxyFakeIpv4.addSubnet("198.18.0.0", 15, "ipv4");

const blockedHostnames = new Set([
  "localhost",
  "localhost.localdomain",
  "instance-data",
  "metadata",
  "metadata.google.internal",
  "metadata.azure.internal",
]);

export type NormalizedUrl = {
  originalUrl: string;
  normalizedUrl: string;
  url: URL;
  domain: string;
};

export type SafeAddress = {
  address: string;
  family: 4 | 6;
};

type AddressResolver = (
  hostname: string,
) => Promise<Array<{ address: string; family: number }>>;

type DnsJsonResponse = {
  Status?: number;
  Answer?: Array<{
    type?: number;
    data?: string;
  }>;
};

const resolveAllAddresses: AddressResolver = (hostname) =>
  lookup(hostname, {
    all: true,
    verbatim: true,
  });

const DOH_PROVIDERS = [
  "https://cloudflare-dns.com/dns-query",
  "https://dns.google/resolve",
] as const;

async function queryDoh(
  endpoint: string,
  hostname: string,
  recordType: "A" | "AAAA",
): Promise<SafeAddress[]> {
  const url = new URL(endpoint);
  url.searchParams.set("name", hostname);
  url.searchParams.set("type", recordType);
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(4_000),
    headers: {
      Accept: "application/dns-json",
      "User-Agent": "BookmarkReader/1.0 (secure DNS fallback)",
    },
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`DoH HTTP ${response.status}`);
  }
  const declaredLength = Number.parseInt(
    response.headers.get("content-length") ?? "",
    10,
  );
  if (Number.isFinite(declaredLength) && declaredLength > 64 * 1024) {
    await response.body?.cancel();
    throw new Error("DoH response is too large");
  }
  const bodyText = await response.text();
  if (bodyText.length > 64 * 1024) {
    throw new Error("DoH response is too large");
  }
  const body = JSON.parse(bodyText) as DnsJsonResponse;
  if (body.Status !== 0) {
    throw new Error(`DoH status ${body.Status ?? "unknown"}`);
  }
  return (body.Answer ?? [])
    .flatMap((answer) => {
      if (typeof answer.data !== "string") {
        return [];
      }
      const family = isIP(answer.data);
      if (
        (answer.type === 1 && family === 4) ||
        (answer.type === 28 && family === 6)
      ) {
        return [{ address: answer.data, family }] as SafeAddress[];
      }
      return [];
    });
}

async function resolveAddressesThroughDoh(
  hostname: string,
): Promise<SafeAddress[]> {
  for (const provider of DOH_PROVIDERS) {
    const results = await Promise.allSettled([
      queryDoh(provider, hostname, "A"),
      queryDoh(provider, hostname, "AAAA"),
    ]);
    const addresses = results.flatMap((result) =>
      result.status === "fulfilled" ? result.value : [],
    );
    if (addresses.length > 0) {
      return Array.from(
        new Map(
          addresses.map((address) => [
            `${address.family}:${address.address}`,
            address,
          ]),
        ).values(),
      );
    }
  }
  throw new Error("All DoH providers failed");
}

function allowTestLoopback(): boolean {
  return (
    process.env.ALLOW_TEST_LOOPBACK === "1" &&
    process.env.NODE_ENV !== "production"
  );
}

export function normalizeUrl(rawInput: string): NormalizedUrl {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new AppError("INVALID_URL", "请输入要收藏的网址");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new AppError("INVALID_URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new AppError("UNSUPPORTED_PROTOCOL");
  }
  if (parsed.username || parsed.password) {
    throw new AppError("INVALID_URL", "网址不能包含用户名或密码");
  }

  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLocaleLowerCase();
  if (
    (parsed.protocol === "http:" && parsed.port === "80") ||
    (parsed.protocol === "https:" && parsed.port === "443")
  ) {
    parsed.port = "";
  }

  return {
    originalUrl: trimmed,
    normalizedUrl: parsed.toString(),
    url: parsed,
    domain: parsed.hostname,
  };
}

export function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname
    .toLocaleLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (allowTestLoopback() && (normalized === "127.0.0.1" || normalized === "::1")) {
    return false;
  }
  return (
    blockedHostnames.has(normalized) ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  );
}

export function isBlockedIp(address: string): boolean {
  const normalized = address.replace(/^\[|\]$/g, "").split("%")[0];
  if (allowTestLoopback() && (normalized === "127.0.0.1" || normalized === "::1")) {
    return false;
  }
  const family = isIP(normalized);
  if (family === 4) {
    return blockedIpv4.check(normalized, "ipv4");
  }
  if (family === 6) {
    return blockedIpv6.check(normalized, "ipv6");
  }
  return true;
}

export function isProxyFakeIp(address: string): boolean {
  const normalized = address.replace(/^\[|\]$/g, "").split("%")[0];
  return isIP(normalized) === 4 && proxyFakeIpv4.check(normalized, "ipv4");
}

export async function resolveSafeAddresses(
  url: URL,
  resolver: AddressResolver = resolveAllAddresses,
  fakeIpResolver: AddressResolver = resolveAddressesThroughDoh,
): Promise<SafeAddress[]> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AppError("UNSUPPORTED_PROTOCOL");
  }
  if (isBlockedHostname(url.hostname)) {
    throw new AppError("PRIVATE_NETWORK_BLOCKED");
  }

  const literalFamily = isIP(url.hostname.replace(/^\[|\]$/g, ""));
  if (literalFamily === 4 || literalFamily === 6) {
    const literal = url.hostname.replace(/^\[|\]$/g, "");
    if (isBlockedIp(literal)) {
      throw new AppError("PRIVATE_NETWORK_BLOCKED");
    }
    return [{ address: literal, family: literalFamily }];
  }

  let addresses: SafeAddress[];
  try {
    const resolved = await resolver(url.hostname);
    addresses = resolved
      .filter((item) => item.family === 4 || item.family === 6)
      .map((item) => ({
        address: item.address,
        family: item.family as 4 | 6,
      }));
  } catch {
    throw new AppError("DNS_FAILED");
  }
  if (addresses.length === 0) {
    throw new AppError("DNS_FAILED");
  }
  if (addresses.every((item) => isProxyFakeIp(item.address))) {
    try {
      const resolved = await fakeIpResolver(url.hostname);
      addresses = resolved
        .filter((item) => item.family === 4 || item.family === 6)
        .map((item) => ({
          address: item.address,
          family: item.family as 4 | 6,
        }));
    } catch {
      throw new AppError(
        "DNS_FAILED",
        "检测到代理 Fake-IP，但无法通过可信 DNS 获取目标公网地址",
      );
    }
    if (addresses.length === 0) {
      throw new AppError("DNS_FAILED");
    }
  }
  if (addresses.some((item) => isBlockedIp(item.address))) {
    throw new AppError("PRIVATE_NETWORK_BLOCKED");
  }
  return addresses;
}
