import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { AppError, toAppError } from "@/lib/errors";
import type { ExtractionStatus } from "@/db/schema";
import { safeFetchHtml } from "./fetch-service";

export type ExtractionResult = {
  finalUrl: string;
  title: string;
  description?: string;
  author?: string;
  domain: string;
  faviconUrl?: string;
  coverImageUrl?: string;
  markdownContent: string;
  plainText: string;
  contentLength: number;
  status: ExtractionStatus;
  errorCode?: string;
  errorMessage?: string;
  httpStatusCode?: number;
};

type Metadata = {
  title?: string;
  description?: string;
  author?: string;
  faviconUrl?: string;
  coverImageUrl?: string;
};

const lazyImageAttributes = [
  "data-original",
  "data-original-src",
  "data-lazy-src",
  "data-actualsrc",
  "data-src",
  "data-url",
  "data-lazy",
];
const paginationQueryKeys = new Set([
  "page",
  "p",
  "paged",
  "pageindex",
  "pageno",
  "pagenumber",
]);
export const MAX_PAGINATED_PAGES = 10;

export type PaginationPage = {
  url: string;
  pageNumber: number;
};

function sourceFromSrcset(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const candidates = value
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/, 1)[0])
    .filter(Boolean);
  return candidates.at(-1) ?? null;
}

function absoluteUrl(value: string | null, baseUrl: string): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function decodeUrlCandidate(value: string): string {
  let decoded = value.trim();
  for (let attempts = 0; attempts < 2; attempts += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) {
        break;
      }
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded;
}

function looksLikeImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      /\.(?:avif|gif|jpe?g|png|webp)$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function linkedOriginalImage(
  image: HTMLImageElement,
  baseUrl: string,
): string | undefined {
  const anchorHref = image.closest<HTMLAnchorElement>("a[href]")?.getAttribute("href");
  const safeHref = absoluteUrl(anchorHref ?? null, baseUrl);
  if (!safeHref) {
    return undefined;
  }
  if (looksLikeImageUrl(safeHref)) {
    return safeHref;
  }

  const viewerUrl = new URL(safeHref);
  if (!/(?:show|view).*(?:image|pic)|(?:image|pic).*(?:show|view)/i.test(viewerUrl.pathname)) {
    return undefined;
  }
  const candidates = [
    viewerUrl.search.slice(1),
    ...Array.from(viewerUrl.searchParams.values()),
  ];
  for (const candidate of candidates) {
    const decoded = decodeUrlCandidate(candidate);
    if (looksLikeImageUrl(decoded)) {
      return new URL(decoded).toString();
    }
  }
  return undefined;
}

function looksLikePlaceholderImage(value: string | undefined): boolean {
  if (!value) {
    return true;
  }
  try {
    const pathname = new URL(value).pathname.toLocaleLowerCase();
    return /(?:^|[-_/])(blank|empty|loading|placeholder|spacer|transparent|pixel)(?:[-_. /]|$)/i.test(
      pathname,
    );
  } catch {
    return false;
  }
}

function lazyImageSource(
  image: HTMLImageElement,
  baseUrl: string,
): string | undefined {
  for (const attribute of lazyImageAttributes) {
    const source = absoluteUrl(image.getAttribute(attribute), baseUrl);
    if (source) {
      return source;
    }
  }
  return undefined;
}

function stripPaginationMarker(pathname: string): string {
  return pathname
    .replace(/_(\d+)(?=\.[^./]+$)/i, "")
    .replace(/(?:[-_/](?:page|p)[-_/]?)\d+\/?$/i, "")
    .replace(/\/\d+\/?$/, "")
    .replace(/\/$/, "");
}

function paginationSeriesKey(value: string): string | null {
  try {
    const url = new URL(value);
    const remainingQuery = Array.from(url.searchParams.entries())
      .filter(([key]) => !paginationQueryKeys.has(key.toLocaleLowerCase()))
      .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
        `${leftKey}=${leftValue}`.localeCompare(`${rightKey}=${rightValue}`),
      );
    const query = new URLSearchParams(remainingQuery).toString();
    return `${url.origin}${stripPaginationMarker(url.pathname)}${query ? `?${query}` : ""}`;
  } catch {
    return null;
  }
}

