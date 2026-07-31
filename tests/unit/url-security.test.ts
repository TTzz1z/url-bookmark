import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import {
  isBlockedHostname,
  isBlockedIp,
  isProxyFakeIp,
  normalizeUrl,
  resolveSafeAddresses,
} from "@/services/url-security-service";

describe("URL 规范化与 SSRF 防护", () => {
  it("去除空格、fragment、默认端口并统一域名大小写", () => {
    const result = normalizeUrl(
      "  HTTPS://Example.COM:443/文章?q=测试#section  ",
    );
    expect(result.normalizedUrl).toBe(
      "https://example.com/%E6%96%87%E7%AB%A0?q=%E6%B5%8B%E8%AF%95",
    );
    expect(result.domain).toBe("example.com");
  });

  it.each(["", "普通文本", "file:///etc/passwd", "javascript:alert(1)"])(
    "拒绝非法输入 %s",
    (input) => {
      expect(() => normalizeUrl(input)).toThrow(AppError);
    },
  );

  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.8.9",
    "192.168.1.1",
    "169.254.169.254",
    "0.0.0.0",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
  ])("阻止非公网地址 %s", (address) => {
    expect(isBlockedIp(address)).toBe(true);
  });

  it("识别代理 Fake-IP，但仍将其视为不可直接信任的地址", () => {
    expect(isProxyFakeIp("198.18.0.46")).toBe(true);
    expect(isBlockedIp("198.18.0.46")).toBe(true);
    expect(isProxyFakeIp("93.184.216.34")).toBe(false);
  });

  it.each(["localhost", "app.localhost", "metadata.google.internal"])(
    "阻止危险主机名 %s",
    (hostname) => {
      expect(isBlockedHostname(hostname)).toBe(true);
    },
  );

  it("在 DNS 后检查解析结果", async () => {
    await expect(
      resolveSafeAddresses(new URL("http://localhost/resource")),
    ).rejects.toMatchObject({ code: "PRIVATE_NETWORK_BLOCKED" });
  });

  it("DNS 任一解析结果为内网地址时拒绝整个目标", async () => {
    await expect(
      resolveSafeAddresses(
        new URL("https://public.example/article"),
        async () => [
          { address: "93.184.216.34", family: 4 },
          { address: "10.0.0.8", family: 4 },
        ],
      ),
    ).rejects.toMatchObject({ code: "PRIVATE_NETWORK_BLOCKED" });
  });

  it("DNS 全部解析结果安全时保留可固定连接的地址", async () => {
    await expect(
      resolveSafeAddresses(
        new URL("https://public.example/article"),
        async () => [
          { address: "93.184.216.34", family: 4 },
          { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
        ],
      ),
    ).resolves.toEqual([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);
  });

  it("系统 DNS 全部返回 Fake-IP 时使用可信解析结果", async () => {
    await expect(
      resolveSafeAddresses(
        new URL("https://public.example/article"),
        async () => [{ address: "198.18.0.46", family: 4 }],
        async () => [
          { address: "93.184.216.34", family: 4 },
          { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
        ],
      ),
    ).resolves.toEqual([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);
  });

  it("可信解析返回内网地址时仍然拒绝目标", async () => {
    await expect(
      resolveSafeAddresses(
        new URL("https://public.example/article"),
        async () => [{ address: "198.18.0.46", family: 4 }],
        async () => [{ address: "10.0.0.8", family: 4 }],
      ),
    ).rejects.toMatchObject({ code: "PRIVATE_NETWORK_BLOCKED" });
  });

  it("Fake-IP 与其他内网地址混合时不使用降级解析绕过拦截", async () => {
    let fallbackCalled = false;
    await expect(
      resolveSafeAddresses(
        new URL("https://public.example/article"),
        async () => [
          { address: "198.18.0.46", family: 4 },
          { address: "192.168.1.8", family: 4 },
        ],
        async () => {
          fallbackCalled = true;
          return [{ address: "93.184.216.34", family: 4 }];
        },
      ),
    ).rejects.toMatchObject({ code: "PRIVATE_NETWORK_BLOCKED" });
    expect(fallbackCalled).toBe(false);
  });
});
