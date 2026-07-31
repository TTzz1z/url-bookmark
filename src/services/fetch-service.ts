import { spawn } from "node:child_process";
import type { LookupAddress, LookupOptions } from "node:dns";
import { Agent, buildConnector, fetch, type Response } from "undici";
import { AppError } from "@/lib/errors";
import {
  normalizeUrl,
  resolveSafeAddresses,
  type SafeAddress,
} from "./url-security-service";

const DEFAULT_TIMEOUT_MS = 18_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;

/** 模拟常见桌面浏览器，降低被 CDN 按爬虫指纹直接拒绝的概率。 */
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

let curlCommandCache: string | null | undefined;

export type FetchLimits = {
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
};

export type SafeFetchResult = {
  html: string;
  finalUrl: string;
  statusCode: number;
  contentType: string;
};

export type SafeBinaryFetchResult = {
  body: Uint8Array;
  finalUrl: string;
  statusCode: number;
  contentType: string;
};

export type SafeBinaryFetchOptions = FetchLimits & {
  referer?: string;
};

function readPositiveInt(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getFetchLimits(): FetchLimits {
  return {
    timeoutMs: readPositiveInt("FETCH_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
    maxBytes: readPositiveInt("FETCH_MAX_BYTES", DEFAULT_MAX_BYTES),
    maxRedirects: readPositiveInt("FETCH_MAX_REDIRECTS", DEFAULT_MAX_REDIRECTS),
  };
}

function createPinnedDispatcher(addresses: SafeAddress[]): Agent {
  let nextAddress = 0;
  const connector = buildConnector({
    lookup: (
      _hostname: string,
      options: LookupOptions,
      callback: (
        error: NodeJS.ErrnoException | null,
        address: string | LookupAddress[],
        family?: number,
      ) => void,
    ) => {
      const selected = addresses[nextAddress % addresses.length];
      nextAddress += 1;
      if (options.all) {
        callback(null, [
          { address: selected.address, family: selected.family },
        ]);
        return;
      }
      callback(null, selected.address, selected.family);
    },
  });
  return new Agent({ connect: connector });
}

function resolveAddressesWithAbort(
  url: URL,
  signal: AbortSignal,
): Promise<SafeAddress[]> {
  if (signal.aborted) {
    return Promise.reject(new AppError("REQUEST_TIMEOUT", undefined, 408));
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      reject(new AppError("REQUEST_TIMEOUT", undefined, 408));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void resolveSafeAddresses(url).then(
      (addresses) => {
        signal.removeEventListener("abort", onAbort);
        resolve(addresses);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function mapHttpError(status: number): AppError {
  if (status === 401 || status === 403) {
    return new AppError("HTTP_FORBIDDEN", undefined, 502, status);
  }
  if (status === 404 || status === 410) {
    return new AppError("HTTP_NOT_FOUND", undefined, 502, status);
  }
  if (status >= 500) {
    return new AppError("HTTP_SERVER_ERROR", undefined, 502, status);
  }
  return new AppError(
    "HTTP_SERVER_ERROR",
    `目标网页返回 HTTP ${status}`,
    502,
    status,
  );
}

function browserHtmlHeaders(): Record<string, string> {
  return {
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "User-Agent": BROWSER_USER_AGENT,
  };
}

function browserImageHeaders(referer?: string): Record<string, string> {
  return {
    Accept:
      "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
    ...(referer ? { Referer: referer } : {}),
    "Sec-Fetch-Dest": "image",
    "Sec-Fetch-Mode": "no-cors",
    "Sec-Fetch-Site": referer ? "cross-site" : "none",
    "User-Agent": BROWSER_USER_AGENT,
  };
}

export function shouldRetryHtmlWithCurl(status: number): boolean {
  return status === 401 || status === 403 || status === 429 || status === 503;
}

function isCurlFallbackDisabled(): boolean {
  return process.env.FETCH_DISABLE_CURL === "1";
}

async function resolveCurlCommand(): Promise<string | null> {
  if (curlCommandCache !== undefined) {
    return curlCommandCache;
  }
  if (isCurlFallbackDisabled()) {
    curlCommandCache = null;
    return null;
  }
  if (process.env.FETCH_CURL_PATH?.trim()) {
    curlCommandCache = process.env.FETCH_CURL_PATH.trim();
    return curlCommandCache;
  }

  for (const candidate of process.platform === "win32"
    ? ["curl.exe", "curl"]
    : ["curl"]) {
    const available = await new Promise<boolean>((resolve) => {
      const child = spawn(candidate, ["--version"], {
        stdio: "ignore",
        windowsHide: true,
      });
      child.on("error", () => resolve(false));
      child.on("exit", (code) => resolve(code === 0));
    });
    if (available) {
      curlCommandCache = candidate;
      return candidate;
    }
  }
  curlCommandCache = null;
  return null;
}

function pickPinnedAddress(addresses: SafeAddress[]): SafeAddress {
  return addresses.find((item) => item.family === 4) ?? addresses[0];
}

export function parseCurlIncludeOutput(raw: Buffer): {
  statusCode: number;
  headers: Record<string, string>;
  body: Uint8Array;
} {
  const asLatin1 = raw.toString("latin1");
  const match = asLatin1.match(/\r?\n\r?\n/);
  if (!match || match.index === undefined) {
    throw new AppError("EMPTY_RESPONSE", "curl 响应缺少响应头", 422);
  }

  let headerEnd = match.index + match[0].length;
  let headerBlock = asLatin1.slice(0, match.index);

  // 跳过 HTTP/1.1 100 Continue 等中间头块。
  while (/^HTTP\/\d+(?:\.\d+)?\s+100\b/i.test(headerBlock)) {
    const rest = asLatin1.slice(headerEnd);
    const next = rest.match(/\r?\n\r?\n/);
    if (!next || next.index === undefined) {
      throw new AppError("EMPTY_RESPONSE", "curl 响应缺少响应头", 422);
    }
    headerBlock = rest.slice(0, next.index);
    headerEnd += next.index + next[0].length;
  }

  const statusMatch = headerBlock.match(/^HTTP\/\d+(?:\.\d+)?\s+(\d{3})\b/i);
  if (!statusMatch) {
    throw new AppError("EMPTY_RESPONSE", "无法解析 curl HTTP 状态", 422);
  }

  const headers: Record<string, string> = {};
  for (const line of headerBlock.split(/\r?\n/).slice(1)) {
    const separator = line.indexOf(":");
    if (separator <= 0) {
      continue;
    }
    const name = line.slice(0, separator).trim().toLocaleLowerCase();
    const value = line.slice(separator + 1).trim();
    if (name) {
      headers[name] = value;
    }
  }

  return {
    statusCode: Number.parseInt(statusMatch[1], 10),
    headers,
    body: raw.subarray(headerEnd),
  };
}

async function runCurl(
  command: string,
  args: string[],
  signal: AbortSignal,
): Promise<Buffer> {
  if (signal.aborted) {
    throw new AppError("REQUEST_TIMEOUT", undefined, 408);
  }
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const onAbort = () => {
      child.kill("SIGTERM");
      reject(new AppError("REQUEST_TIMEOUT", undefined, 408));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      signal.removeEventListener("abort", onAbort);
      reject(error);
    });
    child.on("close", (code) => {
      signal.removeEventListener("abort", onAbort);
      if (signal.aborted) {
        reject(new AppError("REQUEST_TIMEOUT", undefined, 408));
        return;
      }
      const output = Buffer.concat(stdout);
      if (code === 0 || output.length > 0) {
        resolve(output);
        return;
      }
      const detail = Buffer.concat(stderr).toString("utf8").trim();
      reject(
        new AppError(
          "UNKNOWN_ERROR",
          detail || `curl 退出码 ${code ?? "unknown"}`,
          502,
        ),
      );
    });
  });
}

async function fetchHtmlViaCurl(
  currentUrl: URL,
  addresses: SafeAddress[],
  limits: FetchLimits,
  signal: AbortSignal,
): Promise<{
  statusCode: number;
  headers: Record<string, string>;
  body: Uint8Array;
} | null> {
  const command = await resolveCurlCommand();
  if (!command) {
    return null;
  }
  const pinned = pickPinnedAddress(addresses);
  const port =
    currentUrl.port || (currentUrl.protocol === "https:" ? "443" : "80");
  const headers = browserHtmlHeaders();
  const args = [
    "--silent",
    "--show-error",
    "--include",
    "--compressed",
    "--http1.1",
    "--path-as-is",
    "--max-redirs",
    "0",
    "--max-time",
    String(Math.max(1, Math.ceil(limits.timeoutMs / 1000))),
    "--max-filesize",
    String(limits.maxBytes),
    "--proto",
    "=http,https",
    "--proto-redir",
    "=http,https",
    "--resolve",
    `${currentUrl.hostname}:${port}:${pinned.address}`,
  ];
  for (const [name, value] of Object.entries(headers)) {
    args.push("--header", `${name}: ${value}`);
  }
  args.push(currentUrl.toString());

  const raw = await runCurl(command, args, signal);
  return parseCurlIncludeOutput(raw);
}

async function fetchBinaryViaCurl(
  currentUrl: URL,
  addresses: SafeAddress[],
  options: SafeBinaryFetchOptions,
  signal: AbortSignal,
): Promise<{
  statusCode: number;
  headers: Record<string, string>;
  body: Uint8Array;
} | null> {
  const command = await resolveCurlCommand();
  if (!command) {
    return null;
  }
  const pinned = pickPinnedAddress(addresses);
  const port =
    currentUrl.port || (currentUrl.protocol === "https:" ? "443" : "80");
  const headers = browserImageHeaders(options.referer);
  const args = [
    "--silent",
    "--show-error",
    "--include",
    "--http1.1",
    "--path-as-is",
    "--max-redirs",
    "0",
    "--max-time",
    String(Math.max(1, Math.ceil(options.timeoutMs / 1000))),
    "--max-filesize",
    String(options.maxBytes),
    "--proto",
    "=http,https",
    "--proto-redir",
    "=http,https",
    "--resolve",
    `${currentUrl.hostname}:${port}:${pinned.address}`,
  ];
  for (const [name, value] of Object.entries(headers)) {
    args.push("--header", `${name}: ${value}`);
  }
  args.push(currentUrl.toString());

  const raw = await runCurl(command, args, signal);
  return parseCurlIncludeOutput(raw);
}

function assertHtmlContentType(contentType: string, statusCode: number): void {
  const normalized = contentType.toLocaleLowerCase();
  if (
    !normalized.includes("text/html") &&
    !normalized.includes("application/xhtml+xml")
  ) {
    throw new AppError("UNSUPPORTED_CONTENT_TYPE", undefined, 415, statusCode);
  }
}

async function readLimitedBytes(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  const declaredLength = Number.parseInt(
    response.headers.get("content-length") ?? "",
    10,
  );
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new AppError("CONTENT_TOO_LARGE", undefined, 413, response.status);
  }
  if (!response.body) {
    throw new AppError("EMPTY_RESPONSE", undefined, 422, response.status);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new AppError(
          "CONTENT_TOO_LARGE",
          undefined,
          413,
          response.status,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (totalBytes === 0) {
    throw new AppError("EMPTY_RESPONSE", undefined, 422, response.status);
  }
  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

async function readLimitedBody(
  response: Response,
  maxBytes: number,
): Promise<string> {
  return decodeHtmlBytes(
    await readLimitedBytes(response, maxBytes),
    response.headers.get("content-type") ?? "",
  );
}

function charsetFromContentType(contentType: string): string | null {
  return (
    contentType
      .match(/(?:^|;)\s*charset\s*=\s*(?:"([^"]+)"|'([^']+)'|([^;\s]+))/i)
      ?.slice(1)
      .find(Boolean)
      ?.trim() ?? null
  );
}

function charsetFromHtml(bytes: Uint8Array): string | null {
  const prefix = new TextDecoder("latin1").decode(bytes.subarray(0, 1_024));
  return (
    prefix
      .match(
        /<meta\b[^>]*\bcharset\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'/>;]+))/i,
      )
      ?.slice(1)
      .find(Boolean)
      ?.trim() ?? null
  );
}

function bomCharset(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    return "utf-8";
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return "utf-16le";
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return "utf-16be";
  }
  return null;
}

function normalizeCharset(charset: string): string {
  const normalized = charset
    .trim()
    .replace(/^["']|["']$/g, "")
    .toLowerCase();
  if (["gbk", "gb2312", "gb_2312-80", "x-gbk"].includes(normalized)) {
    return "gb18030";
  }
  if (normalized === "utf8") {
    return "utf-8";
  }
  return normalized;
}

export function decodeHtmlBytes(bytes: Uint8Array, contentType = ""): string {
  const candidates = [
    bomCharset(bytes),
    charsetFromContentType(contentType),
    charsetFromHtml(bytes),
    "utf-8",
  ];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    try {
      return new TextDecoder(normalizeCharset(candidate)).decode(bytes);
    } catch {
      // Try the next declared or fallback encoding.
    }
  }
  return new TextDecoder("utf-8").decode(bytes);
}

export async function safeFetchHtml(
  rawUrl: string,
  limits = getFetchLimits(),
): Promise<SafeFetchResult> {
  let currentUrl = normalizeUrl(rawUrl).url;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), limits.timeoutMs);

  try {
    for (let redirects = 0; redirects <= limits.maxRedirects; redirects += 1) {
      const addresses = await resolveAddressesWithAbort(
        currentUrl,
        controller.signal,
      );
      const dispatcher = createPinnedDispatcher(addresses);
      try {
        const response = await fetch(currentUrl, {
          dispatcher,
          redirect: "manual",
          signal: controller.signal,
          credentials: "omit",
          headers: browserHtmlHeaders(),
        });
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          await response.body?.cancel();
          if (!location) {
            throw mapHttpError(response.status);
          }
          if (redirects === limits.maxRedirects) {
            throw new AppError("TOO_MANY_REDIRECTS", undefined, 508);
          }
          currentUrl = new URL(location, currentUrl);
          normalizeUrl(currentUrl.toString());
          continue;
        }

        if (!response.ok) {
          await response.body?.cancel();
          if (shouldRetryHtmlWithCurl(response.status)) {
            const curlResponse = await fetchHtmlViaCurl(
              currentUrl,
              addresses,
              limits,
              controller.signal,
            );
            if (curlResponse) {
              if (
                curlResponse.statusCode >= 300 &&
                curlResponse.statusCode < 400
              ) {
                const location = curlResponse.headers.location;
                if (!location) {
                  throw mapHttpError(curlResponse.statusCode);
                }
                if (redirects === limits.maxRedirects) {
                  throw new AppError("TOO_MANY_REDIRECTS", undefined, 508);
                }
                currentUrl = new URL(location, currentUrl);
                normalizeUrl(currentUrl.toString());
                continue;
              }
              if (
                curlResponse.statusCode >= 200 &&
                curlResponse.statusCode < 300
              ) {
                const contentType = (
                  curlResponse.headers["content-type"] ?? ""
                ).toLocaleLowerCase();
                assertHtmlContentType(contentType, curlResponse.statusCode);
                if (curlResponse.body.byteLength > limits.maxBytes) {
                  throw new AppError(
                    "CONTENT_TOO_LARGE",
                    undefined,
                    413,
                    curlResponse.statusCode,
                  );
                }
                if (curlResponse.body.byteLength === 0) {
                  throw new AppError(
                    "EMPTY_RESPONSE",
                    undefined,
                    422,
                    curlResponse.statusCode,
                  );
                }
                return {
                  html: decodeHtmlBytes(curlResponse.body, contentType),
                  finalUrl: currentUrl.toString(),
                  statusCode: curlResponse.statusCode,
                  contentType,
                };
              }
            }
          }
          throw mapHttpError(response.status);
        }
        const contentType = (
          response.headers.get("content-type") ?? ""
        ).toLocaleLowerCase();
        assertHtmlContentType(contentType, response.status);
        const html = await readLimitedBody(response, limits.maxBytes);
        return {
          html,
          finalUrl: currentUrl.toString(),
          statusCode: response.status,
          contentType,
        };
      } catch (error) {
        if (controller.signal.aborted) {
          throw new AppError("REQUEST_TIMEOUT", undefined, 408);
        }
        throw error;
      } finally {
        await dispatcher.close();
      }
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new AppError("REQUEST_TIMEOUT", undefined, 408);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  throw new AppError("TOO_MANY_REDIRECTS", undefined, 508);
}

const allowedImageContentTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/svg+xml",
]);

export async function safeFetchBinary(
  rawUrl: string,
  options: SafeBinaryFetchOptions,
): Promise<SafeBinaryFetchResult> {
  let currentUrl = normalizeUrl(rawUrl).url;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  const referer = options.referer
    ? normalizeUrl(options.referer).normalizedUrl
    : undefined;

  try {
    for (let redirects = 0; redirects <= options.maxRedirects; redirects += 1) {
      const addresses = await resolveAddressesWithAbort(
        currentUrl,
        controller.signal,
      );
      const dispatcher = createPinnedDispatcher(addresses);
      try {
        const response = await fetch(currentUrl, {
          dispatcher,
          redirect: "manual",
          signal: controller.signal,
          credentials: "omit",
          headers: browserImageHeaders(referer),
        });
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          await response.body?.cancel();
          if (!location) {
            throw mapHttpError(response.status);
          }
          if (redirects === options.maxRedirects) {
            throw new AppError("TOO_MANY_REDIRECTS", undefined, 508);
          }
          currentUrl = new URL(location, currentUrl);
          normalizeUrl(currentUrl.toString());
          continue;
        }
        if (!response.ok) {
          await response.body?.cancel();
          if (shouldRetryHtmlWithCurl(response.status)) {
            const curlResponse = await fetchBinaryViaCurl(
              currentUrl,
              addresses,
              { ...options, referer },
              controller.signal,
            );
            if (curlResponse) {
              if (
                curlResponse.statusCode >= 300 &&
                curlResponse.statusCode < 400
              ) {
                const location = curlResponse.headers.location;
                if (!location) {
                  throw mapHttpError(curlResponse.statusCode);
                }
                if (redirects === options.maxRedirects) {
                  throw new AppError("TOO_MANY_REDIRECTS", undefined, 508);
                }
                currentUrl = new URL(location, currentUrl);
                normalizeUrl(currentUrl.toString());
                continue;
              }
              if (
                curlResponse.statusCode >= 200 &&
                curlResponse.statusCode < 300
              ) {
                const curlContentType = (
                  curlResponse.headers["content-type"] ?? ""
                )
                  .split(";", 1)[0]
                  .trim()
                  .toLocaleLowerCase();
                if (!allowedImageContentTypes.has(curlContentType)) {
                  throw new AppError(
                    "UNSUPPORTED_CONTENT_TYPE",
                    `不支持归档 ${curlContentType || "未知类型"} 图片`,
                    415,
                    curlResponse.statusCode,
                  );
                }
                if (curlResponse.body.byteLength > options.maxBytes) {
                  throw new AppError(
                    "CONTENT_TOO_LARGE",
                    undefined,
                    413,
                    curlResponse.statusCode,
                  );
                }
                if (curlResponse.body.byteLength === 0) {
                  throw new AppError(
                    "EMPTY_RESPONSE",
                    undefined,
                    422,
                    curlResponse.statusCode,
                  );
                }
                return {
                  body: curlResponse.body,
                  finalUrl: currentUrl.toString(),
                  statusCode: curlResponse.statusCode,
                  contentType: curlContentType,
                };
              }
            }
          }
          throw mapHttpError(response.status);
        }
        const contentType = (response.headers.get("content-type") ?? "")
          .split(";", 1)[0]
          .trim()
          .toLocaleLowerCase();
        if (!allowedImageContentTypes.has(contentType)) {
          await response.body?.cancel();
          throw new AppError(
            "UNSUPPORTED_CONTENT_TYPE",
            `不支持归档 ${contentType || "未知类型"} 图片`,
            415,
            response.status,
          );
        }
        return {
          body: await readLimitedBytes(response, options.maxBytes),
          finalUrl: currentUrl.toString(),
          statusCode: response.status,
          contentType,
        };
      } catch (error) {
        if (controller.signal.aborted) {
          throw new AppError("REQUEST_TIMEOUT", undefined, 408);
        }
        throw error;
      } finally {
        await dispatcher.close();
      }
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new AppError("REQUEST_TIMEOUT", undefined, 408);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  throw new AppError("TOO_MANY_REDIRECTS", undefined, 508);
}
