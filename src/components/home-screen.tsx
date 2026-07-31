"use client";

import Link from "next/link";
import {
  ArrowSquareOut,
  ArrowsClockwise,
  BookOpenText,
  BookmarkSimple,
  DotsThree,
  Funnel,
  GlobeSimple,
  List,
  MagnifyingGlass,
  NotePencil,
  PaperPlaneTilt,
  PencilSimple,
  Plus,
  Rows,
  SortAscending,
  SpinnerGap,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import {
  Fragment,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { AppShell } from "./app-shell";
import { ConfirmDialog } from "./confirm-dialog";
import { EmptyState } from "./empty-state";
import { ShortcutHelp } from "./shortcut-help";
import { StatusBadge } from "./status-badge";
import { TagManager } from "./tag-manager";
import { showToast } from "./toast";
import { describeError, throwApiError } from "@/lib/client-errors";
import { formatRelativeTime } from "@/lib/format-date";
import { errorMessages, type AppErrorCode } from "@/lib/errors";
import { tagDotIndex } from "@/lib/tag-color";
import type { BookmarkDto, BookmarkListDto, TagDto } from "@/types/api";
import type { ExtractionStatus } from "@/db/schema";

const PAGE_SIZE = 50;
const LIST_SCROLL_KEY = "bookmark-list-scroll";
const DENSITY_KEY = "bookmark-list-density";

type ListDensity = "comfortable" | "compact";

function readDensityPreference(): ListDensity {
  try {
    return localStorage.getItem(DENSITY_KEY) === "compact"
      ? "compact"
      : "comfortable";
  } catch {
    return "comfortable";
  }
}

const statusFilters: Array<{
  value: ExtractionStatus | "";
  label: string;
}> = [
  { value: "", label: "全部" },
  { value: "pending", label: "正在提取" },
  { value: "success", label: "提取成功" },
  { value: "partial", label: "部分提取" },
  { value: "failed", label: "提取失败" },
];

function describeExtractionFailure(bookmark: BookmarkDto): string {
  const code = bookmark.errorCode as AppErrorCode | null;
  if (code && code in errorMessages) {
    return errorMessages[code];
  }
  return bookmark.errorMessage ?? "无法提取网页正文";
}

function isLikelyHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function highlightText(text: string, query: string): ReactNode {
  if (!query) {
    return text;
  }
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "giu"));
  return parts.map((part, index) =>
    part.localeCompare(query, undefined, { sensitivity: "accent" }) === 0 ? (
      <mark className="search-highlight" key={`${part}-${index}`}>
        {part}
      </mark>
    ) : (
      <Fragment key={`${part}-${index}`}>{part}</Fragment>
    ),
  );
}

function matchingExcerpt(bookmark: BookmarkDto, query: string): string | null {
  if (!query) {
    return null;
  }
  const normalizedQuery = query.toLocaleLowerCase();
  for (const candidate of [
    bookmark.userNote,
    bookmark.plainText,
    bookmark.markdownContent,
  ]) {
    const normalizedCandidate = candidate.toLocaleLowerCase();
    const matchIndex = normalizedCandidate.indexOf(normalizedQuery);
    if (matchIndex === -1) {
      continue;
    }
    const start = Math.max(0, matchIndex - 55);
    const end = Math.min(candidate.length, matchIndex + query.length + 105);
    const excerpt = candidate
      .slice(start, end)
      .replace(/[#>*_`~[\]()!-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return `${start > 0 ? "…" : ""}${excerpt}${end < candidate.length ? "…" : ""}`;
  }
  return null;
}

function syncListQuery(params: {
  tag?: string;
  status?: string;
  q?: string;
  sort?: string;
}) {
  const nextUrl = new URL(window.location.href);
  const apply = (key: string, value: string | undefined) => {
    if (value) nextUrl.searchParams.set(key, value);
    else nextUrl.searchParams.delete(key);
  };
  apply("tag", params.tag);
  apply("status", params.status);
  apply("q", params.q);
  if (params.sort && params.sort !== "created") {
    nextUrl.searchParams.set("sort", params.sort);
  } else {
    nextUrl.searchParams.delete("sort");
  }
  window.history.replaceState(null, "", nextUrl);
}

function BookmarkSkeletonList() {
  return (
    <div className="bookmark-skeleton-list" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <div className="bookmark-card is-skeleton" key={index}>
          <div className="skeleton-row">
            <span className="skeleton-block skeleton-badge" />
            <span className="skeleton-block skeleton-badge" />
          </div>
          <span className="skeleton-block skeleton-title" />
          <span className="skeleton-block skeleton-url" />
          <span className="skeleton-block skeleton-summary" />
        </div>
      ))}
    </div>
  );
}

