import { createHash } from "node:crypto";

export type GeneratedChartImage = {
  title: string;
  contentType: "image/png" | "image/svg+xml";
  body: Uint8Array;
  sourceIndex: number;
  placeholder: string;
};

const VEGA_SCHEMA_MARKER = "https://vega.github.io/schema/vega-lite";
const MAX_CHARTS = 12;
const DEFAULT_CHART_WIDTH = 880;
const DEFAULT_CHART_HEIGHT = 460;
const MIN_CHART_WIDTH = 720;
const CHART_PLACEHOLDER_PREFIX = "BOOKMARK-DYNAMIC-CHART";

type ChartTheme = "blue" | "yellow" | "orange" | "green" | "pink" | "gray";

const chartThemeBySpec = new WeakMap<Record<string, unknown>, ChartTheme>();
const CHART_THEME_COLORS: Record<ChartTheme, readonly string[]> = {
  blue: ["#2e4780", "#5477c4", "#a3befa", "#cedffe", "#eaf1fe"],
  yellow: ["#736422", "#b8a037", "#ffe15b", "#ffea8f", "#fff4c2"],
  orange: ["#804126", "#cc6f47", "#ff9365", "#ffbda1", "#ffedde"],
  green: ["#386411", "#71b436", "#a3d576", "#beeb96", "#d8ecbd"],
  pink: ["#8a3a6f", "#bd569b", "#f390ca", "#f5bacc", "#fcdad6"],
  gray: ["#47484f", "#767881", "#bcbec4", "#dddee1", "#f0f1f2"],
};
const COLOR_VALUE_KEYS = new Set([
  "background",
  "color",
  "fill",
  "stroke",
  "keyline",
]);

function chartTitle(spec: Record<string, unknown>, fallback: string): string {
  const title = spec.title;
  if (typeof title === "string" && title.trim()) {
    return title.trim();
  }
  if (
    title &&
    typeof title === "object" &&
    typeof (title as { text?: unknown }).text === "string" &&
    (title as { text: string }).text.trim()
  ) {
    return (title as { text: string }).text.trim();
  }
  return fallback;
}

function chartPlaceholder(title: string, sourceIndex: number): string {
  const fingerprint = createHash("sha256")
    .update(`${sourceIndex}\0${title}`)
    .digest("hex")
    .slice(0, 12)
    .toLocaleUpperCase();
  return `${CHART_PLACEHOLDER_PREFIX}-${sourceIndex}-${fingerprint}`;
}

function isEmptyChartSlot(element: Element): boolean {
  if (element.tagName !== "DIV" || !element.closest("figure")) {
    return false;
  }
  if (element.children.length > 0 || element.textContent?.trim()) {
    return false;
  }
  const height = (element as HTMLElement).style.height;
  const match = height.match(/^(\d+(?:\.\d+)?)px$/i);
  return Boolean(match && Number.parseFloat(match[1]) >= 150);
}

/**
 * 把脚本中渲染的图表映射回服务端 HTML 里的空图表槽位。
 * 仅处理 figure 内带明确高度的空 div，不会改动普通 <img>。
 */
export function injectEmbeddedChartPlaceholders(
  document: Document,
  charts: ReadonlyArray<Pick<GeneratedChartImage, "sourceIndex" | "placeholder">>,
): void {
  if (charts.length === 0) {
    return;
  }
  const slots = Array.from(document.querySelectorAll("figure div[style]")).filter(
    isEmptyChartSlot,
  );
  for (const chart of charts) {
    const slot = slots[chart.sourceIndex];
    if (!slot) {
      continue;
    }
    const marker = document.createElement("p");
    marker.textContent = chart.placeholder;
    marker.setAttribute("data-bookmark-dynamic-chart", "true");
    slot.replaceWith(marker);
  }
}

export function stripEmbeddedChartPlaceholders(
  value: string,
  charts: ReadonlyArray<Pick<GeneratedChartImage, "placeholder">>,
): string {
  let next = value;
  for (const chart of charts) {
    next = next.replaceAll(chart.placeholder, " ");
  }
  return next.replace(/\s+/g, " ").trim();
}

function isRenderableVegaLiteSpec(spec: Record<string, unknown>): boolean {
  const schema = spec.$schema;
  if (typeof schema !== "string" || !schema.includes("vega-lite")) {
    return false;
  }
  const hasData = Boolean(spec.data || spec.datasets);
  const hasVisual =
    Boolean(spec.mark) ||
    Boolean(spec.layer) ||
    Boolean(spec.hconcat) ||
    Boolean(spec.vconcat) ||
    Boolean(spec.concat) ||
    Boolean(spec.facet) ||
    Boolean(spec.repeat) ||
    Boolean(spec.spec);
  return hasData && hasVisual;
}

