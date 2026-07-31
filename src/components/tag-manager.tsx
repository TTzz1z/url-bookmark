"use client";

import {
  FloppyDisk,
  PencilSimple,
  Plus,
  SpinnerGap,
  Tag,
  Trash,
  X,
} from "@phosphor-icons/react";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { ApiErrorDto, TagDto } from "@/types/api";
import { ConfirmDialog } from "./confirm-dialog";

type TagManagerProps = {
  open: boolean;
  tags: TagDto[];
  onClose: () => void;
  onChanged: (change: {
    type: "created" | "renamed" | "deleted";
    tagId: string;
  }) => Promise<void> | void;
};

async function responseError(response: Response): Promise<string> {
  const data = (await response.json().catch(() => null)) as ApiErrorDto | null;
  return data?.error.message ?? "操作失败，请稍后重试";
}

export function TagManager({
  open,
  tags,
  onClose,
  onChanged,
}: TagManagerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const [newTagName, setNewTagName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<TagDto | null>(null);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      createInputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  function closeManager() {
    if (busyId || creating) return;
    setNewTagName("");
    setEditingId("");
    setEditingName("");
    setPendingDelete(null);
    setBusyId("");
    setError("");
    onClose();
  }

  function beginRename(tagItem: TagDto) {
    setEditingId(tagItem.id);
    setEditingName(tagItem.name);
    setError("");
  }

  function cancelRename() {
    if (busyId) return;
    setEditingId("");
    setEditingName("");
    setError("");
  }

  async function createTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating || busyId) return;
    const nextName = newTagName.trim();
    if (!nextName) {
      setError("标签名称不能为空");
      return;
    }

    const normalized = nextName.normalize("NFKC").toLocaleLowerCase();
    const existing = tags.find(
      (tagItem) => tagItem.normalizedName === normalized,
    );
    if (existing) {
      setError(`标签“${existing.name}”已存在`);
      return;
    }

    setCreating(true);
    setError("");
    try {
      const response = await fetch("/api/tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });
      if (!response.ok) {
        throw new Error(await responseError(response));
      }
      const created = (await response.json()) as TagDto;
      setNewTagName("");
      await onChanged({ type: "created", tagId: created.id });
      createInputRef.current?.focus();
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "新增标签失败",
      );
    } finally {
      setCreating(false);
    }
  }

  async function renameTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId || busyId) return;
    const nextName = editingName.trim();
    if (!nextName) {
      setError("标签名称不能为空");
      return;
    }

    const tagId = editingId;
    setBusyId(tagId);
    setError("");
    try {
      const response = await fetch(`/api/tags/${tagId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });
      if (!response.ok) {
        throw new Error(await responseError(response));
      }
      await onChanged({ type: "renamed", tagId });
      setEditingId("");
      setEditingName("");
    } catch (renameError) {
      setError(
        renameError instanceof Error ? renameError.message : "重命名标签失败",
      );
    } finally {
      setBusyId("");
    }
  }

  async function performDelete() {
    if (!pendingDelete || busyId) return;
    const tagId = pendingDelete.id;
    setBusyId(tagId);
    setError("");
    try {
      const response = await fetch(`/api/tags/${tagId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(await responseError(response));
      }
      setPendingDelete(null);
      if (editingId === tagId) {
        setEditingId("");
        setEditingName("");
      }
      await onChanged({ type: "deleted", tagId });
    } catch (deleteError) {
      setPendingDelete(null);
      setError(
        deleteError instanceof Error ? deleteError.message : "删除标签失败",
      );
    } finally {
      setBusyId("");
    }
  }

  const actionsLocked = Boolean(busyId) || creating;

  return (
    <>
      <dialog
        className="tag-manager-dialog"
        ref={dialogRef}
        aria-labelledby="tag-manager-title"
        onCancel={(event) => {
          event.preventDefault();
          closeManager();
        }}
        onClose={closeManager}
      >
        <div className="tag-manager-heading">
          <div>
            <span className="tag-manager-icon">
              <Tag size={19} weight="fill" aria-hidden="true" />
            </span>
            <div>
              <h2 id="tag-manager-title">标签管理</h2>
              <p>共 {tags.length} 个标签，可新增、重命名或删除。</p>
            </div>
          </div>
          <button
            className="dialog-close"
            type="button"
            aria-label="关闭标签管理"
            disabled={actionsLocked}
            onClick={closeManager}
          >
            <X size={18} />
          </button>
        </div>

        <form className="tag-create-form" onSubmit={createTag}>
          <label className="sr-only" htmlFor="tag-create-name">
            新标签名称
          </label>
          <input
            ref={createInputRef}
            id="tag-create-name"
            value={newTagName}
            maxLength={30}
            disabled={actionsLocked}
            placeholder="输入新标签名称"
            onChange={(event) => setNewTagName(event.target.value)}
          />
          <button
            className="button button-primary"
            type="submit"
            disabled={actionsLocked || !newTagName.trim()}
          >
            {creating ? (
              <SpinnerGap className="is-spinning" size={16} />
            ) : (
              <Plus size={16} weight="bold" />
            )}
            {creating ? "正在添加" : "新增标签"}
          </button>
        </form>

        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}

        <div className="tag-manager-list">
          {tags.length === 0 ? (
            <p className="tag-manager-empty">
              还没有标签。在上方输入名称后点击「新增标签」。
            </p>
          ) : (
            tags.map((tagItem) => {
              const count = tagItem.bookmarkCount ?? 0;
              const editing = editingId === tagItem.id;
              const busy = busyId === tagItem.id;
              return (
                <div className="tag-manager-row" key={tagItem.id}>
                  {editing ? (
                    <form
                      className="tag-rename-form"
                      onSubmit={renameTag}
                    >
                      <label className="sr-only" htmlFor={`tag-name-${tagItem.id}`}>
                        {`重命名标签 ${tagItem.name}`}
                      </label>
                      <input
                        id={`tag-name-${tagItem.id}`}
                        value={editingName}
                        maxLength={30}
                        required
                        autoFocus
                        disabled={busy}
                        onChange={(event) => setEditingName(event.target.value)}
                      />
                      <button
                        className="icon-button compact"
                        type="submit"
                        disabled={busy}
                        aria-label={`保存标签 ${tagItem.name}`}
                      >
                        {busy ? (
                          <SpinnerGap className="is-spinning" size={16} />
                        ) : (
                          <FloppyDisk size={16} weight="fill" />
                        )}
                      </button>
                      <button
                        className="icon-button compact"
                        type="button"
                        disabled={busy}
                        aria-label="取消重命名"
                        onClick={cancelRename}
                      >
                        <X size={16} />
                      </button>
                    </form>
                  ) : (
                    <div className="tag-manager-name">
                      <span className="tag-chip-dot" />
                      <span>{tagItem.name}</span>
                    </div>
                  )}
                  <span className="tag-usage">
                    {count} 条收藏
                  </span>
                  {!editing && (
                    <div className="tag-manager-actions">
                      <button
                        className="icon-button compact"
                        type="button"
                        disabled={actionsLocked}
                        aria-label={`重命名标签 ${tagItem.name}`}
                        title="重命名"
                        onClick={() => beginRename(tagItem)}
                      >
                        <PencilSimple size={16} />
                      </button>
                      <button
                        className="icon-button compact tag-delete-button"
                        type="button"
                        disabled={actionsLocked}
                        aria-label={`删除标签 ${tagItem.name}`}
                        title="删除"
                        onClick={() => {
                          setError("");
                          setPendingDelete(tagItem);
                        }}
                      >
                        <Trash size={16} weight="fill" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </dialog>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={`删除标签“${pendingDelete?.name ?? ""}”？`}
        description={`这个标签将从 ${pendingDelete?.bookmarkCount ?? 0} 条收藏中移除。收藏本身不会被删除，但标签删除后无法恢复。`}
        confirmLabel="确认删除标签"
        destructive
        busy={Boolean(busyId)}
        onCancel={() => {
          if (!busyId) setPendingDelete(null);
        }}
        onConfirm={() => void performDelete()}
      />
    </>
  );
}
