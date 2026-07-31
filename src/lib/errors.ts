export type AppErrorCode =
  | "INVALID_URL"
  | "UNSUPPORTED_PROTOCOL"
  | "DUPLICATE_URL"
  | "PRIVATE_NETWORK_BLOCKED"
  | "DNS_FAILED"
  | "REQUEST_TIMEOUT"
  | "TOO_MANY_REDIRECTS"
  | "HTTP_FORBIDDEN"
  | "HTTP_NOT_FOUND"
  | "HTTP_SERVER_ERROR"
  | "CONTENT_TOO_LARGE"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "EMPTY_RESPONSE"
  | "CONTENT_TOO_SHORT"
  | "JS_REQUIRED"
  | "PARSE_FAILED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONTENT_EDITED"
  | "UNKNOWN_ERROR";

export const errorMessages: Record<AppErrorCode, string> = {
  INVALID_URL: "网址格式不正确",
  UNSUPPORTED_PROTOCOL: "只支持 HTTP 和 HTTPS 网址",
  DUPLICATE_URL: "该网址已经收藏",
  PRIVATE_NETWORK_BLOCKED: "出于安全原因，不能访问本地或内网地址",
  DNS_FAILED: "无法解析该网址的域名",
  REQUEST_TIMEOUT: "请求网页超时",
  TOO_MANY_REDIRECTS: "网页重定向次数过多",
  HTTP_FORBIDDEN: "目标网站拒绝访问",
  HTTP_NOT_FOUND: "网页不存在",
  HTTP_SERVER_ERROR: "目标网站暂时不可用",
  CONTENT_TOO_LARGE: "网页内容超过系统限制",
  UNSUPPORTED_CONTENT_TYPE: "该地址不是可提取的网页",
  EMPTY_RESPONSE: "网页返回内容为空",
  CONTENT_TOO_SHORT: "未识别到足够的正文内容",
  JS_REQUIRED: "网页可能需要 JavaScript 或登录后访问",
  PARSE_FAILED: "网页正文解析失败",
  VALIDATION_ERROR: "提交内容不符合要求",
  NOT_FOUND: "未找到对应记录",
  CONTENT_EDITED: "正文已被手动编辑，重新提取前需要确认覆盖",
  UNKNOWN_ERROR: "抓取过程中出现未知错误",
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly httpStatusCode?: number;

  constructor(
    code: AppErrorCode,
    message = errorMessages[code],
    status = 400,
    httpStatusCode?: number,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.httpStatusCode = httpStatusCode;
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (error instanceof Error && error.name === "AbortError") {
    return new AppError("REQUEST_TIMEOUT", undefined, 408);
  }
  return new AppError(
    "UNKNOWN_ERROR",
    error instanceof Error ? error.message : errorMessages.UNKNOWN_ERROR,
    500,
  );
}
