import type { LookupAddress, LookupOptions } from "node:dns";
import { Agent, buildConnector, fetch, type Response } from "undici";
import { AppError } from "@/lib/errors";
import {
  normalizeUrl,
  resolveSafeAddresses,
  type SafeAddress,
} from "./url-security-service";

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;

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
    maxRedirects: readPositiveInt(
      "FETCH_MAX_REDIRECTS",
      DEFAULT_MAX_REDIRECTS,
    ),
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
  return new TextDecoder("utf-8").decode(
    await readLimitedBytes(response, maxBytes),
  );
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
          headers: {
            Accept: "text/html,application/xhtml+xml;q=0.9",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
            "User-Agent":
              "BookmarkReader/1.0 (+local content extraction; no cookies)",
          },
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
          throw mapHttpError(response.status);
        }
        const contentType = (
          response.headers.get("content-type") ?? ""
        ).toLocaleLowerCase();
        if (
          !contentType.includes("text/html") &&
          !contentType.includes("application/xhtml+xml")
        ) {
          await response.body?.cancel();
          throw new AppError(
            "UNSUPPORTED_CONTENT_TYPE",
            undefined,
            415,
            response.status,
          );
        }
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
    for (
      let redirects = 0;
      redirects <= options.maxRedirects;
      redirects += 1
    ) {
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
          headers: {
            Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9",
            ...(referer ? { Referer: referer } : {}),
            "User-Agent":
              "BookmarkReader/1.0 (+local image archive; no cookies)",
          },
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
          throw mapHttpError(response.status);
        }
        const contentType = (
          response.headers.get("content-type") ?? ""
        )
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
