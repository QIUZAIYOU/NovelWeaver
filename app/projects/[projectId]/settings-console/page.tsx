// app/projects/[projectId]/settings-console/page.tsx
// 设定控制台 — 跳转到角色管理页（子导航栏在角色页内）

import { redirect } from "next/navigation";

export default async function SettingsConsolePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/projects/${projectId}/characters`);
}
