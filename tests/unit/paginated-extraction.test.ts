import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeFetchHtml } from "@/services/fetch-service";
import { extractUrl } from "@/services/extraction-service";

vi.mock("@/services/fetch-service", () => ({
  safeFetchHtml: vi.fn(),
}));

const mockedSafeFetchHtml = vi.mocked(safeFetchHtml);

function pageHtml(pageNumber: number, nextPage?: number): string {
  const nextLink = nextPage
    ? `<nav><a rel="next" href="/guide/100_${nextPage}.shtml">下一页</a></nav>`
    : "";
  return `<!doctype html>
    <html>
      <head><title>Complete game guide</title></head>
      <body>
        <article>
          <h1>Complete game guide</h1>
          <p>${`Unique page ${pageNumber} instructions explain the controls, equipment, missions, and navigation. `.repeat(14)}</p>
          ${nextLink}
        </article>
      </body>
    </html>`;
}

describe("paginated URL extraction", () => {
  beforeEach(() => {
    mockedSafeFetchHtml.mockReset();
    mockedSafeFetchHtml.mockImplementation(async (value) => {
      const url = value.toString();
      const pageNumber = url.includes("_3.shtml")
        ? 3
        : url.includes("_2.shtml")
          ? 2
          : 1;
      return {
        html: pageHtml(pageNumber, pageNumber < 3 ? pageNumber + 1 : undefined),
        finalUrl:
          pageNumber === 1
            ? "https://www.example.com/guide/100.shtml"
            : `https://www.example.com/guide/100_${pageNumber}.shtml`,
        statusCode: 200,
        contentType: "text/html",
      };
    });
  });

  it("follows bounded same-series next links and merges pages", async () => {
    const result = await extractUrl(
      "https://www.example.com/guide/100.shtml",
    );

    expect(result.status).toBe("success");
    expect(result.markdownContent).toContain("## 第 1 页");
    expect(result.markdownContent).toContain("## 第 2 页");
    expect(result.markdownContent).toContain("## 第 3 页");
    expect(result.markdownContent).toContain("Unique page 1 instructions");
    expect(result.markdownContent).toContain("Unique page 2 instructions");
    expect(result.markdownContent).toContain("Unique page 3 instructions");
    expect(mockedSafeFetchHtml).toHaveBeenCalledTimes(3);
  });
});
