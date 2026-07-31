"use client";

import Link from "next/link";
import {
  ArrowLeft,
  BookmarkSimple,
  Books,
  CaretUp,
  CaretDown,
  HardDrive,
  List,
  Plus,
  SidebarSimple,
  Tag,
  X,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ThemeToggle } from "./theme-toggle";
import { tagDotIndex } from "@/lib/tag-color";
import type { StorageUsageDto, TagDto } from "@/types/api";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

function StorageCard() {
  const [usage, setUsage] = useState<StorageUsageDto | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/storage", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: StorageUsageDto | null) => {
        if (active && data) setUsage(data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="storage-card">
      <div className="storage-title">
        <HardDrive size={17} aria-hidden="true" />
        <span>本地数据</span>
        {usage && <strong>{formatBytes(usage.totalBytes)}</strong>}
      </div>
      {usage ? (
        <p>
          数据库 {formatBytes(usage.databaseBytes)} · 图片{" "}
          {formatBytes(usage.assetBytes)}
        </p>
      ) : (
        <p>SQLite · data/bookmarks.db</p>
      )}
    </div>
  );
}

type AppShellProps = {
  children: ReactNode;
  tags?: TagDto[];
  total?: number;
  selectedTag?: string;
  onSelectTag?: (tagId: string) => void;
  onManageTags?: () => void;
  backHref?: string;
  backLabel?: string;
  activeNav?: "home" | "collections";
};

function NavigationContent({
  tags = [],
  total = 0,
  selectedTag = "",
  onSelectTag,
  onManageTags,
  closeMobile,
  activeNav = "collections",
}: Omit<AppShellProps, "children"> & { closeMobile?: () => void }) {
  const [showAllTags, setShowAllTags] = useState(false);
  const chooseTag = (tagId: string) => {
    onSelectTag?.(tagId);
    closeMobile?.();
  };
  const openTagManager = () => {
    onManageTags?.();
    closeMobile?.();
  };

  return (
    <>
      <Link
        className="sidebar-add-button"
        href="/#add-bookmark"
        onClick={closeMobile}
      >
        <Plus size={18} weight="bold" aria-hidden="true" />
        添加网址
      </Link>

      <nav className="sidebar-nav" aria-label="主导航">
        <Link
          className={`sidebar-link ${activeNav === "collections" || activeNav === "home" ? "is-active" : ""}`}
          href="/"
          onClick={closeMobile}
        >
          <Books size={18} aria-hidden="true" />
          <span>全部收藏</span>
          <span className="sidebar-count">{total}</span>
        </Link>
        {onManageTags ? (
          <button
            className="sidebar-link"
            type="button"
            onClick={openTagManager}
          >
            <Tag size={18} aria-hidden="true" />
            <span>标签管理</span>
            <span className="sidebar-count">{tags.length}</span>
          </button>
        ) : (
          <Link
            className="sidebar-link"
            href="/?manageTags=1"
            onClick={closeMobile}
          >
            <Tag size={18} aria-hidden="true" />
            <span>标签管理</span>
            <span className="sidebar-count">{tags.length}</span>
          </Link>
        )}
      </nav>

      <div className="sidebar-section" id="tag-filter">
        <h2>标签筛选</h2>
        <button
          className={`sidebar-link sidebar-filter ${selectedTag === "" ? "is-filter-active" : ""}`}
          onClick={() => chooseTag("")}
          type="button"
          aria-pressed={selectedTag === ""}
          disabled={!onSelectTag}
        >
          <List size={18} aria-hidden="true" />
          <span>全部标签</span>
          <span className="sidebar-count">{total}</span>
        </button>
        {tags.slice(0, showAllTags ? tags.length : 6).map((tagItem) => (
          <button
            className={`sidebar-link sidebar-filter ${selectedTag === tagItem.id ? "is-filter-active" : ""} ${(tagItem.bookmarkCount ?? 0) === 0 ? "is-empty-count" : ""}`}
            key={tagItem.id}
            onClick={() => chooseTag(tagItem.id)}
            type="button"
            aria-pressed={selectedTag === tagItem.id}
            disabled={!onSelectTag}
          >
            <span className={`tag-dot tag-dot-${tagDotIndex(tagItem.name)}`} />
            <span>{tagItem.name}</span>
            <span className="sidebar-count">{tagItem.bookmarkCount ?? 0}</span>
          </button>
        ))}
        {tags.length > 6 && (
          <button
            className="sidebar-more"
            type="button"
            aria-expanded={showAllTags}
            onClick={() => setShowAllTags((value) => !value)}
          >
            {showAllTags ? (
              <CaretUp size={15} aria-hidden="true" />
            ) : (
              <CaretDown size={15} aria-hidden="true" />
            )}
            {showAllTags ? "收起标签" : `更多标签（${tags.length - 6}）`}
          </button>
        )}
        {tags.length === 0 && (
          <p className="sidebar-empty">收藏后可在详情中添加标签</p>
        )}
      </div>

      <StorageCard />
    </>
  );
}

export function AppShell({
  children,
  tags,
  total,
  selectedTag,
  onSelectTag,
  onManageTags,
  backHref,
  backLabel = "返回列表",
  activeNav = "collections",
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    const trigger = mobileMenuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusables = () =>
      Array.from(sidebar.querySelectorAll<HTMLElement>(focusableSelector));
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    queueMicrotask(() => focusables()[0]?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      trigger?.focus();
    };
  }, [mobileOpen]);

  return (
    <div className="app-frame">
      <header className="topbar">
        <div className="topbar-left">
          <Link className="brand" href="/">
            <span className="brand-mark">
              <BookmarkSimple size={18} weight="fill" aria-hidden="true" />
            </span>
            <span>网址收藏夹</span>
          </Link>
          {backHref && (
            <Link className="topbar-back" href={backHref}>
              <ArrowLeft size={16} aria-hidden="true" />
              {backLabel}
            </Link>
          )}
        </div>
        <div className="topbar-right">
          <ThemeToggle />
          <button
            className="mobile-menu-button"
            ref={mobileMenuButtonRef}
            type="button"
            aria-label={mobileOpen ? "关闭导航" : "打开导航"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((value) => !value)}
          >
            {mobileOpen ? <X size={22} /> : <SidebarSimple size={22} />}
          </button>
        </div>
      </header>

      <aside
        className={`sidebar ${mobileOpen ? "is-open" : ""}`}
        ref={sidebarRef}
      >
        <NavigationContent
          tags={tags}
          total={total}
          selectedTag={selectedTag}
          onSelectTag={onSelectTag}
          onManageTags={onManageTags}
          activeNav={activeNav}
          closeMobile={() => setMobileOpen(false)}
        />
      </aside>
      {mobileOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="关闭导航"
          onClick={() => setMobileOpen(false)}
          type="button"
        />
      )}
      <main className="main-content" id="main">
        {children}
      </main>
    </div>
  );
}
