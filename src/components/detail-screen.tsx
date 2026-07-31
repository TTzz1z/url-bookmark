"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowSquareOut,
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
import { FormEvent, useCallback, useEffect, useState } from "react";
import { AppShell } from "./app-shell";
import { ConfirmDialog } from "./confirm-dialog";
import { EmptyState } from "./empty-state";
import { MarkdownView } from "./markdown-view";
import { StatusBadge } from "./status-badge";
import type {
  ApiErrorDto,
  BookmarkDto,
  BookmarkListDto,
  TagDto,
} from "@/types/api";

type DetailTab = "read" | "source" | "edit";

async function responseError(response: Response): Promise<{
  code?: string;
  message: string;
}> {
  const data = (await response.json().catch(() => null)) as ApiErrorDto | null;
  return {
    code: data?.error.code,
    message: data?.error.message ?? "操作失败，请稍后重试",
  };
}

function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
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

export function DetailScreen() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [bookmark, setBookmark] = useState<BookmarkDto | null>(null);
  const [allTags, setAllTags] = useState<TagDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<DetailTab>("read");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [tagNames, setTagNames] = useState("");
  const [saving, setSaving] = useState(false);
  const [reExtracting, setReExtracting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [overwriteOpen, setOverwriteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const localizedImageCount = bookmark
    ? (
        bookmark.markdownContent.match(
          /\/api\/bookmarks\/[A-Za-z0-9_-]+\/assets\/[a-f0-9]{24}\.(?:png|jpg|gif|webp|avif)/g,
        ) ?? []
      ).length
    : 0;

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
        throw new Error((await responseError(bookmarkResponse)).message);
      }
      if (!tagsResponse.ok) {
        throw new Error((await responseError(tagsResponse)).message);
      }
      if (!listResponse.ok) {
        throw new Error((await responseError(listResponse)).message);
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
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载书签失败");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void loadData();
    });
    return () => {
      active = false;
    };
  }, [loadData]);

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(""), 4_000);
    return () => clearTimeout(timeout);
  }, [notice]);

  async function saveChanges(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/bookmarks/${params.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          userNote: note,
          markdownContent: markdown,
          tagNames: splitTagNames(tagNames),
        }),
      });
      if (!response.ok) {
        throw new Error((await responseError(response)).message);
      }
      const updated = (await response.json()) as BookmarkDto;
      setBookmark(updated);
      setAllTags((current) => {
        const known = new Map(current.map((item) => [item.id, item]));
        for (const tagItem of updated.tags) known.set(tagItem.id, tagItem);
        return Array.from(known.values());
      });
      setNotice("修改已保存。");
      setTab("read");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function performReExtract(overwriteEditedContent: boolean) {
    setOverwriteOpen(false);
    setReExtracting(true);
    setError("");
    setNotice("正在重新获取网页并提取正文…");
    try {
      const response = await fetch(`/api/bookmarks/${params.id}/re-extract`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ overwriteEditedContent }),
      });
      if (!response.ok) {
        const apiError = await responseError(response);
        if (apiError.code === "CONTENT_EDITED") {
          setOverwriteOpen(true);
          setNotice("");
          return;
        }
        throw new Error(apiError.message);
      }
      const updated = (await response.json()) as BookmarkDto;
      setBookmark(updated);
      setTitle(updated.title);
      setMarkdown(updated.markdownContent);
      setNotice(
        updated.extractionStatus === "success"
          ? "重新提取完成。"
          : "重新提取完成，请检查正文和错误信息。",
      );
    } catch (reExtractError) {
      setError(
        reExtractError instanceof Error ? reExtractError.message : "重新提取失败",
      );
      setNotice("");
    } finally {
      setReExtracting(false);
    }
  }

  async function performDelete() {
    setDeleting(true);
    setError("");
    try {
      const response = await fetch(`/api/bookmarks/${params.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error((await responseError(response)).message);
      }
      router.push("/");
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除失败");
      setDeleteOpen(false);
      setDeleting(false);
    }
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
      <AppShell tags={allTags} backHref="/" activeNav="collections">
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

  return (
    <AppShell
      tags={allTags}
      total={total}
      backHref="/"
      activeNav="collections"
    >
      <div className="detail-page">
        <header className="detail-header">
          <div className="detail-heading-content">
            <h1>{bookmark.title}</h1>
            <div className="detail-source-line">
              <GlobeSimple size={15} aria-hidden="true" />
              <a href={bookmark.finalUrl} target="_blank" rel="noreferrer noopener">
                {bookmark.finalUrl}
              </a>
              <span className="meta-dot">·</span>
              <span>{bookmark.domain}</span>
              <ArrowSquareOut size={14} aria-hidden="true" />
            </div>
            <div className="detail-status-line">
              <StatusBadge status={bookmark.extractionStatus} />
              <span>收藏于 {formatDate(bookmark.createdAt)}</span>
              <span className="meta-dot">·</span>
              <span>最后提取 {formatDate(bookmark.extractedAt)}</span>
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
            <button
              className="button button-secondary"
              type="button"
              onClick={() => setTab("edit")}
            >
              <PencilSimple size={17} />
              编辑信息
            </button>
            <button
              className="button button-danger-quiet"
              type="button"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash size={17} weight="fill" />
              删除
            </button>
          </div>
        </header>

        <div className="detail-tabs" role="tablist" aria-label="正文查看模式">
          <button
            role="tab"
            aria-selected={tab === "read"}
            className={tab === "read" ? "is-active" : ""}
            onClick={() => setTab("read")}
            type="button"
          >
            <BookOpen size={17} /> 阅读模式
          </button>
          <button
            role="tab"
            aria-selected={tab === "source"}
            className={tab === "source" ? "is-active" : ""}
            onClick={() => setTab("source")}
            type="button"
          >
            <Code size={17} /> Markdown 源码
          </button>
          <button
            role="tab"
            aria-selected={tab === "edit"}
            className={tab === "edit" ? "is-active" : ""}
            onClick={() => setTab("edit")}
            type="button"
          >
            <NotePencil size={17} /> 编辑模式
          </button>
        </div>

        <div className="feedback-region" aria-live="polite">
          {notice && <div className="notice-banner">{notice}</div>}
          {error && <div className="error-banner">{error}</div>}
        </div>

        <div className="detail-layout">
          <section className="reader-card">
            {tab === "read" &&
              (bookmark.markdownContent ? (
                <MarkdownView>{bookmark.markdownContent}</MarkdownView>
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
                      onClick={() => setTab("edit")}
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
                <pre>{bookmark.markdownContent || "（暂无 Markdown 正文）"}</pre>
              </div>
            )}
            {tab === "edit" && (
              <form className="edit-form" onSubmit={saveChanges}>
                <div className="edit-form-heading">
                  <div>
                    <h2>编辑收藏</h2>
                    <p>原始网址不可修改；需要更换来源时请重新创建收藏。</p>
                  </div>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="退出编辑"
                    onClick={() => setTab("read")}
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
                </label>
                <label>
                  <span>标签</span>
                  <input
                    value={tagNames}
                    placeholder="多个标签用逗号分隔"
                    onChange={(event) => setTagNames(event.target.value)}
                  />
                  <small>最多 12 个标签；名称忽略大小写去重。</small>
                </label>
                <label>
                  <span>备注</span>
                  <textarea
                    className="note-editor"
                    value={note}
                    maxLength={5_000}
                    placeholder="补充你的阅读笔记…"
                    onChange={(event) => setNote(event.target.value)}
                  />
                </label>
                <label>
                  <span>Markdown 正文</span>
                  <textarea
                    className="markdown-editor"
                    value={markdown}
                    onChange={(event) => setMarkdown(event.target.value)}
                  />
                </label>
                <div className="edit-actions">
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => setTab("read")}
                  >
                    取消
                  </button>
                  <button
                    className="button button-primary"
                    type="submit"
                    disabled={saving}
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
                    <span className="tag-chip-dot" />
                    {tagItem.name}
                  </a>
                ))}
                {bookmark.tags.length === 0 && (
                  <button
                    className="tag-placeholder"
                    type="button"
                    onClick={() => setTab("edit")}
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
                  onClick={() => setTab("edit")}
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
                <dd>{formatDate(bookmark.createdAt)}</dd>
              </div>
              <div>
                <dt>最后提取</dt>
                <dd>{formatDate(bookmark.extractedAt)}</dd>
              </div>
              <div>
                <dt>HTTP 状态</dt>
                <dd>{bookmark.httpStatusCode ?? "—"}</dd>
              </div>
              <div>
                <dt>内容大小</dt>
                <dd>{Math.max(0, Math.round(bookmark.contentLength / 1024))} KB</dd>
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
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="删除这条收藏？"
        description="书签正文与标签关联会一并删除，此操作无法撤销。"
        confirmLabel="确认删除"
        destructive
        busy={deleting}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void performDelete()}
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
    </AppShell>
  );
}
