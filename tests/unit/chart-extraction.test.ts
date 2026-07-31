import { describe, expect, it } from "vitest";
import {
  appendChartsToMarkdown,
  ensureSvgHasExplicitSize,
  extractVegaLiteSpecs,
  injectEmbeddedChartPlaceholders,
  prepareSpecForOfflineRender,
  resolveChartColorTokens,
} from "@/services/chart-extraction-service";
import { JSDOM } from "jsdom";

const fixture = String.raw`self.__next_f.push([1,"3a:{\"title\":\"使用 Codex 的活跃用户占比\",\"$schema\":\"https://vega.github.io/schema/vega-lite/v6.json\",\"datasets\":{\"rows\":[{\"date\":\"2025-08-01\",\"share\":0.4,\"population\":\"OpenAI\"}]},\"data\":{\"name\":\"rows\"},\"mark\":\"line\",\"encoding\":{\"x\":{\"field\":\"date\",\"type\":\"temporal\"},\"y\":{\"field\":\"share\",\"type\":\"quantitative\"},\"color\":{\"field\":\"population\",\"type\":\"nominal\"}}}"])`;

describe("嵌入图表提取", () => {
  it("从 RSC 转义载荷中解析 Vega-Lite spec", () => {
    const specs = extractVegaLiteSpecs(fixture);
    expect(specs).toHaveLength(1);
    expect(specs[0].$schema).toContain("vega-lite");
    expect(specs[0].title).toBe("使用 Codex 的活跃用户占比");
  });

  it("离线渲染前把 container 宽度改成固定值", () => {
    const prepared = prepareSpecForOfflineRender({
      width: "container",
      height: "container",
      mark: "line",
      data: { values: [] },
    });
    expect(prepared.width).toBeGreaterThanOrEqual(720);
    expect(prepared.height).toBeGreaterThanOrEqual(200);
    expect(prepared.autosize).toEqual({ type: "pad", contains: "padding" });
  });

  it("清洗标签里的字面量换行", () => {
    const prepared = prepareSpecForOfflineRender({
      width: 300,
      mark: "line",
      data: { values: [{ label: "Nov\\n2025" }] },
      encoding: {
        x: {
          field: "label",
          axis: { labelExpr: "datum.label + '\\n' + 'x'" },
        },
      },
    });
    expect(JSON.stringify(prepared)).not.toContain("\\\\n");
    expect(
      (prepared.data as { values: Array<{ label: string }> }).values[0].label,
    ).toBe("Nov 2025");
  });

  it("把站点主题令牌恢复成真实颜色", () => {
    const prepared = resolveChartColorTokens({
      encoding: {
        color: {
          scale: { range: ["theme1", "theme2", "theme3_orange"] },
        },
      },
      mark: { color: "theme2_gray" },
      data: { values: [{ label: "theme1" }] },
    });
    expect(
      (prepared.encoding as { color: { scale: { range: string[] } } }).color
        .scale.range,
    ).toEqual(["#2e4780", "#5477c4", "#ff9365"]);
    expect((prepared.mark as { color: string }).color).toBe("#767881");
    expect(
      (prepared.data as { values: Array<{ label: string }> }).values[0].label,
    ).toBe("theme1");
  });

  it("给 SVG 补上明确宽高，避免被浏览器挤扁", () => {
    const svg = ensureSvgHasExplicitSize(
      '<svg viewBox="0 0 10 10"><g></g></svg>',
    );
    expect(svg).toMatch(/width="[6-9]\d{2}"/);
    expect(svg).toMatch(/height="\d+"/);
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
  });

  it("把本地图表链接追加到 Markdown", () => {
    const markdown = appendChartsToMarkdown("正文第一段。", [
      {
        title: "使用 Codex 的活跃用户占比",
        localUrl: "/api/bookmarks/demo/assets/aaaaaaaaaaaaaaaaaaaaaaaa.svg",
      },
    ]);
    expect(markdown).toContain("## 图表");
    expect(markdown).toContain(
      "![使用 Codex 的活跃用户占比](/api/bookmarks/demo/assets/aaaaaaaaaaaaaaaaaaaaaaaa.svg)",
    );
  });

  it("把动态图表放回原始槽位并保持普通图片不变", () => {
    const dom = new JSDOM(`
      <article>
        <p>开头</p>
        <figure><div style="height: 400px"></div></figure>
        <img src="https://example.com/photo.png" alt="普通图片">
        <h2>下一节</h2>
      </article>
    `);
    injectEmbeddedChartPlaceholders(dom.window.document, [
      { sourceIndex: 0, placeholder: "BOOKMARK-DYNAMIC-CHART-0-DEMO" },
    ]);

    expect(dom.window.document.querySelector("figure")?.textContent).toContain(
      "BOOKMARK-DYNAMIC-CHART-0-DEMO",
    );
    expect(
      dom.window.document.querySelector("img")?.getAttribute("src"),
    ).toBe("https://example.com/photo.png");

    const markdown = appendChartsToMarkdown(
      [
        "开头",
        "",
        "BOOKMARK-DYNAMIC-CHART-0-DEMO",
        "",
        "![普通图片](https://example.com/photo.png)",
        "",
        "## 下一节",
      ].join("\n"),
      [
        {
          title: "动态图表",
          localUrl: "/api/bookmarks/demo/assets/aaaaaaaaaaaaaaaaaaaaaaaa.svg",
          placeholder: "BOOKMARK-DYNAMIC-CHART-0-DEMO",
        },
      ],
    );
    expect(markdown).toContain(
      "![动态图表](/api/bookmarks/demo/assets/aaaaaaaaaaaaaaaaaaaaaaaa.svg)\n\n![普通图片](https://example.com/photo.png)",
    );
    expect(markdown.indexOf("![动态图表]")).toBeLessThan(
      markdown.indexOf("## 下一节"),
    );
  });

  it("不会把图表误插到包含标题词的正文句子中", () => {
    const markdown = appendChartsToMarkdown(
      "Non-developer adoption grew rapidly in the last year.",
      [
        {
          title: "Non-developer",
          localUrl: "/api/bookmarks/demo/assets/aaaaaaaaaaaaaaaaaaaaaaaa.svg",
        },
      ],
    );
    expect(markdown).toContain("## Charts");
    expect(markdown.indexOf("![Non-developer]")).toBeGreaterThan(
      markdown.indexOf("## Charts"),
    );
  });
});
