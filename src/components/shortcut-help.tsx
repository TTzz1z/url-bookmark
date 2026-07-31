"use client";

import { Keyboard, X } from "@phosphor-icons/react";
import { useEffect, useId, useRef } from "react";

const shortcuts: Array<{ keys: string; action: string }> = [
  { keys: "/", action: "聚焦搜索" },
  { keys: "n 或 a", action: "聚焦添加网址" },
  { keys: "j / k", action: "上下移动书签卡片" },
  { keys: "o", action: "打开当前卡片原网页" },
  { keys: "e", action: "详情页进入编辑" },
  { keys: "r", action: "详情页重新提取" },
  { keys: "Ctrl/⌘ + S", action: "编辑页保存修改" },
  { keys: "Esc", action: "关闭对话框 / 退出搜索焦点" },
  { keys: "?", action: "打开或关闭本面板" },
];

type ShortcutHelpProps = {
  open: boolean;
  onClose: () => void;
};

export function ShortcutHelp({ open, onClose }: ShortcutHelpProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      className="shortcut-dialog"
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
    >
      <button
        className="dialog-close"
        type="button"
        aria-label="关闭"
        onClick={onClose}
      >
        <X size={18} />
      </button>
      <div className="shortcut-heading">
        <Keyboard size={22} weight="duotone" aria-hidden="true" />
        <h2 id={titleId}>键盘快捷键</h2>
      </div>
      <ul className="shortcut-list">
        {shortcuts.map((item) => (
          <li key={item.keys}>
            <kbd>{item.keys}</kbd>
            <span>{item.action}</span>
          </li>
        ))}
      </ul>
    </dialog>
  );
}
