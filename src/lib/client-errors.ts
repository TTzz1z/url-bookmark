import type { ApiErrorDto } from "@/types/api";

/** 这些失败通常来自网络或目标站点的临时状况，值得给用户一个「重试」入口。 */
const retryableCodes = new Set([
  "DNS_FAILED",
  "EMPTY_RESPONSE",
  "HTTP_SERVER_ERROR",
  "NETWORK_ERROR",
  "REQUEST_TIMEOUT",
  "UNKNOWN_ERROR",
]);

export type ApiFailure = {
  code: string;
  message: string;
  retryable: boolean;
};

export class ApiError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(failure: ApiFailure) {
    super(failure.message);
    this.name = "ApiError";
    this.code = failure.code;
    this.retryable = failure.retryable;
  }
}

export async function readApiFailure(response: Response): Promise<ApiFailure> {
  const data = (await response.json().catch(() => null)) as ApiErrorDto | null;
  const code = data?.error.code ?? "UNKNOWN_ERROR";
  return {
    code,
    message: data?.error.message ?? "操作失败，请稍后重试",
    retryable: retryableCodes.has(code),
  };
}

export async function throwApiError(response: Response): Promise<never> {
  throw new ApiError(await readApiFailure(response));
}

export function describeError(error: unknown, fallback: string): ApiFailure {
  if (error instanceof ApiError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    };
  }
  // fetch 在无法建立连接时抛 TypeError，本地服务被关闭是最常见的原因。
  if (error instanceof TypeError) {
    return {
      code: "NETWORK_ERROR",
      message: "无法连接到本地服务，请确认服务仍在运行",
      retryable: true,
    };
  }
  return {
    code: "UNKNOWN_ERROR",
    message: error instanceof Error ? error.message : fallback,
    retryable: true,
  };
}
