// app/projects/[projectId]/archive-workshop/page.tsx
// 档案工作台 — 跳转到档案管理页（子导航栏在档案页内）

import { redirect } from "next/navigation";

export default async function ArchiveWorkshopPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/projects/${projectId}/archives`);
}
