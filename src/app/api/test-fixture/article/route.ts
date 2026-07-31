import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

export async function GET() {
  if (
    process.env.ALLOW_TEST_LOOPBACK !== "1" ||
    process.env.NODE_ENV === "production"
  ) {
    return new Response("Not found", { status: 404 });
  }
  const html = fs.readFileSync(
    path.resolve(process.cwd(), "tests/fixtures/simple-article.html"),
    "utf8",
  );
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