function findObjectStart(html: string, fromIndex: number): number {
  let depth = 0;
  for (let index = fromIndex; index >= 0; index -= 1) {
    const char = html[index];
    if (char === "}") {
      depth += 1;
    } else if (char === "{") {
      if (depth === 0) {
        return index;
      }
      depth -= 1;
    }
  }
  return -1;
}

function findObjectEnd(html: string, start: number): number {
  let depth = 0;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index];
    if (char === "\\" && html[index + 1] === '"') {
      index += 1;
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function parseEmbeddedSpec(raw: string): Record<string, unknown> | null {
  const candidates = raw.includes('\\"')
    ? [raw.replace(/\\"/g, '"'), raw]
    : [raw];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      if (isRenderableVegaLiteSpec(parsed)) {
        return parsed;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

function chartThemeBeforeSpec(html: string, specStart: number): ChartTheme {
  const prefix = html.slice(Math.max(0, specStart - 8_000), specStart);
  const pattern =
    /\\?"theme\\?"\s*:\s*\\?"(blue|yellow|orange|green|pink|gray)\\?"/gi;
  let selected: ChartTheme = "blue";
  for (const match of prefix.matchAll(pattern)) {
    selected = match[1].toLocaleLowerCase() as ChartTheme;
  }
  return selected;
}

export function extractVegaLiteSpecs(html: string): Record<string, unknown>[] {
  const specs: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  let from = 0;

  while (from < html.length && specs.length < MAX_CHARTS) {
    const markerIndex = html.indexOf(VEGA_SCHEMA_MARKER, from);
    if (markerIndex < 0) {
      break;
    }
    from = markerIndex + VEGA_SCHEMA_MARKER.length;
    const start = findObjectStart(html, markerIndex);
    if (start < 0) {
      continue;
    }
    const end = findObjectEnd(html, start);
    if (end < 0) {
      continue;
    }
    const parsed = parseEmbeddedSpec(html.slice(start, end + 1));
    if (!parsed) {
      continue;
    }
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(parsed))
      .digest("hex")
      .slice(0, 24);
    if (seen.has(fingerprint)) {
      continue;
    }
    seen.add(fingerprint);
    chartThemeBySpec.set(parsed, chartThemeBeforeSpec(html, start));
    specs.push(parsed);
  }

  return specs;
}

function isBlankSize(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "container" ||
    value === "auto" ||
    value === 0 ||
    value === "0"
  );
}

function normalizeSizeValue(
  value: unknown,
  fallback: number,
  minimum: number,
): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.max(value, minimum);
  }
  if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim())) {
    return Math.max(Number.parseFloat(value), minimum);
  }
  return fallback;
}

/**
 * 清洗字面量 `\n`，避免轴标签显示成 Nov\n2025。
 */
export function sanitizeSpecStrings<T>(value: T): T {
  if (typeof value === "string") {
    // 轴标签里的字面量 \n / 真换行都会让离线文本排版崩掉，统一成空格。
    return value.replace(/\\n/g, " ").replace(/\r?\n/g, " ") as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSpecStrings(item)) as T;
  }
  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      next[key] = sanitizeSpecStrings(nested);
    }
    return next as T;
  }
  return value;
}

function resolveThemeToken(token: string, theme: ChartTheme): string {
  const match = token.match(
    /^theme([1-5])(?:_(blue|yellow|orange|green|pink|gray))?$/i,
  );
  if (!match) {
    return token;
  }
  const palette =
    CHART_THEME_COLORS[(match[2]?.toLocaleLowerCase() as ChartTheme) || theme];
  return palette[Number.parseInt(match[1], 10) - 1] ?? token;
}

/**
 * OpenAI 等站点会把 CSS 主题令牌直接写进 Vega 的颜色范围。Node Canvas
 * 不认识 `theme1` 这类值，会统一退化为灰色；离线编译前将它们解析为颜色。
 */
export function resolveChartColorTokens<T>(
  value: T,
  theme: ChartTheme = "blue",
  parentKey = "",
): T {
  if (typeof value === "string") {
    return (
      parentKey === "range" || COLOR_VALUE_KEYS.has(parentKey)
        ? resolveThemeToken(value, theme)
        : value
    ) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      resolveChartColorTokens(item, theme, parentKey),
    ) as T;
  }
  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      next[key] = resolveChartColorTokens(nested, theme, key);
    }
    return next as T;
  }
  return value;
}

/**
 * OpenAI 等站点常用 width: "container"。无 DOM 容器时 Vega 会塌缩；
 * 离线渲染前改成固定尺寸，并把轴标签换行改成空格以免叠字。
 */
