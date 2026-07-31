"use client";

import { WarningCircle, X } from "@phosphor-icons/react";
import { useEffect, useId, useRef } from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmedRef = useRef(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      confirmedRef.current = false;
      dialog.showModal();
      cancelRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      className="confirm-dialog"
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClose={() => {
        if (confirmedRef.current) {
          confirmedRef.current = false;
          return;
        }
        onCancel();
      }}
    >
      <button
        className="dialog-close"
        type="button"
        aria-label="关闭"
        onClick={onCancel}
      >
        <X size={18} />
      </button>
      <span className={`dialog-icon ${destructive ? "is-danger" : ""}`}>
        <WarningCircle size={28} weight="fill" aria-hidden="true" />
      </span>
      <h2 id={titleId}>{title}</h2>
      <p id={descriptionId}>{description}</p>
      <div className="dialog-actions">
        <button
          className="button button-secondary"
          ref={cancelRef}
          type="button"
          onClick={onCancel}
        >
          取消
        </button>
        <button
          className={`button ${destructive ? "button-danger" : "button-primary"}`}
          type="button"
          disabled={busy}
          onClick={() => {
            confirmedRef.current = true;
            onConfirm();
          }}
        >
          {busy ? "处理中…" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
