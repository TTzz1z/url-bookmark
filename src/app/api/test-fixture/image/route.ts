export const runtime = "nodejs";

const fixturePng = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
);

export async function GET() {
  if (
    process.env.ALLOW_TEST_LOOPBACK !== "1" ||
    process.env.NODE_ENV === "production"
  ) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(fixturePng, {
    headers: {
      "content-type": "image/png",
      "content-length": String(fixturePng.byteLength),
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
