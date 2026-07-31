"use client";

import type { ReactNode } from "react";
import { ToastViewport } from "./toast";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ToastViewport />
    </>
  );
}
