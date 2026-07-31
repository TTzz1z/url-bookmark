import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

function safeUrlTransform(url: string, key: string): string | undefined {
  const trimmed = url.trim();
  if (key === "src") {
    if (/^https?:\/\//i.test(trimmed)) {
      return defaultUrlTransform(trimmed);
    }
    if (
      /^\/api\/bookmarks\/[A-Za-z0-9_-]{1,128}\/assets\/[a-f0-9]{24}\.(?:png|jpg|gif|webp|avif)$/.test(
        trimmed,
      )
    ) {
      return trimmed;
    }
    return undefined;
  }
  if (
    trimmed.startsWith("#") ||
    /^https?:\/\//i.test(trimmed) ||
    /^mailto:/i.test(trimmed)
  ) {
    return defaultUrlTransform(trimmed);
  }
  return undefined;
}

export function MarkdownView({ children }: { children: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={safeUrlTransform}
        components={{
          a: ({ children: linkChildren, ...props }) => (
            <a {...props} rel="noreferrer noopener" target="_blank">
              {linkChildren}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