function PendingCreationCard({ url }: { url: string }) {
  return (
    <article
      className="bookmark-card is-pending-creation is-extracting"
      aria-live="polite"
    >
      <div className="bookmark-card-topline">
        <div className="bookmark-card-badges">
          <span className="status-badge status-pending">
            <SpinnerGap className="is-spinning" size={14} aria-hidden="true" />
            正在提取
          </span>
        </div>
      </div>
      <p className="pending-creation-url">{url}</p>
      <div className="extracting-skeleton" aria-hidden="true">
        <span className="skeleton-block skeleton-title" />
        <span className="skeleton-block skeleton-summary" />
      </div>
      <p className="pending-creation-hint">
        正在抓取网页并转换为 Markdown，长文可能需要十几秒。
      </p>
    </article>
  );
}

function CardMenu({
  bookmark,
  deleting,
  onDelete,
}: {
  bookmark: BookmarkDto;
  deleting: boolean;
  onDelete: (bookmark: BookmarkDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", handlePointer);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handlePointer);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div className="card-menu" ref={rootRef}>
      <button
        className="icon-button compact"
        type="button"
        aria-label="更多操作"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((value) => !value)}
      >
        <DotsThree size={18} weight="bold" />
      </button>
      {open && (
        <div className="card-menu-panel" role="group" aria-label="书签操作">
          <Link
            className="card-menu-item"
            href={`/bookmarks/${bookmark.id}?edit=1`}
            onClick={() => setOpen(false)}
          >
            <PencilSimple size={15} />
            编辑
          </Link>
          <Link
            className="card-menu-item"
            href={`/bookmarks/${bookmark.id}`}
            onClick={() => setOpen(false)}
          >
            <ArrowsClockwise size={15} />
            查看并重新提取
          </Link>
          <button
            className="card-menu-item is-danger"
            type="button"
            disabled={deleting}
            onClick={() => {
              setOpen(false);
              onDelete(bookmark);
            }}
          >
            {deleting ? (
              <SpinnerGap className="is-spinning" size={15} />
            ) : (
              <Trash size={15} weight="fill" />
            )}
            删除
          </button>
        </div>
      )}
    </div>
  );
}