function paginationPageNumber(
  value: string,
  linkText = "",
): number | null {
  const numericText = linkText.trim().match(/^\d{1,3}$/)?.[0];
  if (numericText) {
    return Number.parseInt(numericText, 10);
  }
  try {
    const url = new URL(value);
    for (const [key, queryValue] of url.searchParams) {
      if (
        paginationQueryKeys.has(key.toLocaleLowerCase()) &&
        /^\d{1,3}$/.test(queryValue)
      ) {
        return Number.parseInt(queryValue, 10);
      }
    }
    const pathnamePatterns = [
      /_(\d+)(?=\.[^./]+$)/i,
      /(?:[-_/](?:page|p)[-_/]?)(\d+)\/?$/i,
      /\/(\d+)\/?$/,
    ];
    for (const pattern of pathnamePatterns) {
      const match = url.pathname.match(pattern);
      if (match) {
        return Number.parseInt(match[1], 10);
      }
    }
  } catch {
    return null;
  }
  return null;
}

function isSamePaginationSeries(firstUrl: string, candidateUrl: string): boolean {
  return (
    paginationSeriesKey(firstUrl) !== null &&
    paginationSeriesKey(firstUrl) === paginationSeriesKey(candidateUrl)
  );
}

export function discoverPaginationUrls(
  html: string,
  firstUrl: string,
): PaginationPage[] {
  let dom: JSDOM;
  try {
    dom = new JSDOM(html, { url: firstUrl, contentType: "text/html" });
  } catch {
    return [];
  }
  const firstNormalized = new URL(firstUrl).toString();
  const discovered = new Map<string, PaginationPage>();
  for (const anchor of dom.window.document.querySelectorAll<HTMLAnchorElement>(
    "a[href]",
  )) {
    const text = anchor.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const rel = anchor.getAttribute("rel")?.toLocaleLowerCase() ?? "";
    const isNumeric = /^\d{1,3}$/.test(text);
    const isNext =
      rel.split(/\s+/).includes("next") ||
      /^(?:next|next page|下一页|下页|后一页|›|»|→)$/i.test(text);
    if (!isNumeric && !isNext) {
      continue;
    }
    const candidate = absoluteUrl(anchor.getAttribute("href"), firstUrl);
    if (
      !candidate ||
      candidate === firstNormalized ||
      !isSamePaginationSeries(firstUrl, candidate)
    ) {
      continue;
    }
    const pageNumber = paginationPageNumber(candidate, isNumeric ? text : "");
    if (
      pageNumber === null ||
      pageNumber < 2 ||
      pageNumber > MAX_PAGINATED_PAGES
    ) {
      continue;
    }
    discovered.set(candidate, { url: candidate, pageNumber });
  }
  return Array.from(discovered.values())
    .sort((left, right) => left.pageNumber - right.pageNumber)
    .slice(0, MAX_PAGINATED_PAGES - 1);
}

function metaContent(document: Document, selector: string): string | undefined {
  return document.querySelector(selector)?.getAttribute("content")?.trim() || undefined;
}

export function extractMetadata(
  document: Document,
  baseUrl: string,
): Metadata {
  const title =
    metaContent(document, 'meta[property="og:title"]') ??
    metaContent(document, 'meta[name="twitter:title"]') ??
    document.querySelector("title")?.textContent?.trim() ??
    undefined;
  const description =
    metaContent(document, 'meta[property="og:description"]') ??
    metaContent(document, 'meta[name="description"]') ??
    undefined;
  const author =
    metaContent(document, 'meta[name="author"]') ??
    metaContent(document, 'meta[property="article:author"]') ??
    undefined;
  const faviconHref =
    document
      .querySelector<HTMLLinkElement>(
        'link[rel~="icon"], link[rel="shortcut icon"]',
      )
      ?.getAttribute("href") ?? "/favicon.ico";
  const coverImage =
    metaContent(document, 'meta[property="og:image"]') ??
    metaContent(document, 'meta[name="twitter:image"]');

  return {
    title,
    description,
    author,
    faviconUrl: absoluteUrl(faviconHref, baseUrl),
    coverImageUrl: absoluteUrl(coverImage ?? null, baseUrl),
  };
}

