"use client";

import Link from "next/link";
import {
  ArrowSquareOut,
  BookOpenText,
  BookmarkSimple,
  Funnel,
  GlobeSimple,
  LinkSimple,
  List,
  MagnifyingGlass,
  NotePencil,
  PaperPlaneTilt,
  Plus,
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
  useState,
  type ReactNode,
} from "react";
import { AppShell } from "./app-shell";
import { ConfirmDialog } from "./confirm-dialog";
import { EmptyState } from "./empty-state";
import { StatusBadge } from "./status-badge";
import type {
  ApiErrorDto,
  BookmarkDto,
  BookmarkListDto,
  TagDto,
} from "@/types/api";
import type { ExtractionStatus } from "@/db/schema";

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

async function errorMessage(response: Response): Promise<string> {
  const data = (await response.json().catch(() => null)) as ApiErrorDto | null;
  return data?.error.message ?? "操作失败，请稍后重试";
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
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
    const end = Math.min(
      candidate.length,
      matchIndex + query.length + 105,
    );
    const excerpt = candidate
      .slice(start, end)
      .replace(/[#>*_`~[\]()!-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return `${start > 0 ? "…" : ""}${excerpt}${end < candidate.length ? "…" : ""}`;
  }
  return null;
}

function BookmarkCard({
  bookmark,
  query,
  deleting,
  onDelete,
}: {
  bookmark: BookmarkDto;
  query: string;
  deleting: boolean;
  onDelete: (bookmark: BookmarkDto) => void;
}) {
  const summary =
    matchingExcerpt(bookmark, query) ||
    bookmark.description?.trim() ||
    bookmark.plainText.trim().slice(0, 160) ||
    "尚未提取到正文，可打开详情查看原因并手动补充内容。";

  return (
    <article className="bookmark-card" data-testid="bookmark-card">
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
            >
              <BookOpenText size={16} weight="fill" aria-hidden="true" />
              阅读全文
            </Link>
            <a
              className="icon-button compact"
              href={bookmark.finalUrl}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="在新窗口打开原网页"
            >
              <ArrowSquareOut size={17} />
            </a>
            <button
              className="icon-button compact bookmark-delete-button"
              type="button"
              disabled={deleting}
              aria-label={`删除收藏：${bookmark.title}`}
              title="删除收藏"
              onClick={() => onDelete(bookmark)}
            >
              {deleting ? (
                <SpinnerGap className="is-spinning" size={17} />
              ) : (
                <Trash size={17} weight="fill" />
              )}
            </button>
          </div>
        </div>

        <Link className="bookmark-title" href={`/bookmarks/${bookmark.id}`}>
          {highlightText(bookmark.title, query)}
        </Link>

        <div className="bookmark-url">
          <LinkSimple size={14} weight="bold" aria-hidden="true" />
          <span className="url-ellipsis">
            {highlightText(bookmark.finalUrl, query)}
          </span>
          <span className="meta-dot">·</span>
          <time dateTime={bookmark.createdAt}>
            收藏于 {formatDate(bookmark.createdAt)}
          </time>
          <time
            className="bookmark-updated-time"
            dateTime={bookmark.updatedAt}
          >
            · 更新于 {formatDate(bookmark.updatedAt)}
          </time>
        </div>

        <p className="bookmark-summary">{highlightText(summary, query)}</p>
        {bookmark.extractionStatus === "failed" && (
          <div className="inline-error">
            <WarningCircle size={17} weight="fill" aria-hidden="true" />
            <strong>抓取失败</strong>
            <span>
              [{bookmark.errorCode ?? "UNKNOWN_ERROR"}]{" "}
              {bookmark.errorMessage ?? "无法提取网页正文"}
            </span>
          </div>
        )}
        <div className="bookmark-card-footer">
          <div className="bookmark-tags">
            {bookmark.tags.map((tagItem) => (
              <span className="tag-chip" key={tagItem.id}>
                <span className="tag-chip-dot" />
                {highlightText(tagItem.name, query)}
              </span>
            ))}
            {bookmark.tags.length === 0 && (
              <span className="tag-placeholder">
                <Plus size={13} /> 添加标签
              </span>
            )}
          </div>
          {bookmark.userNote.trim() && (
            <div className="bookmark-note">
              <NotePencil size={14} weight="fill" aria-hidden="true" />
              <span>备注：{highlightText(bookmark.userNote.trim(), query)}</span>
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
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<BookmarkDto | null>(null);
  const [deletingId, setDeletingId] = useState("");
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => setQuery(queryInput.trim()), 260);
    return () => clearTimeout(timeout);
  }, [queryInput]);

  useEffect(() => {
    const tagFromUrl = new URLSearchParams(window.location.search).get("tag");
    if (tagFromUrl) {
      queueMicrotask(() => setSelectedTag(tagFromUrl));
    }
  }, []);

  const loadTags = useCallback(async () => {
    const response = await fetch("/api/tags", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(await errorMessage(response));
    }
    const data = (await response.json()) as { items: TagDto[] };
    setTags(data.items);
  }, []);

  const loadBookmarks = useCallback(async (preserveContent = false) => {
    await Promise.resolve();
    if (!preserveContent) {
      setLoading(true);
    }
    setPageError("");
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (selectedTag) params.set("tag", selectedTag);
      if (status) params.set("status", status);
      params.set("sort", sort);
      const response = await fetch(`/api/bookmarks?${params.toString()}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(await errorMessage(response));
      }
      const data = (await response.json()) as BookmarkListDto;
      setBookmarks(data.items);
      setTotal(data.total);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "加载收藏失败");
    } finally {
      if (!preserveContent) {
        setLoading(false);
      }
    }
  }, [query, selectedTag, sort, status]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      void Promise.all([loadBookmarks(), loadTags()]).catch((error: unknown) => {
        if (active) {
          setPageError(error instanceof Error ? error.message : "加载数据失败");
        }
      });
    });
    return () => {
      active = false;
    };
  }, [loadBookmarks, loadTags]);

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(""), 4_000);
    return () => clearTimeout(timeout);
  }, [notice]);

  const filtered = useMemo(
    () => Boolean(query || selectedTag || status),
    [query, selectedTag, status],
  );

  async function submitBookmark(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setPageError("");
    setNotice("正在验证网址并提取正文…");
    try {
      const response = await fetch("/api/bookmarks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!response.ok) {
        throw new Error(await errorMessage(response));
      }
      const created = (await response.json()) as BookmarkDto;
      setUrl("");
      setNotice(
        created.extractionStatus === "success"
          ? "收藏已保存，正文提取成功。"
          : "网址已保存，正文提取结果需要检查。",
      );
      await Promise.all([loadBookmarks(), loadTags()]);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "收藏网址失败");
      setNotice("");
    } finally {
      setCreating(false);
    }
  }

  async function performDelete() {
    if (!pendingDelete || deletingId) {
      return;
    }
    const bookmark = pendingDelete;
    setDeletingId(bookmark.id);
    setPageError("");
    try {
      const response = await fetch(`/api/bookmarks/${bookmark.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(await errorMessage(response));
      }
      setPendingDelete(null);
      setBookmarks((current) =>
        current.filter((item) => item.id !== bookmark.id),
      );
      setTotal((current) => Math.max(0, current - 1));
      setNotice("收藏、Markdown 正文及本地化图片已删除。");
      await Promise.all([loadBookmarks(true), loadTags()]);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "删除收藏失败");
      setPendingDelete(null);
    } finally {
      setDeletingId("");
    }
  }

  function clearFilters() {
    setQueryInput("");
    setQuery("");
    setSelectedTag("");
    setStatus("");
  }

  return (
    <AppShell
      tags={tags}
      total={total}
      selectedTag={selectedTag}
      onSelectTag={setSelectedTag}
    >
      <div className="page-container">
        <div className="page-toolbar">
          <div>
            <h1>全部收藏</h1>
            <p>共 {total} 条收藏</p>
          </div>
          <div className="toolbar-controls">
            <label className="search-field">
              <MagnifyingGlass size={18} aria-hidden="true" />
              <span className="sr-only">搜索收藏</span>
              <input
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="搜索标题、网址、正文或标签…"
              />
              {queryInput && (
                <button
                  type="button"
                  aria-label="清除搜索"
                  onClick={() => setQueryInput("")}
                >
                  <X size={15} />
                </button>
              )}
            </label>
            <label className="sort-field">
              <SortAscending size={17} aria-hidden="true" />
              <span>排序：</span>
              <select
                value={sort}
                onChange={(event) =>
                  setSort(
                    event.target.value as "created" | "updated" | "title",
                  )
                }
              >
                <option value="created">最近收藏</option>
                <option value="updated">最近更新</option>
                <option value="title">标题排序</option>
              </select>
            </label>
            <button className="icon-button" type="button" aria-label="列表视图">
              <List size={19} weight="bold" />
            </button>
          </div>
        </div>

        <form
          className="add-bookmark-form"
          id="add-bookmark"
          onSubmit={submitBookmark}
        >
          <BookmarkSimple size={19} aria-hidden="true" />
          <label className="sr-only" htmlFor="bookmark-url">
            要收藏的网址
          </label>
          <input
            id="bookmark-url"
            type="url"
            required
            disabled={creating}
            placeholder="粘贴网址（如 https://example.com/article）后按回车"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          <button className="button button-primary" type="submit" disabled={creating}>
            {creating ? (
              <SpinnerGap className="is-spinning" size={18} />
            ) : (
              <PaperPlaneTilt size={18} weight="fill" />
            )}
            {creating ? "正在收藏" : "添加收藏"}
          </button>
        </form>

        <div className="filter-row" aria-label="提取状态筛选">
          <Funnel size={17} aria-hidden="true" />
          {statusFilters.map((item) => (
            <button
              key={item.value || "all"}
              className={`filter-pill filter-${item.value || "all"} ${status === item.value ? "is-selected" : ""}`}
              type="button"
              onClick={() => setStatus(item.value)}
            >
              <span className="filter-dot" />
              {item.label}
            </button>
          ))}
        </div>

        <div className="feedback-region" aria-live="polite">
          {notice && <div className="notice-banner">{notice}</div>}
          {pageError && <div className="error-banner">{pageError}</div>}
        </div>

        <section className="bookmark-list" aria-busy={loading}>
          {loading ? (
            <div className="loading-state">
              <SpinnerGap className="is-spinning" size={28} />
              <p>正在加载收藏…</p>
            </div>
          ) : bookmarks.length > 0 ? (
            bookmarks.map((bookmark) => (
              <BookmarkCard
                bookmark={bookmark}
                query={query}
                deleting={deletingId === bookmark.id}
                onDelete={setPendingDelete}
                key={bookmark.id}
              />
            ))
          ) : filtered ? (
            <EmptyState
              kind="search"
              title="没有找到匹配的收藏"
              description="试试更换关键词、标签或提取状态。"
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
              description="把一篇想长期保存的文章粘贴到上方，系统会自动提取正文并转换为 Markdown。"
              action={
                <a className="button button-primary" href="#add-bookmark">
                  <Plus size={17} />
                  添加第一个收藏
                </a>
              }
            />
          )}
        </section>
      </div>
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="删除这条收藏？"
        description="删除后，Markdown 正文、备注、标签关联以及已本地化的图片都会永久清除，无法恢复。"
        confirmLabel="全部删除"
        destructive
        busy={Boolean(deletingId)}
        onConfirm={() => void performDelete()}
        onCancel={() => {
          if (!deletingId) {
            setPendingDelete(null);
          }
        }}
      />
    </AppShell>
  );
}
