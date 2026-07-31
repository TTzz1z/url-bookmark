"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowSquareOut,
  ArrowsIn,
  ArrowsOut,
  BookOpen,
  Code,
  DownloadSimple,
  FloppyDisk,
  GlobeSimple,
  NotePencil,
  PencilSimple,
  Plus,
  SpinnerGap,
  Trash,
  WarningCircle,
  X,
  ArrowsClockwise,
} from "@phosphor-icons/react";
import {
  FormEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppShell } from "./app-shell";
import { ConfirmDialog } from "./confirm-dialog";
import { EmptyState } from "./empty-state";
import { MarkdownView } from "./markdown-view";
import { ShortcutHelp } from "./shortcut-help";
import { StatusBadge } from "./status-badge";
import { TagChipEditor } from "./tag-chip-editor";
import { showToast } from "./toast";
import {
  ApiError,
  describeError,
  readApiFailure,
  throwApiError,
} from "@/lib/client-errors";
import { formatDateTime } from "@/lib/format-date";
import { tagDotIndex } from "@/lib/tag-color";
import type { BookmarkDto, BookmarkListDto, TagDto } from "@/types/api";

type DetailTab = "read" | "source" | "edit";
const FOCUS_PREF_KEY = "bookmark-focus-mode";
const DRAFT_KEY_PREFIX = "bookmark-edit-draft:v1:";

type BookmarkDraft = {
  title: string;
  note: string;
  markdown: string;
  tagNames: string;
  savedAt: string;
};

const detailTabs: Array<{
  value: DetailTab;
  label: string;
  Icon: typeof BookOpen;
}> = [
  { value: "read", label: "阅读模式", Icon: BookOpen },
  { value: "source", label: "Markdown 源码", Icon: Code },
  { value: "edit", label: "编辑模式", Icon: NotePencil },
];

function estimateReadingMinutes(markdown: string): number {
  const cjk = (markdown.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const words = (markdown.match(/[A-Za-z0-9]+/g) ?? []).length;
  return Math.max(1, Math.round(cjk / 300 + words / 220));
}

function ReadingProgress() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const article = barRef.current?.closest<HTMLElement>(".reader-card");
      if (!article) return;
      const articleTop = article.getBoundingClientRect().top + window.scrollY;
      const articleEnd = Math.max(
        articleTop,
        articleTop + article.scrollHeight - window.innerHeight,
      );
      const ratio =
        articleEnd > articleTop
          ? (window.scrollY - articleTop) / (articleEnd - articleTop)
          : window.scrollY >= articleTop
            ? 1
            : 0;
      barRef.current?.style.setProperty(
        "--reading-progress",
        String(Math.min(1, Math.max(0, ratio))),
      );
    };
    const schedule = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return <div className="reading-progress" ref={barRef} aria-hidden="true" />;
}