export function prepareSpecForOfflineRender(
  spec: Record<string, unknown>,
): Record<string, unknown> {
  const prepared = resolveChartColorTokens(
    sanitizeSpecStrings(
      JSON.parse(JSON.stringify(spec)) as Record<string, unknown>,
    ),
    chartThemeBySpec.get(spec) ?? "blue",
  );

  const visit = (node: Record<string, unknown>, isRoot: boolean) => {
    const complexLayout = Boolean(
      node.facet || node.hconcat || node.vconcat || node.concat || node.repeat,
    );
    const targetWidth = complexLayout
      ? DEFAULT_CHART_WIDTH + 120
      : DEFAULT_CHART_WIDTH;

    if (isBlankSize(node.width)) {
      node.width = isRoot ? targetWidth : Math.round(targetWidth / 2);
    } else {
      node.width = normalizeSizeValue(
        node.width,
        targetWidth,
        isRoot ? MIN_CHART_WIDTH : 200,
      );
    }

    if (isBlankSize(node.height) || node.height === "container") {
      if (isRoot) {
        node.height = complexLayout
          ? DEFAULT_CHART_HEIGHT + 80
          : DEFAULT_CHART_HEIGHT;
      } else if (node.height === "container") {
        node.height = Math.round(DEFAULT_CHART_HEIGHT / 2);
      }
    }

    node.autosize = { type: "pad", contains: "padding" };

    const encoding = node.encoding;
    if (encoding && typeof encoding === "object") {
      for (const channel of Object.values(
        encoding as Record<string, unknown>,
      )) {
        if (!channel || typeof channel !== "object") {
          continue;
        }
        const axis = (channel as { axis?: unknown }).axis;
        if (axis && typeof axis === "object") {
          const axisRecord = axis as Record<string, unknown>;
          if (typeof axisRecord.labelExpr === "string") {
            axisRecord.labelExpr = axisRecord.labelExpr
              .replace(/\\n/g, " ")
              .replace(/\n/g, " ");
          }
          if (typeof axisRecord.format === "string") {
            axisRecord.format = axisRecord.format
              .replace(/\\n/g, " ")
              .replace(/\n/g, " ");
          }
        }
      }
    }

    for (const key of ["layer", "hconcat", "vconcat", "concat"] as const) {
      const children = node[key];
      if (Array.isArray(children)) {
        for (const child of children) {
          if (child && typeof child === "object") {
            visit(child as Record<string, unknown>, false);
          }
        }
      }
    }
    if (node.spec && typeof node.spec === "object") {
      visit(node.spec as Record<string, unknown>, false);
    }
  };

  visit(prepared, true);
  return prepared;
}

export function ensureSvgHasExplicitSize(svg: string): string {
  return svg.replace(/<svg\b([^>]*)>/i, (_match, rawAttrs: string) => {
    let attrs = rawAttrs;
    const widthMatch = attrs.match(/\bwidth="([^"]*)"/i);
    const heightMatch = attrs.match(/\bheight="([^"]*)"/i);
    const width = normalizeSizeValue(
      widthMatch?.[1],
      DEFAULT_CHART_WIDTH,
      MIN_CHART_WIDTH,
    );
    const height = normalizeSizeValue(
      heightMatch?.[1],
      DEFAULT_CHART_HEIGHT,
      200,
    );

    if (widthMatch) {
      attrs = attrs.replace(/\bwidth="[^"]*"/i, `width="${width}"`);
    } else {
      attrs += ` width="${width}"`;
    }
    if (heightMatch) {
      attrs = attrs.replace(/\bheight="[^"]*"/i, `height="${height}"`);
    } else {
      attrs += ` height="${height}"`;
    }
    if (!/\bviewBox="/i.test(attrs)) {
      attrs += ` viewBox="0 0 ${width} ${height}"`;
    }
    if (!/\bpreserveAspectRatio="/i.test(attrs)) {
      attrs += ` preserveAspectRatio="xMidYMid meet"`;
    }
    return `<svg${attrs}>`;
  });
}

