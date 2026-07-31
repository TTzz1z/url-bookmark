import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownView } from "@/components/markdown-view";

describe("Markdown 渲染 XSS 防护", () => {
  it("跳过原始 HTML 并移除脚本协议和危险图片协议", () => {
    const markdown = [
      "<script>window.__xss = true</script>",
      '<img src="x" onerror="window.__xss = true">',
      "[危险链接](javascript:alert(1))",
      "![危险图片](data:image/svg+xml;base64,PHN2Zz4=)",
      "![邮件图片](mailto:attacker@example.com)",
      "[安全链接](https://example.com/article)",
      "[邮件链接](mailto:reader@example.com)",
      "![本地图片](/api/bookmarks/demo-id/assets/0123456789abcdef01234567.webp)",
      "![越权相对路径](/data/assets/private.png)",
    ].join("\n\n");

    const html = renderToStaticMarkup(
      createElement(MarkdownView, null, markdown),
    );

    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('src="data:');
    expect(html).not.toContain('src="mailto:');
    expect(html).toContain('href="https://example.com/article"');
    expect(html).toContain('href="mailto:reader@example.com"');
    expect(html).toContain(
      'src="/api/bookmarks/demo-id/assets/0123456789abcdef01234567.webp"',
    );
    expect(html).not.toContain('src="/data/assets/private.png"');
  });
});
