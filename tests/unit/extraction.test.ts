import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  discoverPaginationUrls,
  extractFromHtml,
  extractMetadata,
} from "@/services/extraction-service";
import { JSDOM } from "jsdom";

function fixture(name: string): string {
  return fs.readFileSync(
    path.resolve(process.cwd(), "tests", "fixtures", name),
    "utf8",
  );
}

describe("元数据优先级", () => {
  it("优先使用 og:title", () => {
    const dom = new JSDOM(
      `<meta property="og:title" content="OG 标题">
       <meta name="twitter:title" content="Twitter 标题">
       <title>HTML 标题</title>`,
    );
    expect(
      extractMetadata(dom.window.document, "https://example.com/a").title,
    ).toBe("OG 标题");
  });
});

describe("正文提取与 Markdown", () => {
  it("提取普通中文文章并移除导航", () => {
    const result = extractFromHtml(
      fixture("simple-article.html"),
      "https://example.com/article",
    );
    expect(result.status).toBe("success");
    expect(result.title).toBe("构建可靠的网址收藏工作流");
    expect(result.markdownContent).toContain("## 从输入到阅读");
    expect(result.markdownContent).toContain(
      "https://example.com/guides/next-step",
    );
    expect(result.markdownContent).not.toContain("首页 产品 定价 登录");
  });

  it("从带侧栏的英文文章中保留正文", () => {
    const result = extractFromHtml(
      fixture("article-with-sidebar.html"),
      "https://example.com/pipeline",
    );
    expect(result.status).toBe("success");
    expect(result.markdownContent).toContain("Prefer deterministic behavior");
    expect(result.markdownContent).not.toContain("Unrelated recommendation");
  });

  it("保留带语言的代码块", () => {
    const result = extractFromHtml(
      fixture("article-with-code.html"),
      "https://example.com/code",
    );
    expect(result.markdownContent).toContain("```ts");
    expect(result.markdownContent).toContain("AbortController");
  });

  it("保留 GFM 表格", () => {
    const result = extractFromHtml(
      fixture("article-with-table.html"),
      "https://example.com/status",
    );
    expect(result.markdownContent).toMatch(/\|\s*状态\s*\|\s*含义\s*\|/);
    expect(result.markdownContent).toContain("| success");
  });

  it("将懒加载图片转换为绝对地址", () => {
    const result = extractFromHtml(
      fixture("article-with-lazy-image.html"),
      "https://example.com/guides/lazy",
    );
    expect(result.markdownContent).toContain(
      "![正文处理流程](https://example.com/assets/pipeline.png)",
    );
  });

  it("使用图注补全空图片说明并保留 Next.js 图片地址", () => {
    const result = extractFromHtml(
      `<!doctype html>
       <html>
         <head><title>Agent workflow</title></head>
         <body>
           <article>
             <h1>Building effective agents</h1>
             <p>${"Reliable agent workflows need observable tools and clear boundaries. ".repeat(12)}</p>
             <figure>
               <img src="/_next/image?url=https%3A%2F%2Fcdn.example.com%2Faugmented.png&amp;w=2400&amp;q=75">
               <figcaption>The augmented LLM</figcaption>
             </figure>
             <p>${"The diagram connects retrieval, tools, and memory with the language model. ".repeat(8)}</p>
           </article>
         </body>
       </html>`,
      "https://www.example.com/engineering/agents",
    );
    expect(result.markdownContent).toContain(
      "![The augmented LLM](https://www.example.com/_next/image?url=https%3A%2F%2Fcdn.example.com%2Faugmented.png&w=2400&q=75)",
    );
  });

  it("replaces a transparent lazy placeholder with the linked original image", () => {
    const result = extractFromHtml(
      `<!doctype html>
       <html>
         <head><title>Game guide</title></head>
         <body>
           <article>
             <h1>Game guide</h1>
             <p>${"This guide explains the game systems and recommended skills in detail. ".repeat(14)}</p>
             <p>
               <a href="https://www.example.com/showimage?https%3A%2F%2Fcdn.example.com%2Fguide-full.jpg">
                 <img src="https://cdn.example.com/common/blank.png"
                      data-src="https://cdn.example.com/guide-small.jpg"
                      alt="Guide screenshot">
               </a>
             </p>
             <p>${"The screenshot illustrates the steps described in the surrounding text. ".repeat(8)}</p>
           </article>
         </body>
       </html>`,
      "https://www.example.com/guide/100.shtml",
    );

    expect(result.markdownContent).toContain(
      "![Guide screenshot](https://cdn.example.com/guide-full.jpg)",
    );
    expect(result.markdownContent).not.toContain("blank.png");
    expect(result.markdownContent).not.toContain("guide-small.jpg");
  });

  it("空页面返回 partial", () => {
    const result = extractFromHtml(
      fixture("empty-page.html"),
      "https://example.com/empty",
    );
    expect(result.status).toBe("partial");
    expect(result.errorCode).toMatch(/CONTENT_TOO_SHORT|PARSE_FAILED/);
  });

  it("登录页返回 JS_REQUIRED", () => {
    const result = extractFromHtml(
      fixture("login-page.html"),
      "https://example.com/login",
    );
    expect(result.status).toBe("partial");
    expect(result.errorCode).toBe("JS_REQUIRED");
  });

  it("恢复畸形 HTML 并移除危险内容", () => {
    const result = extractFromHtml(
      fixture("malformed-page.html"),
      "https://example.com/malformed",
    );
    expect(result.markdownContent).toContain("畸形但可恢复");
    expect(result.markdownContent).not.toContain("<script");
    expect(result.markdownContent).not.toContain("javascript:");
  });
});

describe("paginated article discovery", () => {
  it("keeps only same-series article pages in numeric order", () => {
    const pages = discoverPaginationUrls(
      `<nav>
         <a href="/guide/100.shtml">1</a>
         <a href="/guide/100_3.shtml">3</a>
         <a href="/guide/100_2.shtml">2</a>
         <a href="/guide/999_2.shtml">下一页</a>
         <a href="https://external.example/page/2">下一页</a>
       </nav>`,
      "https://www.example.com/guide/100.shtml",
    );

    expect(pages).toEqual([
      { url: "https://www.example.com/guide/100_2.shtml", pageNumber: 2 },
      { url: "https://www.example.com/guide/100_3.shtml", pageNumber: 3 },
    ]);
  });
});