async function renderSpecToImage(
  spec: Record<string, unknown>,
): Promise<{
  contentType: "image/png" | "image/svg+xml";
  body: Uint8Array;
} | null> {
  try {
    // 先加载 canvas，让 vega-canvas 能量到真实字体宽度，避免标签叠成一团。
    await import("canvas");
    const vega = await import("vega");
    const vegaLite = await import("vega-lite");
    const prepared = prepareSpecForOfflineRender(spec);
    const compiled = vegaLite.compile(prepared as never, {
      config: {
        background: "#ffffff",
        autosize: { type: "pad", contains: "padding" },
        view: { continuousWidth: DEFAULT_CHART_WIDTH },
        axis: {
          labelLimit: 180,
          labelOverlap: true,
          labelPadding: 6,
        },
        legend: {
          labelLimit: 220,
        },
      },
    }).spec;

    const view = new vega.View(vega.parse(compiled), {
      renderer: "canvas",
    });
    const preparedWidth = prepared.width;
    if (
      typeof preparedWidth === "number" &&
      !prepared.hconcat &&
      !prepared.vconcat &&
      !prepared.concat &&
      !prepared.facet
    ) {
      view.width(preparedWidth);
    }
    try {
      await view.runAsync();
      try {
        const canvasNode = await view.toCanvas(1.25);
        const maybeBuffer = (
          canvasNode as unknown as { toBuffer?: (type: string) => Buffer }
        ).toBuffer?.("image/png");
        if (maybeBuffer && maybeBuffer.byteLength > 100) {
          return {
            contentType: "image/png",
            body: new Uint8Array(maybeBuffer),
          };
        }
      } catch {
        // fall through to SVG
      }

      const svg = ensureSvgHasExplicitSize(await view.toSVG());
      if (!svg.includes("<svg") || svg.length < 200) {
        return null;
      }
      return {
        contentType: "image/svg+xml",
        body: new TextEncoder().encode(svg),
      };
    } finally {
      view.finalize();
    }
  } catch {
    return null;
  }
}

/**
 * 从页面 HTML 中提取嵌入的 Vega-Lite 图（常见于 OpenAI 等站点的交互图表），
 * 渲染为可本地归档的 PNG/SVG。普通 <img> 仍走原有图片本地化链路。
 */
export async function extractEmbeddedCharts(
  html: string,
): Promise<GeneratedChartImage[]> {
  const specs = extractVegaLiteSpecs(html);
  const charts: GeneratedChartImage[] = [];

  for (const [index, spec] of specs.entries()) {
    const rendered = await renderSpecToImage(spec);
    if (!rendered) {
      continue;
    }
    const title = chartTitle(spec, `图表 ${index + 1}`);
    charts.push({
      title,
      contentType: rendered.contentType,
      body: rendered.body,
      sourceIndex: index,
      placeholder: chartPlaceholder(title, index),
    });
  }

  return charts;
}

export function appendChartsToMarkdown(
  markdownContent: string,
  charts: Array<{ title: string; localUrl: string; placeholder?: string }>,
): string {
  if (charts.length === 0) {
    return markdownContent;
  }

  let next = markdownContent;
  const pending: Array<{
    title: string;
    localUrl: string;
    placeholder?: string;
  }> = [];

  const standaloneTitleEnd = (title: string): number | null => {
    const normalizedTitle = title
      .replace(/[*_`~]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase();
    let offset = 0;
    for (const line of next.split("\n")) {
      const normalizedLine = line
        .replace(/^#{1,6}\s+/, "")
        .replace(/[*_`~]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase();
      if (normalizedLine === normalizedTitle) {
        return (
          offset + line.length + (offset + line.length < next.length ? 1 : 0)
        );
      }
      offset += line.length + 1;
    }
    return null;
  };

  for (const chart of charts) {
    const imageMarkdown = `![${chart.title.replace(/[\[\]]/g, "")}](${chart.localUrl})`;
    if (next.includes(imageMarkdown)) {
      continue;
    }
    if (chart.placeholder && next.includes(chart.placeholder)) {
      next = next.replace(chart.placeholder, imageMarkdown);
      continue;
    }
    const insertAt = standaloneTitleEnd(chart.title);
    if (insertAt !== null) {
      next = `${next.slice(0, insertAt)}\n${imageMarkdown}\n${next.slice(insertAt)}`;
      continue;
    }
    pending.push(chart);
  }

  if (pending.length === 0) {
    return next.trim();
  }

  const sectionTitle = pending.some((chart) =>
    /[\u3400-\u9fff]/.test(chart.title),
  )
    ? "## 图表"
    : "## Charts";
  const section = [
    sectionTitle,
    "",
    ...pending.flatMap((chart) => [
      `![${chart.title.replace(/[\[\]]/g, "")}](${chart.localUrl})`,
      "",
    ]),
  ].join("\n");

  if (next.includes(sectionTitle)) {
    return `${next.trim()}\n\n${pending
      .map(
        (chart) =>
          `![${chart.title.replace(/[\[\]]/g, "")}](${chart.localUrl})`,
      )
      .join("\n\n")}\n`.trim();
  }
  return `${next.trim()}\n\n${section}`.trim();
}