export function prepareDocument(document: Document, baseUrl: string): void {
  for (const code of document.querySelectorAll<HTMLElement>("pre > code")) {
    const language = code.className.match(/(?:language-|lang-)([\w-]+)/)?.[1];
    if (language) {
      code.parentElement?.setAttribute("data-code-language", language);
    }
  }

  for (const [index, image] of Array.from(
    document.querySelectorAll<HTMLImageElement>("img"),
  ).entries()) {
    const currentSource = absoluteUrl(image.getAttribute("src"), baseUrl);
    const lazySource = lazyImageSource(image, baseUrl);
    const responsiveSource = absoluteUrl(
      sourceFromSrcset(image.getAttribute("data-srcset")) ??
        sourceFromSrcset(image.getAttribute("srcset")),
      baseUrl,
    );
    const safeSource =
      linkedOriginalImage(image, baseUrl) ??
      (looksLikePlaceholderImage(currentSource)
        ? lazySource ?? responsiveSource
        : currentSource) ??
      lazySource ??
      responsiveSource;
    if (safeSource) {
      image.setAttribute("src", safeSource);
    } else {
      image.removeAttribute("src");
    }
    if (!image.getAttribute("alt")?.trim()) {
      const caption = image
        .closest("figure")
        ?.querySelector("figcaption")
        ?.textContent?.replace(/\s+/g, " ")
        .trim();
      image.setAttribute("alt", caption || `文章图片 ${index + 1}`);
    }
    image.removeAttribute("srcset");
    image.removeAttribute("data-srcset");
  }

  for (const anchor of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const safeHref = absoluteUrl(anchor.getAttribute("href"), baseUrl);
    if (safeHref) {
      anchor.setAttribute("href", safeHref);
    } else {
      anchor.removeAttribute("href");
    }
  }
}

function configureTurndown(): TurndownService {
  const turndown = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    strongDelimiter: "**",
  });
  turndown.use(gfm);
  turndown.addRule("fencedCodeWithLanguage", {
    filter: (node) =>
      node.nodeName === "PRE" &&
      node.firstElementChild?.nodeName === "CODE",
    replacement: (_content, node) => {
      const code = node.firstElementChild;
      const language =
        node.getAttribute("data-code-language") ??
        code?.getAttribute("class")?.match(/(?:language-|lang-)([\w-]+)/)?.[1] ??
        "";
      const text = code?.textContent?.replace(/\n$/, "") ?? "";
      return `\n\n\`\`\`${language}\n${text}\n\`\`\`\n\n`;
    },
  });
  turndown.addRule("safeImage", {
    filter: "img",
    replacement: (_content, node) => {
      const source = node.getAttribute("src");
      if (!source || !/^https?:\/\//i.test(source)) {
        return "";
      }
      const alt = node.getAttribute("alt")?.replace(/[\[\]]/g, "") ?? "";
      return `![${alt}](${source})`;
    },
  });
  return turndown;
}

function normalizeMarkdown(markdown: string): string {
  return markdown
    .replace(/\n{4,}/g, "\n\n\n")
    .replace(/\[\s*\]\([^)]*\)/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function looksLikeLoginPage(document: Document, plainText: string): boolean {
  const hasPassword = Boolean(document.querySelector('input[type="password"]'));
  const loginTerms = /登录|登入|sign\s*in|log\s*in|验证码|captcha/i.test(
    plainText.slice(0, 1200),
  );
  return hasPassword || (loginTerms && plainText.length < 800);
}

export function evaluateContent(
  plainText: string,
  document: Document,
): { valid: boolean; code?: "CONTENT_TOO_SHORT" | "JS_REQUIRED" } {
  const normalized = plainText.replace(/\s+/g, " ").trim();
  if (looksLikeLoginPage(document, normalized)) {
    return { valid: false, code: "JS_REQUIRED" };
  }
  const chineseCharacters = (normalized.match(/[\u3400-\u9fff]/g) ?? []).length;
  const englishWords = (
    normalized.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) ?? []
  ).length;
  const paragraphs = document.querySelectorAll("p").length;
  const valid =
    chineseCharacters >= 100 ||
    englishWords >= 80 ||
    (paragraphs >= 3 && normalized.length >= 240);
  return valid
    ? { valid: true }
    : { valid: false, code: "CONTENT_TOO_SHORT" };
}