function BookmarkCard({
  bookmark,
  query,
  deleting,
  index,
  onDelete,
}: {
  bookmark: BookmarkDto;
  query: string;
  deleting: boolean;
  index: number;
  onDelete: (bookmark: BookmarkDto) => void;
}) {
  const summary =
    matchingExcerpt(bookmark, query) ||
    bookmark.description?.trim() ||
    bookmark.plainText.trim().slice(0, 160) ||
    (bookmark.extractionStatus === "pending"
      ? "正在提取正文…"
      : "尚未提取到正文，可打开详情查看原因并手动补充内容。");

  const cardClass = [
    "bookmark-card",
    bookmark.extractionStatus === "pending" ? "is-extracting" : "",
    bookmark.extractionStatus === "failed" ? "is-failed" : "",
    bookmark.extractionStatus === "partial" ? "is-partial" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article
      className={cardClass}
      data-testid="bookmark-card"
      data-bookmark-card
      style={
        {
          "--card-stagger": `${Math.min(index, 8) * 30}ms`,
        } as CSSProperties
      }
    >
      <div className="bookmark-card-content">
        <div className="bookmark-card-topline">
          <div className="bookmark-card-badges">
            <span className="bookmark-domain-badge">
              <GlobeSimple size={13} weight="fill" aria-hidden="true" />
              <span>{highlightText(bookmark.domain, query)}</span>
            </span>
            <StatusBadge status={bookmark.extractionStatus} />
          </div>
          <div className="bookmark-card-actions">
            <Link
              className="bookmark-read-link"
              href={`/bookmarks/${bookmark.id}`}
              onClick={() => {
                sessionStorage.setItem(LIST_SCROLL_KEY, String(window.scrollY));
              }}
            >
              <BookOpenText size={16} weight="fill" aria-hidden="true" />
              阅读全文
            </Link>
            <a
              className="icon-button compact"
              data-external-link
              href={bookmark.finalUrl}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="在新窗口打开原网页"
            >
              <ArrowSquareOut size={17} />
            </a>
            <CardMenu
              bookmark={bookmark}
              deleting={deleting}
              onDelete={onDelete}
            />
          </div>
        </div>

        <Link
          className="bookmark-title"
          href={`/bookmarks/${bookmark.id}`}
          onClick={() => {
            sessionStorage.setItem(LIST_SCROLL_KEY, String(window.scrollY));
          }}
        >
          {highlightText(bookmark.title, query)}
        </Link>

        <div className="bookmark-meta-line">
          <time dateTime={bookmark.createdAt} title={bookmark.createdAt}>
            {formatRelativeTime(bookmark.createdAt)}
          </time>
          <span className="bookmark-url-hint" title={bookmark.finalUrl}>
            {highlightText(
              bookmark.finalUrl.replace(/^https?:\/\//, ""),
              query,
            )}
          </span>
        </div>

        {bookmark.extractionStatus === "pending" ? (
          <div className="extracting-skeleton" aria-hidden="true">
            <span className="skeleton-block skeleton-summary" />
          </div>
        ) : (
          <p className="bookmark-summary">{highlightText(summary, query)}</p>
        )}

        {bookmark.extractionStatus === "partial" && (
          <div className="inline-notice">
            <WarningCircle size={16} weight="fill" aria-hidden="true" />
            <span>内容可能不完整，可重新提取或手动编辑。</span>
          </div>
        )}
        {bookmark.extractionStatus === "failed" && (
          <div className="inline-error" title={bookmark.errorCode ?? undefined}>
            <WarningCircle size={17} weight="fill" aria-hidden="true" />
            <strong>抓取失败</strong>
            <span>{describeExtractionFailure(bookmark)}</span>
            <Link
              className="inline-error-action"
              href={`/bookmarks/${bookmark.id}`}
            >
              重试
            </Link>
          </div>
        )}

        <div className="bookmark-card-footer">
          <div className="bookmark-tags">
            {bookmark.tags.map((tagItem) => (
              <span className="tag-chip" key={tagItem.id}>
                <span
                  className={`tag-chip-dot tag-dot-${tagDotIndex(tagItem.name)}`}
                />
                {highlightText(tagItem.name, query)}
              </span>
            ))}
            {bookmark.tags.length === 0 && (
              <Link
                className="tag-placeholder"
                href={`/bookmarks/${bookmark.id}?edit=1`}
              >
                <Plus size={13} /> 添加标签
              </Link>
            )}
          </div>
          {bookmark.userNote.trim() && (
            <div className="bookmark-note">
              <NotePencil size={14} weight="fill" aria-hidden="true" />
              <span>
                备注：{highlightText(bookmark.userNote.trim(), query)}
              </span>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function HomeScreen() {
  const [bookmarks, setBookmarks] = useState<BookmarkDto[]>([]);
  const [tags, setTags] = useState<TagDto[]>([]);
  const [total, setTotal] = useState(0);
  const [url, setUrl] = useState("");
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [status, setStatus] = useState<ExtractionStatus | "">("");
  const [sort, setSort] = useState<"created" | "updated" | "title">("created");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [pendingCreationUrl, setPendingCreationUrl] = useState("");
  const [addExpanded, setAddExpanded] = useState(false);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [shortcutOpen, setShortcutOpen] = useState(false);
  const [density, setDensity] = useState<ListDensity>("comfortable");
  const [deletingId, setDeletingId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<BookmarkDto | null>(null);
  const [pageError, setPageError] = useState("");
  const bookmarkRequestId = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const filtersHydrated = useRef(false);
  const hasLoadedBookmarks = useRef(false);

  useEffect(() => {
    const timeout = setTimeout(() => setQuery(queryInput.trim()), 260);
    return () => clearTimeout(timeout);
  }, [queryInput]);

  useEffect(() => {
    queueMicrotask(() => setDensity(readDensityPreference()));
  }, []);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const tagFromUrl = searchParams.get("tag") ?? "";
    const statusFromUrl = searchParams.get("status") ?? "";
    const queryFromUrl = searchParams.get("q") ?? "";
    const sortFromUrl = searchParams.get("sort");
    queueMicrotask(() => {
      if (tagFromUrl) setSelectedTag(tagFromUrl);
      if (
        statusFromUrl === "pending" ||
        statusFromUrl === "success" ||
        statusFromUrl === "partial" ||
        statusFromUrl === "failed"
      ) {
        setStatus(statusFromUrl);
      }
      if (queryFromUrl) {
        setQueryInput(queryFromUrl);
        setQuery(queryFromUrl);
      }
      if (
        sortFromUrl === "created" ||
        sortFromUrl === "updated" ||
        sortFromUrl === "title"
      ) {
        setSort(sortFromUrl);
      }
      if (searchParams.get("manageTags") === "1") {
        setTagManagerOpen(true);
      }
      filtersHydrated.current = true;
    });

    if (window.location.hash === "#add-bookmark") {
      queueMicrotask(() => {
        setAddExpanded(true);
        urlInputRef.current?.focus();
      });
    }

    const savedScroll = sessionStorage.getItem(LIST_SCROLL_KEY);
    if (savedScroll) {
      sessionStorage.removeItem(LIST_SCROLL_KEY);
      const top = Number(savedScroll);
      if (Number.isFinite(top) && top > 0) {
        requestAnimationFrame(() => window.scrollTo(0, top));
      }
    }
  }, []);

  useEffect(() => {
    if (!filtersHydrated.current) return;
    syncListQuery({
      tag: selectedTag || undefined,
      status: status || undefined,
      q: query || undefined,
      sort,
    });
  }, [selectedTag, status, query, sort]);

  const loadTags = useCallback(async () => {
    const response = await fetch("/api/tags", { cache: "no-store" });
    if (!response.ok) {
      await throwApiError(response);
    }
    const data = (await response.json()) as { items: TagDto[] };
    setTags(data.items);
  }, []);

  const loadBookmarks = useCallback(
    async (
      page = 1,
      options: { append?: boolean; preserveContent?: boolean } = {},
    ) => {
      await Promise.resolve();
      const requestId = ++bookmarkRequestId.current;
      const append = options.append ?? false;
      const preserveContent = options.preserveContent ?? false;
      if (append) {
        setLoading(false);
        setLoadingMore(true);
      } else {
        setLoadingMore(false);
        if (preserveContent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
      }
      setPageError("");
      try {
        const params = new URLSearchParams();
        if (query) params.set("q", query);
        if (selectedTag) params.set("tag", selectedTag);
        if (status) params.set("status", status);
        params.set("sort", sort);
        params.set("page", String(page));
        params.set("pageSize", String(PAGE_SIZE));
        const response = await fetch(`/api/bookmarks?${params.toString()}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          await throwApiError(response);
        }
        const data = (await response.json()) as BookmarkListDto;
        if (requestId !== bookmarkRequestId.current) {
          return;
        }
        setBookmarks((current) => {
          if (!append) return data.items;
          const knownIds = new Set(current.map((item) => item.id));
          return [
            ...current,
            ...data.items.filter((item) => !knownIds.has(item.id)),
          ];
        });
        setCurrentPage(page);
        setTotal(data.total);
      } catch (error) {
        if (requestId === bookmarkRequestId.current) {
          setPageError(describeError(error, "加载收藏失败").message);
        }
      } finally {
        if (requestId === bookmarkRequestId.current) {
          if (append) {
            setLoadingMore(false);
          } else if (preserveContent) {
            setRefreshing(false);
          } else {
            setLoading(false);
          }
        }
      }
    },
    [query, selectedTag, sort, status],
  );

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      void loadTags().catch((error: unknown) => {
        if (active) {
          showToast({
            kind: "error",
            message: describeError(error, "加载标签失败").message,
          });
        }
      });
    });
    return () => {
      active = false;
    };
  }, [loadTags]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const preserveContent = hasLoadedBookmarks.current;
      void loadBookmarks(1, { preserveContent }).finally(() => {
        if (active) hasLoadedBookmarks.current = true;
      });
    });
    return () => {
      active = false;
    };
  }, [loadBookmarks]);

  const filtered = useMemo(
    () => Boolean(query || selectedTag || status),
    [query, selectedTag, status],
  );

  const hasPendingExtraction = useMemo(
    () => bookmarks.some((item) => item.extractionStatus === "pending"),
    [bookmarks],
  );

  useEffect(() => {
    if (!hasPendingExtraction || currentPage !== 1) {
      return;
    }
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadBookmarks(1, { preserveContent: true });
      }
    }, 5_000);
    return () => clearInterval(interval);
  }, [hasPendingExtraction, currentPage, loadBookmarks]);

  const canLoadMore = !loading && !loadingMore && bookmarks.length < total;

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || !canLoadMore) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadBookmarks(currentPage + 1, { append: true });
        }
      },
      { rootMargin: "240px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canLoadMore, currentPage, loadBookmarks]);

  function focusAddForm() {
    setAddExpanded(true);
    queueMicrotask(() => {
      urlInputRef.current?.focus();
      urlInputRef.current?.select();
    });
  }

  useEffect(() => {
    function focusCard(offset: number) {
      const cards = Array.from(
        listRef.current?.querySelectorAll<HTMLElement>(
          "[data-bookmark-card]",
        ) ?? [],
      );
      if (cards.length === 0) return;
      const currentIndex = cards.findIndex((card) =>
        card.contains(document.activeElement),
      );
      const nextIndex =
        currentIndex === -1
          ? offset > 0
            ? 0
            : cards.length - 1
          : Math.min(cards.length - 1, Math.max(0, currentIndex + offset));
      cards[nextIndex]?.querySelector<HTMLElement>(".bookmark-title")?.focus();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const isTyping = Boolean(
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)),
      );

      if (event.key === "Escape") {
        if (target === searchInputRef.current) {
          searchInputRef.current?.blur();
          return;
        }
        if (shortcutOpen) {
          setShortcutOpen(false);
          return;
        }
      }
      if (isTyping || document.querySelector("dialog[open]")) {
        return;
      }
      if (event.key === "?") {
        event.preventDefault();
        setShortcutOpen((value) => !value);
        return;
      }
      if (event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }
      if (event.key === "n" || event.key === "a") {
        event.preventDefault();
        focusAddForm();
        return;
      }
      if (event.key === "j" || event.key === "k") {
        event.preventDefault();
        focusCard(event.key === "j" ? 1 : -1);
        return;
      }
      if (event.key === "o") {
        const card = target?.closest<HTMLElement>("[data-bookmark-card]");
        const external = card?.querySelector<HTMLAnchorElement>(
          "[data-external-link]",
        );
        if (external) {
          event.preventDefault();
          external.click();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shortcutOpen]);

  const activeFilters = useMemo(() => {
    const chips: Array<{ key: string; label: string; clear: () => void }> = [];
    if (query) {
      chips.push({
        key: "query",
        label: `搜索：${query}`,
        clear: () => {
          setQueryInput("");
          setQuery("");
        },
      });
    }
    if (selectedTag) {
      const tagName =
        tags.find((item) => item.id === selectedTag)?.name ?? "未知标签";
      chips.push({
        key: "tag",
        label: `标签：${tagName}`,
        clear: () => setSelectedTag(""),
      });
    }
    if (status) {
      const statusLabel =
        statusFilters.find((item) => item.value === status)?.label ?? status;
      chips.push({
        key: "status",
        label: `状态：${statusLabel}`,
        clear: () => setStatus(""),
      });
    }
    return chips;
  }, [query, selectedTag, status, tags]);

  async function createBookmark(targetUrl: string) {
    if (creating) return;
    if (!isLikelyHttpUrl(targetUrl)) {
      showToast({
        kind: "error",
        message:
          "请填写完整的 http/https 网址，例如 https://example.com/article",
      });
      return;
    }
    setCreating(true);
    setPendingCreationUrl(targetUrl.trim());
    setAddExpanded(true);
    try {
      const response = await fetch("/api/bookmarks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: targetUrl }),
      });
      if (!response.ok) {
        await throwApiError(response);
      }
      const created = (await response.json()) as BookmarkDto;
      setUrl("");
      setPendingCreationUrl("");
      showToast({
        kind: "info",
        message:
          created.extractionStatus === "success"
            ? `已收藏「${created.title}」。`
            : `已加入队列：「${created.title}」`,
      });
      await Promise.all([
        loadBookmarks(1, { preserveContent: true }),
        loadTags(),
      ]);
    } catch (error) {
      const failure = describeError(error, "收藏网址失败");
      showToast({
        kind: "error",
        message: failure.message,
        action: failure.retryable
          ? { label: "重试", onAction: () => void createBookmark(targetUrl) }
          : undefined,
      });
    } finally {
      setCreating(false);
      setPendingCreationUrl("");
    }
  }

  function submitBookmark(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void createBookmark(url);
  }

  async function restoreBookmark(bookmark: BookmarkDto) {
    try {
      const response = await fetch(`/api/bookmarks/${bookmark.id}/restore`, {
        method: "POST",
      });
      if (!response.ok) {
        await throwApiError(response);
      }
      await Promise.all([
        loadBookmarks(1, { preserveContent: true }),
        loadTags(),
      ]);
      showToast({ kind: "success", message: `已恢复「${bookmark.title}」。` });
    } catch (error) {
      showToast({
        kind: "error",
        message: describeError(error, "恢复收藏失败").message,
      });
    }
  }

  async function deleteBookmark(bookmark: BookmarkDto) {
    if (deletingId) return;
    setDeletingId(bookmark.id);
    try {
      const response = await fetch(`/api/bookmarks/${bookmark.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        await throwApiError(response);
      }
      setBookmarks((current) =>
        current.filter((item) => item.id !== bookmark.id),
      );
      setTotal((current) => Math.max(0, current - 1));
      setDeleteTarget(null);
      await loadTags();
      showToast({
        kind: "success",
        message: `已删除「${bookmark.title}」。10 分钟内可撤销。`,
        duration: 10_000,
        action: {
          label: "撤销",
          onAction: () => void restoreBookmark(bookmark),
        },
      });
    } catch (error) {
      const failure = describeError(error, "删除收藏失败");
      showToast({
        kind: "error",
        message: failure.message,
        action: failure.retryable
          ? { label: "重试", onAction: () => void deleteBookmark(bookmark) }
          : undefined,
      });
    } finally {
      setDeletingId("");
    }
  }

  function toggleDensity() {
    setDensity((current) => {
      const next: ListDensity =
        current === "comfortable" ? "compact" : "comfortable";
      try {
        localStorage.setItem(DENSITY_KEY, next);
      } catch {
        // ignore
      }
      return next;
    });
  }

  function clearFilters() {
    setQueryInput("");
    setQuery("");
    setSelectedTag("");
    setStatus("");
  }

  function openTagManager() {
    setTagManagerOpen(true);
  }

  function closeTagManager() {
    setTagManagerOpen(false);
    const nextUrl = new URL(window.location.href);
    if (nextUrl.searchParams.has("manageTags")) {
      nextUrl.searchParams.delete("manageTags");
      window.history.replaceState(null, "", nextUrl);
    }
  }

  async function handleTagChanged(change: {
    type: "created" | "renamed" | "deleted";
    tagId: string;
  }) {
    await loadTags();
    if (change.type === "deleted" && change.tagId === selectedTag) {
      setSelectedTag("");
    } else if (change.type !== "created") {
      await loadBookmarks(1, { preserveContent: true });
    }
    showToast({
      kind: "success",
      message:
        change.type === "created"
          ? "标签已新增。"
          : change.type === "renamed"
            ? "标签已重命名。"
            : "标签已删除。",
    });
  }

  return (
    <AppShell
      tags={tags}
      total={total}
      selectedTag={selectedTag}
      onSelectTag={setSelectedTag}
      onManageTags={openTagManager}
      activeNav="collections"
    >
      <div className={`page-container list-density-${density}`}>
        <header className="page-toolbar collection-heading">
          <div>
            <h1>全部收藏</h1>
            <p>共 {total} 条收藏</p>
          </div>
          <button
            className="density-toggle"
            type="button"
            aria-pressed={density === "compact"}
            aria-label={
              density === "compact" ? "切换到舒适密度" : "切换到紧凑密度"
            }
            title={density === "compact" ? "舒适密度" : "紧凑密度"}
            onClick={toggleDensity}
          >
            {density === "compact" ? (
              <Rows size={17} aria-hidden="true" />
            ) : (
              <List size={17} aria-hidden="true" />
            )}
            <span>{density === "compact" ? "紧凑" : "舒适"}</span>
          </button>
        </header>

        <div className="collection-toolbar" aria-label="收藏搜索与排序">
          <label className="search-field">
            <MagnifyingGlass size={17} aria-hidden="true" />
            <span className="sr-only">搜索收藏</span>
            <input
              ref={searchInputRef}
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              placeholder="搜索标题、网址、正文或标签…"
            />
            {queryInput ? (
              <button
                type="button"
                aria-label="清除搜索"
                onClick={() => setQueryInput("")}
              >
                <X size={15} />
              </button>
            ) : (
              <kbd className="search-kbd" aria-hidden="true">
                /
              </kbd>
            )}
          </label>

          <label className="sort-field">
            <SortAscending size={16} aria-hidden="true" />
            <span>排序：</span>
            <select
              value={sort}
              onChange={(event) =>
                setSort(event.target.value as "created" | "updated" | "title")
              }
            >
              <option value="created">最近收藏</option>
              <option value="updated">最近更新</option>
              <option value="title">标题排序</option>
            </select>
          </label>
        </div>

        {addExpanded ? (
          <form
            className="add-bookmark-form is-expanded"
            id="add-bookmark"
            onSubmit={submitBookmark}
          >
            <BookmarkSimple size={20} weight="fill" aria-hidden="true" />
            <label className="sr-only" htmlFor="bookmark-url">
              要收藏的网址
            </label>
            <input
              ref={urlInputRef}
              id="bookmark-url"
              type="url"
              required
              disabled={creating}
              placeholder="粘贴网址后按回车添加"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
            <button
              className="button button-secondary"
              type="button"
              onClick={() => {
                setUrl("");
                setAddExpanded(false);
              }}
            >
              收起
            </button>
            <button
              className="button button-primary"
              type="submit"
              disabled={creating}
            >
              {creating ? (
                <SpinnerGap className="is-spinning" size={18} />
              ) : (
                <PaperPlaneTilt size={18} weight="fill" />
              )}
              {creating ? "正在收藏" : "添加收藏"}
            </button>
          </form>
        ) : (
          <button
            className="add-bookmark-collapsed"
            id="add-bookmark"
            type="button"
            onClick={focusAddForm}
          >
            <Plus size={16} weight="bold" aria-hidden="true" />
            <span>粘贴 URL 添加收藏</span>
            <kbd aria-hidden="true">n</kbd>
          </button>
        )}

        <div className="status-filter-toolbar">
          <span className="status-filter-label">
            <Funnel size={15} aria-hidden="true" />
            提取状态
          </span>
          <div
            className="status-segment"
            role="group"
            aria-label="提取状态筛选"
          >
            {statusFilters.map((item) => (
              <button
                key={item.value || "all"}
                className={`filter-pill filter-${item.value || "all"} ${status === item.value ? "is-selected" : ""}`}
                type="button"
                aria-pressed={status === item.value}
                onClick={() => setStatus(item.value)}
              >
                <span className="filter-dot" />
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div
          className={`collection-progress${refreshing ? " is-visible" : ""}`}
          aria-hidden="true"
        >
          <span />
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          {loading || refreshing
            ? "正在加载收藏"
            : filtered
              ? `当前筛选找到 ${total} 条收藏`
              : `共有 ${total} 条收藏`}
        </p>

        {activeFilters.length > 0 && (
          <div className="active-filters" aria-label="当前筛选条件">
            {activeFilters.map((chip) => (
              <button
                className="active-filter-chip"
                key={chip.key}
                type="button"
                onClick={chip.clear}
              >
                <span>{chip.label}</span>
                <X size={13} aria-hidden="true" />
                <span className="sr-only">移除此筛选</span>
              </button>
            ))}
            <button
              className="active-filter-clear"
              type="button"
              onClick={clearFilters}
            >
              清除全部
            </button>
          </div>
        )}

        <section
          className="bookmark-list"
          ref={listRef}
          aria-busy={loading || refreshing || loadingMore}
        >
          {pendingCreationUrl && (
            <PendingCreationCard url={pendingCreationUrl} />
          )}
          {loading ? (
            <BookmarkSkeletonList />
          ) : pageError ? (
            <EmptyState
              kind="error"
              title="加载收藏失败"
              description={pageError}
              action={
                <button
                  className="button button-primary"
                  type="button"
                  onClick={() => void loadBookmarks(1)}
                >
                  重试
                </button>
              }
            />
          ) : bookmarks.length > 0 ? (
            <>
              {bookmarks.map((bookmark, index) => (
                <BookmarkCard
                  bookmark={bookmark}
                  query={query}
                  deleting={deletingId === bookmark.id}
                  index={index}
                  onDelete={(item) => setDeleteTarget(item)}
                  key={bookmark.id}
                />
              ))}
              <div className="load-more-region" ref={loadMoreRef}>
                <p aria-live="polite">
                  已显示 {bookmarks.length} / {total} 条收藏
                </p>
                {bookmarks.length < total && (
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={loadingMore}
                    onClick={() =>
                      void loadBookmarks(currentPage + 1, { append: true })
                    }
                  >
                    {loadingMore && (
                      <SpinnerGap className="is-spinning" size={17} />
                    )}
                    {loadingMore ? "正在加载" : "加载更多"}
                  </button>
                )}
              </div>
            </>
          ) : pendingCreationUrl ? null : filtered ? (
            <EmptyState
              kind="search"
              title={
                status === "failed"
                  ? "没有提取失败的收藏"
                  : status === "pending"
                    ? "当前没有正在提取的收藏"
                    : "没有找到匹配的收藏"
              }
              description={
                status === "failed"
                  ? "失败条目会显示在这里，方便批量检查与重试。"
                  : "试试更换关键词、标签或提取状态。"
              }
              action={
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={clearFilters}
                >
                  清除筛选
                </button>
              }
            />
          ) : (
            <EmptyState
              title="还没有收藏网址"
              description="把一篇想长期保存的文章粘贴进来，系统会自动提取正文并转换为 Markdown。"
              action={
                <button
                  className="button button-primary"
                  type="button"
                  onClick={focusAddForm}
                >
                  <Plus size={17} />
                  添加第一个收藏
                </button>
              }
            />
          )}
        </section>
      </div>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget ? `删除“${deleteTarget.title}”？` : "删除收藏？"}
        description="确认后会从列表移除。10 分钟内可通过通知「撤销」恢复；超时后会彻底清除正文与本地图片，无法再恢复。"
        confirmLabel="确认删除"
        destructive
        busy={Boolean(deleteTarget && deletingId === deleteTarget.id)}
        onCancel={() => {
          if (!deletingId) setDeleteTarget(null);
        }}
        onConfirm={() => {
          if (deleteTarget) void deleteBookmark(deleteTarget);
        }}
      />
      <TagManager
        open={tagManagerOpen}
        tags={tags}
        onClose={closeTagManager}
        onChanged={handleTagChanged}
      />
      <ShortcutHelp
        open={shortcutOpen}
        onClose={() => setShortcutOpen(false)}
      />
    </AppShell>
  );
}
