/** 相对时间：刚添加 / N 分钟前 / 今天 HH:mm / 昨天 / 月日 / 年月日。 */
export function formatRelativeTime(date: string | Date): string {
  const target = typeof date === "string" ? new Date(date) : date;
  const now = Date.now();
  const diffMs = now - target.getTime();
  const diffMinutes = Math.round(diffMs / 60_000);

  if (diffMinutes < 1) return "刚刚";
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24 && isSameDay(target, new Date(now))) {
    return `今天 ${pad(target.getHours())}:${pad(target.getMinutes())}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(target, yesterday)) {
    return `昨天 ${pad(target.getHours())}:${pad(target.getMinutes())}`;
  }

  if (target.getFullYear() === new Date(now).getFullYear()) {
    return `${target.getMonth() + 1}月${target.getDate()}日`;
  }

  return `${target.getFullYear()}年${target.getMonth() + 1}月${target.getDate()}日`;
}

export function formatDateTime(date: string | Date | null): string {
  if (!date) return "—";
  const target = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(target);
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
