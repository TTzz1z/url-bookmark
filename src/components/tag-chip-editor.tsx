"use client";

import { Plus, X } from "@phosphor-icons/react";
import { KeyboardEvent, useMemo, useState } from "react";
import { showToast } from "./toast";
import { tagDotIndex } from "@/lib/tag-color";
import type { TagDto } from "@/types/api";

const MAX_TAGS = 12;

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

type TagChipEditorProps = {
  value: string;
  suggestions: TagDto[];
  onChange: (next: string) => void;
};

export function TagChipEditor({
  value,
  suggestions,
  onChange,
}: TagChipEditorProps) {
  const [draft, setDraft] = useState("");
  const selected = useMemo(() => splitTagNames(value), [value]);

  function commitNames(next: string[]) {
    onChange(next.join(", "));
  }

  function addTag(raw: string) {
    const name = raw.trim().replace(/[,，]/g, "");
    if (!name) return;
    const existing = selected.find(
      (item) => item.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    if (existing) {
      setDraft("");
      return;
    }
    if (selected.length >= MAX_TAGS) {
      showToast({
        kind: "error",
        message: `每条收藏最多添加 ${MAX_TAGS} 个标签。`,
      });
      return;
    }
    commitNames([...selected, name]);
    setDraft("");
  }

  function removeTag(name: string) {
    commitNames(
      selected.filter(
        (item) => item.toLocaleLowerCase() !== name.toLocaleLowerCase(),
      ),
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(draft);
      return;
    }
    if (event.key === "Backspace" && !draft && selected.length > 0) {
      event.preventDefault();
      removeTag(selected[selected.length - 1]!);
    }
  }

  return (
    <div className="tag-chip-editor">
      <div className="tag-chip-editor-field">
        {selected.map((tag) => (
          <button
            type="button"
            className="tag-edit-chip"
            key={tag}
            onClick={() => removeTag(tag)}
            aria-label={`移除标签 ${tag}`}
          >
            <span className={`tag-chip-dot tag-dot-${tagDotIndex(tag)}`} />
            <span>{tag}</span>
            <X size={12} aria-hidden="true" />
          </button>
        ))}
        <input
          value={draft}
          aria-label="添加标签"
          placeholder={
            selected.length === 0 ? "输入标签后按回车" : "继续添加…"
          }
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (draft.trim()) addTag(draft);
          }}
        />
      </div>
      <small>
        最多 {MAX_TAGS} 个标签；回车或逗号添加，点击芯片可移除。
      </small>
      {suggestions.length > 0 && (
        <div className="tag-suggestions" aria-label="已有标签建议">
          <span>快速添加</span>
          {suggestions.map((tagItem) => (
            <button
              type="button"
              key={tagItem.id}
              onClick={() => addTag(tagItem.name)}
            >
              <Plus size={12} aria-hidden="true" />
              {tagItem.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
