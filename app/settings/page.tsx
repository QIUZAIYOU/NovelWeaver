// app/settings/page.tsx
// 设置页 — 已改为弹窗，此页面自动打开设置弹窗后重定向

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/stores/app-store";

export default function SettingsPage() {
  const router = useRouter();
  const { setSettingsOpen } = useAppStore();

  useEffect(() => {
    setSettingsOpen(true);
    router.replace("/");
  }, [setSettingsOpen, router]);

  return null;
}