export function extractFromHtml(
  html: string,
  finalUrl: string,
  httpStatusCode = 200,
): ExtractionResult {
  const domain = new URL(finalUrl).hostname;
  const fallbackTitle = domain || finalUrl;
  let dom: JSDOM;
  try {
    dom = new JSDOM(html, {
      url: finalUrl,
      contentType: "text/html",
    });
  } catch {
    throw new AppError("PARSE_FAILED");
  }

  const document = dom.window.document;
  const metadata = extractMetadata(document, finalUrl);
  prepareDocument(document, finalUrl);
  const titleBeforeReadability = metadata.title ?? fallbackTitle;

  let article: ReturnType<Readability["parse"]>;
  try {
    article = new Readability(document).parse();
  } catch {
    article = null;
  }
  if (!article?.content) {
    const plainFallback = document.body?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const quality = evaluateContent(plainFallback, document);
    const fallbackPurifier = createDOMPurify(
      dom.window as unknown as Window & typeof globalThis,
    );
    const fallbackHtml = fallbackPurifier.sanitize(
      document.body?.innerHTML ?? "",
      {
        USE_PROFILES: { html: true },
        FORBID_TAGS: [
          "script",
          "style",
          "iframe",
          "object",
          "embed",
          "form",
          "input",
          "button",
          "video",
          "audio",
        ],
        FORBID_ATTR: ["style", "srcset"],
        ALLOW_UNKNOWN_PROTOCOLS: false,
      },
    ) as string;
    const fallbackDom = new JSDOM(`<article>${fallbackHtml}</article>`, {
      url: finalUrl,
    });
    prepareDocument(fallbackDom.window.document, finalUrl);
    const fallbackMarkdown = normalizeMarkdown(
      configureTurndown().turndown(
        fallbackDom.window.document.querySelector("article")?.innerHTML ?? "",
      ),
    );
    return {
      finalUrl,
      title: titleBeforeReadability,
      description: metadata.description,
      author: metadata.author,
      domain,
      faviconUrl: metadata.faviconUrl,
      coverImageUrl: metadata.coverImageUrl,
      markdownContent: fallbackMarkdown,
      plainText: plainFallback,
      contentLength: plainFallback.length,
      status: "partial",
      errorCode: quality.code ?? "PARSE_FAILED",
      errorMessage:
        quality.code === "JS_REQUIRED"
          ? "网页可能需要 JavaScript 或登录后访问"
          : "未识别到可阅读的正文内容",
      httpStatusCode,
    };
  }

  const purifier = createDOMPurify(
    dom.window as unknown as Window & typeof globalThis,
  );
  const sanitized = purifier.sanitize(article.content, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: [
      "script",
      "style",
      "iframe",
      "object",
      "embed",
      "form",
      "input",
      "button",
      "video",
      "audio",
    ],
    FORBID_ATTR: ["style", "srcset"],
    ALLOW_UNKNOWN_PROTOCOLS: false,
  }) as string;
  const cleanDom = new JSDOM(`<article>${sanitized}</article>`, { url: finalUrl });
  prepareDocument(cleanDom.window.document, finalUrl);
  const articleElement = cleanDom.window.document.querySelector("article");
  const plainText = (
    article.textContent ??
    articleElement?.textContent ??
    ""
  )
    .replace(/\s+/g, " ")
    .trim();
  const quality = evaluateContent(plainText, cleanDom.window.document);
  const markdownBody = normalizeMarkdown(
    configureTurndown().turndown(articleElement?.innerHTML ?? sanitized),
  );
  const title = metadata.title ?? article.title?.trim() ?? fallbackTitle;

  return {
    finalUrl,
    title,
    description: metadata.description ?? article.excerpt ?? undefined,
    author: metadata.author ?? article.byline ?? undefined,
    domain,
    faviconUrl: metadata.faviconUrl,
    coverImageUrl: metadata.coverImageUrl,
    markdownContent: markdownBody,
    plainText,
    contentLength: markdownBody.length,
    status: quality.valid ? "success" : "partial",
    errorCode: quality.valid ? undefined : quality.code,
    errorMessage: quality.valid
      ? undefined
      : quality.code === "JS_REQUIRED"
        ? "网页可能需要 JavaScript 或登录后访问"
        : "正文已保存，但内容较短，建议检查或手动编辑",
    httpStatusCode,
  };
}

type ExtractedPaginationPage = PaginationPage & {
  result: ExtractionResult;
};

