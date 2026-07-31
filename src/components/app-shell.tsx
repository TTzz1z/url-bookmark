"use client";

import Link from "next/link";
import {
  ArrowLeft,
  BookmarkSimple,
  Books,
  CaretUp,
  CaretDown,
  HardDrive,
  House,
  List,
  Plus,
  SidebarSimple,
  Tag,
  Trash,
  X,
} from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import type { TagDto } from "@/types/api";

type AppShellProps = {
  children: ReactNode;
  tags?: TagDto[];
  total?: number;
  selectedTag?: string;
  onSelectTag?: (tagId: string) => void;
  backHref?: string;
  backLabel?: string;
  activeNav?: "home" | "collections";
};

function NavigationContent({
  tags = [],
  total = 0,
  selectedTag = "",
  onSelectTag,
  closeMobile,
  activeNav = "home",
}: Omit<AppShellProps, "children"> & { closeMobile?: () => void }) {
  const [showAllTags, setShowAllTags] = useState(false);
  const chooseTag = (tagId: string) => {
    onSelectTag?.(tagId);
    closeMobile?.();
  };

  return (
    <>
      <Link className="sidebar-add-button" href="/#add-bookmark" onClick={closeMobile}>
        <Plus size={18} weight="bold" aria-hidden="true" />
        添加网址
      </Link>

      <nav className="sidebar-nav" aria-label="主导航">
        <Link
          className={`sidebar-link ${activeNav === "home" ? "is-active" : ""}`}
          href="/"
          onClick={closeMobile}
        >
          <House size={18} aria-hidden="true" />
          <span>首页</span>
        </Link>
        <Link
          className={`sidebar-link ${activeNav === "collections" ? "is-active" : ""}`}
          href="/"
          onClick={closeMobile}
        >
          <Books size={18} aria-hidden="true" />
          <span>全部收藏</span>
          <span className="sidebar-count">{total}</span>
        </Link>
        <a className="sidebar-link" href="#tag-filter" onClick={closeMobile}>
          <Tag size={18} aria-hidden="true" />
          <span>标签管理</span>
          <span className="sidebar-count">{tags.length}</span>
        </a>
        <span className="sidebar-link is-muted" aria-disabled="true">
          <Trash size={18} aria-hidden="true" />
          <span>回收站</span>
        </span>
      </nav>

      <div className="sidebar-section" id="tag-filter">
        <h2>标签筛选</h2>
        <button
          className={`sidebar-link sidebar-filter ${selectedTag === "" ? "is-active" : ""}`}
          onClick={() => chooseTag("")}
          type="button"
        >
          <List size={18} aria-hidden="true" />
          <span>全部标签</span>
          <span className="sidebar-count">{total}</span>
        </button>
        {tags.slice(0, showAllTags ? tags.length : 6).map((tagItem, index) => (
          <button
            className={`sidebar-link sidebar-filter ${selectedTag === tagItem.id ? "is-active" : ""}`}
            key={tagItem.id}
            onClick={() => chooseTag(tagItem.id)}
            type="button"
          >
            <span className={`tag-dot tag-dot-${(index % 6) + 1}`} />
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

      <div className="storage-card">
        <div className="storage-title">
          <HardDrive size={17} aria-hidden="true" />
          本地存储
        </div>
        <div className="storage-meter" aria-hidden="true">
          <span />
        </div>
        <p>SQLite · data/bookmarks.db</p>
      </div>
    </>
  );
}

export function AppShell({
  children,
  tags,
  total,
  selectedTag,
  onSelectTag,
  backHref,
  backLabel = "返回列表",
  activeNav = "home",
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

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
        {!backHref && (
          <div className="topbar-user">
            <span className="user-avatar">U</span>
            <span className="user-name">本地用户</span>
            <CaretDown size={14} aria-hidden="true" />
          </div>
        )}
        <button
          className="mobile-menu-button"
          type="button"
          aria-label={mobileOpen ? "关闭导航" : "打开导航"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((value) => !value)}
        >
          {mobileOpen ? <X size={22} /> : <SidebarSimple size={22} />}
        </button>
      </header>

      <aside className={`sidebar ${mobileOpen ? "is-open" : ""}`}>
        <NavigationContent
          tags={tags}
          total={total}
          selectedTag={selectedTag}
          onSelectTag={onSelectTag}
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
