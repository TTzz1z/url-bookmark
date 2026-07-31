import type { Metadata } from "next";
import { DetailScreen } from "@/components/detail-screen";

export const metadata: Metadata = {
  title: "书签详情",
};

export default function BookmarkDetailPage() {
  return <DetailScreen />;
}