function splitTagNames(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function readFocusPreference(): boolean {
  try {
    return localStorage.getItem(FOCUS_PREF_KEY) === "on";
  } catch {
    return false;
  }
}

function readBookmarkDraft(bookmarkId: string): BookmarkDraft | null {
  try {
    const raw = localStorage.getItem(`${DRAFT_KEY_PREFIX}${bookmarkId}`);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<BookmarkDraft>;
    if (
      typeof draft.title !== "string" ||
      typeof draft.note !== "string" ||
      typeof draft.markdown !== "string" ||
      typeof draft.tagNames !== "string" ||
      typeof draft.savedAt !== "string"
    ) {
      return null;
    }
    return draft as BookmarkDraft;
  } catch {
    return null;
  }
}

function writeBookmarkDraft(bookmarkId: string, draft: BookmarkDraft): void {
  try {
    localStorage.setItem(
      `${DRAFT_KEY_PREFIX}${bookmarkId}`,
      JSON.stringify(draft),
    );
  } catch {
    // 无痕模式或存储空间不足时，页面离开确认仍会保护当前输入。
  }
}

function clearBookmarkDraft(bookmarkId: string): void {
  try {
    localStorage.removeItem(`${DRAFT_KEY_PREFIX}${bookmarkId}`);
  } catch {
    // ignore
  }
}

export function DetailScreen() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [bookmark, setBookmark] = useState<BookmarkDto | null>(null);
  const [allTags, setAllTags] = useState<TagDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<DetailTab>("read");
  /** true = 隐藏信息栏（专注阅读）；默认展开信息栏。 */
  const [focusMode, setFocusMode] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [tagNames, setTagNames] = useState("");
  const [saving, setSaving] = useState(false);
  const [reExtracting, setReExtracting] = useState(false);
  const [overwriteOpen, setOverwriteOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pendingTab, setPendingTab] = useState<DetailTab | null>(null);
  const [shortcutOpen, setShortcutOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const editFormRef = useRef<HTMLFormElement>(null);
  const deferredMarkdown = useDeferredValue(markdown);
  const imageArchiveSummary = useMemo(() => {
    if (!bookmark) {
      return { localized: 0, remote: 0 };
    }
    const localizedUrls = new Set(
      Array.from(
        bookmark.markdownContent.matchAll(
          /\/api\/bookmarks\/[A-Za-z0-9_-]+\/assets\/[a-f0-9]{24}\.(?:png|jpg|gif|webp|avif|svg)/gi,
        ),
        (match) => match[0],
      ),
    );
    const remoteUrls = new Set<string>();
    for (const match of bookmark.markdownContent.matchAll(
      /!\[[^\]]*]\(\s*(?:<(https?:\/\/[^>]+)>|(https?:\/\/[^)\s]+))/gi,
    )) {
      remoteUrls.add(match[1] ?? match[2]);
    }
    if (bookmark.coverImageUrl?.startsWith("/api/bookmarks/")) {
      localizedUrls.add(bookmark.coverImageUrl);
    } else if (/^https?:\/\//i.test(bookmark.coverImageUrl ?? "")) {
      remoteUrls.add(bookmark.coverImageUrl!);
    }
    return { localized: localizedUrls.size, remote: remoteUrls.size };
  }, [bookmark]);
  const localizedImageCount = imageArchiveSummary.localized;
  const remoteImageCount = imageArchiveSummary.remote;

  const isDirty = useMemo(() => {
    if (!bookmark || tab !== "edit") return false;
    const persistedTags = bookmark.tags.map((item) => item.name).join(", ");
    return (
      title !== bookmark.title ||
      note !== bookmark.userNote ||
      markdown !== bookmark.markdownContent ||
      tagNames !== persistedTags
    );
  }, [bookmark, tab, title, note, markdown, tagNames]);

  useEffect(() => {
    if (!isDirty) return;
    const protectDraft = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectDraft);
    return () => window.removeEventListener("beforeunload", protectDraft);
  }, [isDirty]);

  useEffect(() => {
    if (!bookmark || tab !== "edit" || !isDirty) return;
    const timeout = window.setTimeout(() => {
      writeBookmarkDraft(bookmark.id, {
        title,
        note,
        markdown,
        tagNames,
        savedAt: new Date().toISOString(),
      });
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [bookmark, isDirty, markdown, note, tab, tagNames, title]);

  function restorePersistedDraft() {
    if (!bookmark) return;
    setTitle(bookmark.title);
    setNote(bookmark.userNote);
    setMarkdown(bookmark.markdownContent);
    setTagNames(bookmark.tags.map((item) => item.name).join(", "));
  }

  const readingMinutes = useMemo(
    () =>
      bookmark?.markdownContent
        ? estimateReadingMinutes(bookmark.markdownContent)
        : null,
    [bookmark?.markdownContent],
  );
  const tagSuggestions = useMemo(() => {
    const selected = new Set(
      splitTagNames(tagNames).map((item) => item.toLocaleLowerCase()),
    );
    return allTags
      .filter((item) => !selected.has(item.name.toLocaleLowerCase()))
      .slice(0, 6);
  }, [allTags, tagNames]);

  function switchTab(nextTab: DetailTab) {
    if (nextTab === tab) return;
    if (tab === "edit" && isDirty) {
      setPendingTab(nextTab);
      setDiscardOpen(true);
      return;
    }
    if (nextTab === "edit" || tab === "edit") {
      restorePersistedDraft();
    }
    setTab(nextTab);
  }

  function confirmDiscard() {
    if (bookmark) clearBookmarkDraft(bookmark.id);
    restorePersistedDraft();
    setDiscardOpen(false);
    if (pendingTab) {
      setTab(pendingTab);
      setPendingTab(null);
    }
  }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const offset =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (offset === 0) return;
    event.preventDefault();
    const currentIndex = detailTabs.findIndex((item) => item.value === tab);
    const nextTab =
      detailTabs[
        (currentIndex + offset + detailTabs.length) % detailTabs.length
      ];
    switchTab(nextTab.value);
    document.getElementById(`detail-tab-${nextTab.value}`)?.focus();
  }

  const loadData = useCallback(async () => {
    await Promise.resolve();
    setLoading(true);
    setError("");
    try {
      const [bookmarkResponse, tagsResponse, listResponse] = await Promise.all([
        fetch(`/api/bookmarks/${params.id}`, { cache: "no-store" }),
        fetch("/api/tags", { cache: "no-store" }),
        fetch("/api/bookmarks?pageSize=1", { cache: "no-store" }),
      ]);
      if (!bookmarkResponse.ok) {
        await throwApiError(bookmarkResponse);
      }
      if (!tagsResponse.ok) {
        await throwApiError(tagsResponse);
      }
      if (!listResponse.ok) {
        await throwApiError(listResponse);
      }
      const nextBookmark = (await bookmarkResponse.json()) as BookmarkDto;
      const tagsData = (await tagsResponse.json()) as { items: TagDto[] };
      const listData = (await listResponse.json()) as BookmarkListDto;
      setBookmark(nextBookmark);
      setAllTags(tagsData.items);
      setTotal(listData.total);
      setTitle(nextBookmark.title);
      setNote(nextBookmark.userNote);
      setMarkdown(nextBookmark.markdownContent);
      setTagNames(nextBookmark.tags.map((item) => item.name).join(", "));
      const draft = readBookmarkDraft(nextBookmark.id);
      const persistedTags = nextBookmark.tags
        .map((item) => item.name)
        .join(", ");
      if (
        draft &&
        (draft.title !== nextBookmark.title ||
          draft.note !== nextBookmark.userNote ||
          draft.markdown !== nextBookmark.markdownContent ||
          draft.tagNames !== persistedTags)
      ) {
        showToast({
          kind: "info",
          message: `发现 ${formatDateTime(draft.savedAt)} 保存的未保存草稿。`,
          duration: 0,
          action: {
            label: "恢复草稿",
            onAction: () => {
              setTitle(draft.title);
              setNote(draft.note);
              setMarkdown(draft.markdown);
              setTagNames(draft.tagNames);
              setTab("edit");
            },
          },
        });
      }
      const nextUrl = new URL(window.location.href);
      if (nextUrl.searchParams.get("edit") === "1") {
        setTab("edit");
        nextUrl.searchParams.delete("edit");
        window.history.replaceState(null, "", nextUrl);
      }
    } catch (loadError) {
      setError(describeError(loadError, "加载书签失败").message);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setFocusMode(readFocusPreference());
        void loadData();
      }
    });
    return () => {
      active = false;
    };
  }, [loadData]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "s" &&
        tab === "edit"
      ) {
        event.preventDefault();
        if (!saving && isDirty) {
          editFormRef.current?.requestSubmit();
        }
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const isTyping = Boolean(
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)),
      );
      if (document.querySelector("dialog[open]")) return;
      if (event.key === "?" && !isTyping) {
        event.preventDefault();
        setShortcutOpen((value) => !value);
        return;
      }
      if (isTyping) return;
      if (event.key === "e") {
        event.preventDefault();
        switchTab("edit");
        return;
      }
      if (event.key === "r" && bookmark && !reExtracting) {
        event.preventDefault();
        if (bookmark.isContentEdited) {
          setOverwriteOpen(true);
        } else {
          void performReExtract(false);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers read latest via closure refresh on deps
  }, [bookmark, reExtracting, saving, tab, isDirty]);

  async function saveChanges(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !isDirty) return;
    const nextTagNames = splitTagNames(tagNames);
    if (nextTagNames.length > 12) {
      showToast({
        kind: "error",
        message: "每条收藏最多添加 12 个标签，请删除多余标签后再保存。",
      });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/bookmarks/${params.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          userNote: note,
          markdownContent: markdown,
          tagNames: nextTagNames,
        }),
      });
      if (!response.ok) {
        await throwApiError(response);
      }
      const updated = (await response.json()) as BookmarkDto;
      setBookmark(updated);
      setTitle(updated.title);
      setNote(updated.userNote);
      setMarkdown(updated.markdownContent);
      setTagNames(updated.tags.map((item) => item.name).join(", "));
      setAllTags((current) => {
        const known = new Map(current.map((item) => [item.id, item]));
        for (const tagItem of updated.tags) known.set(tagItem.id, tagItem);
        return Array.from(known.values());
      });
      clearBookmarkDraft(updated.id);
    } catch (saveError) {
      showToast({
        kind: "error",
        message: describeError(saveError, "保存失败").message,
      });
    } finally {
      setSaving(false);
    }
  }

  async function performReExtract(overwriteEditedContent: boolean) {
    setOverwriteOpen(false);
    setReExtracting(true);
    try {
      const response = await fetch(`/api/bookmarks/${params.id}/re-extract`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ overwriteEditedContent }),
      });
      if (!response.ok) {
        const failure = await readApiFailure(response);
        if (failure.code === "CONTENT_EDITED") {
          setOverwriteOpen(true);
          return;
        }
        throw new ApiError(failure);
      }
      const updated = (await response.json()) as BookmarkDto;
      setBookmark(updated);
      setTitle(updated.title);
      setNote(updated.userNote);
      setMarkdown(updated.markdownContent);
      setTagNames(updated.tags.map((item) => item.name).join(", "));
      clearBookmarkDraft(updated.id);
      showToast({
        kind: updated.extractionStatus === "success" ? "success" : "info",
        message:
          updated.extractionStatus === "success"
            ? "重新提取完成。"
            : "重新提取完成，请检查正文和错误信息。",
      });
    } catch (reExtractError) {
      const failure = describeError(reExtractError, "重新提取失败");
      showToast({
        kind: "error",
        message: failure.message,
        action: failure.retryable
          ? {
              label: "重试",
              onAction: () => void performReExtract(overwriteEditedContent),
            }
          : undefined,
      });
    } finally {
      setReExtracting(false);
    }
  }

  async function restoreBookmark(deletedId: string, deletedTitle: string) {
    try {
      const response = await fetch(`/api/bookmarks/${deletedId}/restore`, {
        method: "POST",
      });
      if (!response.ok) {
        await throwApiError(response);
      }
      showToast({ kind: "success", message: `已恢复「${deletedTitle}」。` });
      router.push(`/bookmarks/${deletedId}`);
    } catch (restoreError) {
      showToast({
        kind: "error",
        message: describeError(restoreError, "恢复收藏失败").message,
      });
    }
  }

  async function performDelete() {
    if (!bookmark || deleting) return;
    const deletedId = bookmark.id;
    const deletedTitle = bookmark.title;
    setDeleting(true);
    try {
      const response = await fetch(`/api/bookmarks/${deletedId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        await throwApiError(response);
      }
      showToast({
        kind: "success",
        message: `已删除「${deletedTitle}」。10 分钟内可撤销。`,
        duration: 10_000,
        action: {
          label: "撤销",
          onAction: () => void restoreBookmark(deletedId, deletedTitle),
        },
      });
      setDeleteConfirmOpen(false);
      router.push("/");
      router.refresh();
    } catch (deleteError) {
      showToast({
        kind: "error",
        message: describeError(deleteError, "删除失败").message,
      });
      setDeleting(false);
    }
  }

  function toggleFocusMode() {
    setFocusMode((value) => {
      const next = !value;
      try {
        localStorage.setItem(FOCUS_PREF_KEY, next ? "on" : "off");
      } catch {
        // ignore
      }
      return next;
    });
  }

  if (loading) {
    return (
      <AppShell backHref="/" activeNav="collections">
        <div className="detail-loading">
          <SpinnerGap className="is-spinning" size={30} />
          <p>正在加载书签…</p>
        </div>
      </AppShell>
    );
  }

  if (!bookmark) {
    return (
      <AppShell
        tags={allTags}
        backHref="/"
        activeNav="collections"
        onSelectTag={(tagId) => {
          router.push(tagId ? `/?tag=${encodeURIComponent(tagId)}` : "/");
        }}
      >
        <div className="page-container">
          <EmptyState
            kind="error"
            title="无法打开这条收藏"
            description={error || "书签可能已被删除。"}
            action={
              <Link className="button button-secondary" href="/">
                返回列表
              </Link>
            }
          />
        </div>
      </AppShell>
    );
  }

  const layoutMode =
    tab === "edit" || (tab === "read" && focusMode) ? "on" : undefined;

  return (
    <AppShell
      tags={allTags}
      total={total}
      backHref="/"
      activeNav="collections"
      onSelectTag={(tagId) => {
        router.push(tagId ? `/?tag=${encodeURIComponent(tagId)}` : "/");
      }}
    >
      <div className="detail-page">
        <header className="detail-header">
          <div className="detail-heading-content">
            <h1>{bookmark.title}</h1>
            <div className="detail-source-line">
              <GlobeSimple size={15} aria-hidden="true" />
              <a
                href={bookmark.finalUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                {bookmark.finalUrl}
              </a>
              <span className="meta-dot">·</span>
              <span>{bookmark.domain}</span>
              <ArrowSquareOut size={14} aria-hidden="true" />
            </div>
            <div className="detail-status-line">
              <StatusBadge status={bookmark.extractionStatus} />
              <span>收藏于 {formatDateTime(bookmark.createdAt)}</span>
              <span className="meta-dot">·</span>
              <span>最后提取 {formatDateTime(bookmark.extractedAt)}</span>
              {readingMinutes !== null && (
                <>
                  <span className="meta-dot">·</span>
                  <span>约 {readingMinutes} 分钟读完</span>
                </>
              )}
            </div>
          </div>
          <div className="detail-actions">
            <button
              className="button button-secondary"
              type="button"
              disabled={reExtracting}
              onClick={() => {
                if (bookmark.isContentEdited) {
                  setOverwriteOpen(true);
                } else {
                  void performReExtract(false);
                }
              }}
            >
              {reExtracting ? (
                <SpinnerGap className="is-spinning" size={17} />
              ) : (
                <ArrowsClockwise size={17} />
              )}
              {reExtracting ? "正在提取" : "重新提取"}
            </button>
            {tab !== "edit" && (
              <button
                className="button button-secondary"
                type="button"
                onClick={() => switchTab("edit")}
              >
                <PencilSimple size={17} />
                编辑
              </button>
            )}
            <button
              className="button button-danger-quiet"
              type="button"
              disabled={deleting}
              onClick={() => setDeleteConfirmOpen(true)}
            >
              {deleting ? (
                <SpinnerGap className="is-spinning" size={17} />
              ) : (
                <Trash size={17} weight="fill" />
              )}
              删除
            </button>
          </div>
        </header>

        {(bookmark.extractionStatus === "partial" ||
          bookmark.extractionStatus === "failed") && (
          <div
            className={`notice-banner ${
              bookmark.extractionStatus === "failed"
                ? "error-banner"
                : "partial-banner"
            }`}
          >
            {bookmark.extractionStatus === "partial"
              ? "正文可能不完整。可以重新提取，或进入编辑模式手动补充。"
              : (bookmark.errorMessage ??
                "正文提取失败。可以重新提取，或进入编辑模式手动补充。")}
          </div>
        )}

        <div
          className="detail-tabs"
          role="tablist"
          aria-label="正文查看模式"
          onKeyDown={handleTabKeyDown}
        >
          {detailTabs.map(({ value, label, Icon }) => (
            <button
              key={value}
              id={`detail-tab-${value}`}
              role="tab"
              aria-selected={tab === value}
              aria-controls={`detail-panel-${value}`}
              tabIndex={tab === value ? 0 : -1}
              className={tab === value ? "is-active" : ""}
              onClick={() => switchTab(value)}
              type="button"
            >
              <Icon size={17} aria-hidden="true" /> {label}
            </button>
          ))}
          {tab === "read" && (
            <button
              className="detail-focus-toggle"
              type="button"
              aria-pressed={focusMode}
              aria-label={focusMode ? "显示信息栏" : "隐藏信息栏"}
              onClick={toggleFocusMode}
            >
              {focusMode ? (
                <ArrowsOut size={16} aria-hidden="true" />
              ) : (
                <ArrowsIn size={16} aria-hidden="true" />
              )}
              {focusMode ? "显示信息栏" : "隐藏信息栏"}
            </button>
          )}
        </div>

        <div className="detail-layout" data-focus={layoutMode}>
          <section
            className="reader-card"
            role="tabpanel"
            id={`detail-panel-${tab}`}
            aria-labelledby={`detail-tab-${tab}`}
            tabIndex={-1}
          >
            {reExtracting && (
              <div
                className="reextract-status"
                role="status"
                aria-live="polite"
              >
                <SpinnerGap className="is-spinning" size={18} />
                <p>正在重新提取，完成前仍可阅读当前正文。</p>
              </div>
            )}
            {tab === "read" &&
              (bookmark.markdownContent ? (
                <>
                  <ReadingProgress />
                  <div className="reader-toolbar">
                    <Link
                      className="button button-secondary"
                      href={`/api/bookmarks/${bookmark.id}/export`}
                    >
                      <DownloadSimple size={17} /> 下载 .md
                    </Link>
                    {localizedImageCount > 0 && (
                      <Link
                        className="button button-secondary"
                        href={`/api/bookmarks/${bookmark.id}/export?format=zip`}
                      >
                        <DownloadSimple size={17} /> 下载图文包
                      </Link>
                    )}
                  </div>
                  {remoteImageCount > 0 && (
                    <div className="archive-warning" role="status">
                      <WarningCircle
                        size={18}
                        weight="fill"
                        aria-hidden="true"
                      />
                      <p>
                        仍有 {remoteImageCount}{" "}
                        张图片使用远程地址，原站防盗链或下线后可能失效。
                        可点击“重新提取”再次尝试本地保存。
                      </p>
                    </div>
                  )}
                  <MarkdownView>{bookmark.markdownContent}</MarkdownView>
                </>
              ) : bookmark.extractionStatus === "pending" || reExtracting ? (
                <div className="detail-extracting">
                  <SpinnerGap className="is-spinning" size={28} />
                  <p>正在提取正文，请稍候…</p>
                  <div className="extracting-skeleton" aria-hidden="true">
                    <span className="skeleton-block skeleton-title" />
                    <span className="skeleton-block skeleton-summary" />
                    <span className="skeleton-block skeleton-summary" />
                  </div>
                </div>
              ) : (
                <EmptyState
                  kind="error"
                  title="暂时没有可阅读的正文"
                  description={
                    bookmark.errorMessage ??
                    "可以重新提取，或进入编辑模式手动补充 Markdown。"
                  }
                  action={
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => switchTab("edit")}
                    >
                      <PencilSimple size={17} /> 手动编辑
                    </button>
                  }
                />
              ))}
            {tab === "source" && (
              <div className="source-panel">
                <div className="source-panel-heading">
                  <div>
                    <h2>Markdown 源码</h2>
                    <p>
                      原始 HTML 不会被保存或直接渲染。
                      {localizedImageCount > 0
                        ? ` 已本地保存 ${localizedImageCount} 张正文图片。`
                        : ""}
                      {remoteImageCount > 0
                        ? ` 仍有 ${remoteImageCount} 张远程图片未归档。`
                        : ""}
                    </p>
                  </div>
                  <div className="source-download-actions">
                    <Link
                      className="button button-secondary"
                      href={`/api/bookmarks/${bookmark.id}/export`}
                    >
                      <DownloadSimple size={17} /> 下载 .md
                    </Link>
                    {localizedImageCount > 0 && (
                      <Link
                        className="button button-secondary"
                        href={`/api/bookmarks/${bookmark.id}/export?format=zip`}
                      >
                        <DownloadSimple size={17} /> 下载图文包
                      </Link>
                    )}
                  </div>
                </div>
                <pre>
                  {bookmark.markdownContent || "（暂无 Markdown 正文）"}
                </pre>
              </div>
            )}
            {tab === "edit" && (
              <form
                className="edit-form"
                ref={editFormRef}
                onSubmit={saveChanges}
              >
                <div className="edit-form-heading">
                  <div>
                    <h2>编辑收藏</h2>
                    <p>原始网址不可修改；需要更换来源时请重新创建收藏。</p>
                  </div>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="退出编辑"
                    onClick={() => switchTab("read")}
                  >
                    <X size={18} />
                  </button>
                </div>
                <label>
                  <span>标题</span>
                  <input
                    value={title}
                    maxLength={300}
                    required
                    onChange={(event) => setTitle(event.target.value)}
                  />
                  <small className="field-counter">{title.length} / 300</small>
                </label>
                <div className="edit-field">
                  <span className="edit-field-label">标签</span>
                  <TagChipEditor
                    value={tagNames}
                    suggestions={tagSuggestions}
                    onChange={setTagNames}
                  />
                </div>
                <label>
                  <span>备注</span>
                  <textarea
                    className="note-editor"
                    aria-label="备注"
                    value={note}
                    maxLength={5_000}
                    placeholder="补充你的阅读笔记…"
                    onChange={(event) => setNote(event.target.value)}
                  />
                  <small className="field-counter">
                    {note.length.toLocaleString("zh-CN")} / 5,000
                  </small>
                </label>
                <div className="markdown-edit-layout">
                  <label>
                    <span>Markdown 正文</span>
                    <textarea
                      className="markdown-editor"
                      value={markdown}
                      onChange={(event) => setMarkdown(event.target.value)}
                    />
                  </label>
                  <section
                    className="markdown-preview-panel"
                    aria-label="Markdown 实时预览"
                  >
                    <div className="markdown-preview-heading">
                      <span>实时预览</span>
                      <small>输入时自动更新</small>
                    </div>
                    {deferredMarkdown.trim() ? (
                      <MarkdownView>{deferredMarkdown}</MarkdownView>
                    ) : (
                      <p className="markdown-preview-empty">
                        输入 Markdown 后将在这里预览。
                      </p>
                    )}
                  </section>
                </div>
                <div className="edit-actions">
                  <p
                    className={`edit-save-state${isDirty ? " is-dirty" : ""}`}
                    aria-live="polite"
                  >
                    {saving
                      ? "正在保存…"
                      : isDirty
                        ? "有未保存的修改 · Ctrl/⌘ + S 保存"
                        : "所有修改已保存"}
                  </p>
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => switchTab("read")}
                  >
                    取消
                  </button>
                  <button
                    className="button button-primary"
                    type="submit"
                    disabled={saving || !isDirty}
                  >
                    {saving ? (
                      <SpinnerGap className="is-spinning" size={17} />
                    ) : (
                      <FloppyDisk size={17} weight="fill" />
                    )}
                    {saving ? "正在保存" : "保存修改"}
                  </button>
                </div>
              </form>
            )}
          </section>

          {tab !== "edit" && (
            <aside className="bookmark-info-card">
              <h2>书签信息</h2>
              <div className="info-block">
                <span className="info-label">标签</span>
                <div className="bookmark-tags">
                  {bookmark.tags.map((tagItem) => (
                    <a
                      className="tag-chip"
                      href={`/?tag=${tagItem.id}`}
                      key={tagItem.id}
                    >
                      <span
                        className={`tag-chip-dot tag-dot-${tagDotIndex(tagItem.name)}`}
                      />
                      {tagItem.name}
                    </a>
                  ))}
                  {bookmark.tags.length === 0 && (
                    <button
                      className="tag-placeholder"
                      type="button"
                      onClick={() => switchTab("edit")}
                    >
                      <Plus size={13} /> 添加标签
                    </button>
                  )}
                </div>
              </div>
              <div className="info-block">
                <span className="info-label">备注</span>
                {bookmark.userNote ? (
                  <p className="note-content">{bookmark.userNote}</p>
                ) : (
                  <button
                    className="empty-note"
                    type="button"
                    onClick={() => switchTab("edit")}
                  >
                    添加你的阅读备注
                  </button>
                )}
              </div>
              <div className="info-divider" />
              <dl className="source-details">
                <div>
                  <dt>域名</dt>
                  <dd>{bookmark.domain}</dd>
                </div>
                <div>
                  <dt>原始网址</dt>
                  <dd title={bookmark.url}>{bookmark.url}</dd>
                </div>
                <div>
                  <dt>最终网址</dt>
                  <dd title={bookmark.finalUrl}>{bookmark.finalUrl}</dd>
                </div>
                <div>
                  <dt>收藏时间</dt>
                  <dd>{formatDateTime(bookmark.createdAt)}</dd>
                </div>
                <div>
                  <dt>最后提取</dt>
                  <dd>{formatDateTime(bookmark.extractedAt)}</dd>
                </div>
                <div>
                  <dt>HTTP 状态</dt>
                  <dd>{bookmark.httpStatusCode ?? "—"}</dd>
                </div>
                <div>
                  <dt>内容大小</dt>
                  <dd>
                    {Math.max(0, Math.round(bookmark.contentLength / 1024))} KB
                  </dd>
                </div>
                <div>
                  <dt>本地图片</dt>
                  <dd>{localizedImageCount} 张</dd>
                </div>
                <div>
                  <dt>远程图片</dt>
                  <dd
                    className={remoteImageCount > 0 ? "is-warning" : undefined}
                  >
                    {remoteImageCount} 张
                  </dd>
                </div>
                <div>
                  <dt>重试次数</dt>
                  <dd>{bookmark.retryCount}</dd>
                </div>
              </dl>
              {bookmark.errorMessage && (
                <div className="info-error">
                  <WarningCircle size={18} weight="fill" aria-hidden="true" />
                  <div>
                    <strong>{bookmark.errorCode}</strong>
                    <p>{bookmark.errorMessage}</p>
                  </div>
                </div>
              )}
            </aside>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={deleteConfirmOpen}
        title={`删除“${bookmark.title}”？`}
        description="确认后会从列表移除。10 分钟内可通过通知「撤销」恢复；超时后会彻底清除正文与本地图片，无法再恢复。"
        confirmLabel="确认删除"
        destructive
        busy={deleting}
        onCancel={() => {
          if (!deleting) setDeleteConfirmOpen(false);
        }}
        onConfirm={() => void performDelete()}
      />
      <ConfirmDialog
        open={discardOpen}
        title="放弃未保存的修改？"
        description="离开编辑模式会丢失当前未保存的标题、标签、备注或正文改动。"
        confirmLabel="放弃修改"
        destructive
        onCancel={() => {
          setDiscardOpen(false);
          setPendingTab(null);
        }}
        onConfirm={confirmDiscard}
      />
      <ConfirmDialog
        open={overwriteOpen}
        title="覆盖手动编辑的正文？"
        description="这条书签的 Markdown 已被手动修改。继续会用重新提取的内容覆盖当前正文；标签和备注不会丢失。"
        confirmLabel="继续并覆盖"
        busy={reExtracting}
        onCancel={() => setOverwriteOpen(false)}
        onConfirm={() => void performReExtract(true)}
      />
      <ShortcutHelp
        open={shortcutOpen}
        onClose={() => setShortcutOpen(false)}
      />
    </AppShell>
  );
}