function removePaginationLinks(markdown: string, firstUrl: string): string {
  const markdownLinkPattern = /\[[^\]]*]\((https?:\/\/[^)\s]+)\)/gi;
  return normalizeMarkdown(
    markdown
      .split(/\n{2,}/)
      .filter((block) => {
        const paginationLinks = Array.from(
          block.matchAll(markdownLinkPattern),
        ).filter((match) => isSamePaginationSeries(firstUrl, match[1]));
        if (paginationLinks.length >= 2) {
          return false;
        }
        if (paginationLinks.length === 1) {
          const textWithoutLink = block
            .replace(markdownLinkPattern, "")
            .replace(/[*_`#>\s-]/g, "");
          return (
            textWithoutLink.length > 20 ||
            !/(?:下一页|下页|后一页|next)/i.test(block)
          );
        }
        return true;
      })
      .join("\n\n"),
  );
}

function mergePaginatedResults(
  pages: ExtractedPaginationPage[],
  firstUrl: string,
  failedPages: number,
): ExtractionResult {
  const sortedPages = [...pages].sort(
    (left, right) => left.pageNumber - right.pageNumber,
  );
  const first = sortedPages[0].result;
  const markdownContent = sortedPages
    .map(
      (page) =>
        `## 第 ${page.pageNumber} 页\n\n${removePaginationLinks(
          page.result.markdownContent,
          firstUrl,
        )}`,
    )
    .join("\n\n---\n\n");
  const plainText = sortedPages
    .map((page) => page.result.plainText)
    .filter(Boolean)
    .join("\n\n");
  const hasPartialPage =
    failedPages > 0 ||
    sortedPages.some((page) => page.result.status !== "success");

  return {
    ...first,
    markdownContent,
    plainText,
    contentLength: markdownContent.length,
    status: hasPartialPage ? "partial" : "success",
    errorCode: hasPartialPage
      ? failedPages > 0
        ? "PAGINATION_PARTIAL"
        : first.errorCode
      : undefined,
    errorMessage: hasPartialPage
      ? failedPages > 0
        ? `已保存 ${sortedPages.length} 页，另有 ${failedPages} 页抓取失败`
        : first.errorMessage
      : undefined,
  };
}

export async function extractUrl(rawUrl: string): Promise<ExtractionResult> {
  try {
    const firstFetched = await safeFetchHtml(rawUrl);
    const firstResult = extractFromHtml(
      firstFetched.html,
      firstFetched.finalUrl,
      firstFetched.statusCode,
    );
    const pending = discoverPaginationUrls(
      firstFetched.html,
      firstFetched.finalUrl,
    );
    if (pending.length === 0) {
      return firstResult;
    }

    const pages: ExtractedPaginationPage[] = [
      { url: firstFetched.finalUrl, pageNumber: 1, result: firstResult },
    ];
    const visited = new Set([new URL(firstFetched.finalUrl).toString()]);
    let failedPages = 0;

    while (
      pending.length > 0 &&
      pages.length < MAX_PAGINATED_PAGES
    ) {
      const page = pending.shift();
      if (!page || visited.has(page.url)) {
        continue;
      }
      visited.add(page.url);
      try {
        const fetched = await safeFetchHtml(page.url);
        if (!isSamePaginationSeries(firstFetched.finalUrl, fetched.finalUrl)) {
          failedPages += 1;
          continue;
        }
        const result = extractFromHtml(
          fetched.html,
          fetched.finalUrl,
          fetched.statusCode,
        );
        pages.push({ ...page, url: fetched.finalUrl, result });
        for (const discovered of discoverPaginationUrls(
          fetched.html,
          firstFetched.finalUrl,
        )) {
          if (
            !visited.has(discovered.url) &&
            !pending.some((candidate) => candidate.url === discovered.url)
          ) {
            pending.push(discovered);
          }
        }
        pending.sort((left, right) => left.pageNumber - right.pageNumber);
      } catch {
        failedPages += 1;
      }
    }

    return mergePaginatedResults(
      pages,
      firstFetched.finalUrl,
      failedPages,
    );
  } catch (error) {
    const appError = toAppError(error);
    let finalUrl = rawUrl;
    let domain = rawUrl;
    try {
      const parsed = new URL(rawUrl);
      finalUrl = parsed.toString();
      domain = parsed.hostname;
    } catch {
      // URL validation failures are represented by the original input.
    }
    return {
      finalUrl,
      title: domain || rawUrl,
      domain,
      markdownContent: "",
      plainText: "",
      contentLength: 0,
      status: "failed",
      errorCode: appError.code,
      errorMessage: appError.message,
      httpStatusCode: appError.httpStatusCode,
    };
  }
}
