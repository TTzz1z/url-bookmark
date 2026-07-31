import {
  CheckCircle,
  ClockCountdown,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react";
import type { ExtractionStatus } from "@/db/schema";

const labels: Record<ExtractionStatus, string> = {
  success: "提取成功",
  partial: "部分提取",
  failed: "提取失败",
  pending: "正在提取",
};

export function StatusBadge({ status }: { status: ExtractionStatus }) {
  const Icon =
    status === "success"
      ? CheckCircle
      : status === "partial"
        ? ClockCountdown
        : status === "failed"
          ? WarningCircle
          : SpinnerGap;
  return (
    <span className={`status-badge status-${status}`}>
      <Icon
        className={status === "pending" ? "is-spinning" : ""}
        size={14}
        weight="fill"
        aria-hidden="true"
      />
      {labels[status]}
    </span>
  );
}
