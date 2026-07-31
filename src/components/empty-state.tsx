import {
  BookmarkSimple,
  MagnifyingGlass,
  WarningCircle,
} from "@phosphor-icons/react";

type EmptyStateProps = {
  kind?: "empty" | "search" | "error";
  title: string;
  description: string;
  action?: React.ReactNode;
};

export function EmptyState({
  kind = "empty",
  title,
  description,
  action,
}: EmptyStateProps) {
  const Icon =
    kind === "search"
      ? MagnifyingGlass
      : kind === "error"
        ? WarningCircle
        : BookmarkSimple;
  return (
    <section className="empty-state">
      <span className="empty-state-icon">
        <Icon size={28} aria-hidden="true" />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </section>
  );
}
