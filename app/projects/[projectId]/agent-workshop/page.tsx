// app/projects/[projectId]/agent-workshop/page.tsx
// 智能体工坊 — 跳转到智能体配置页（子导航栏在智能体页面内）

import { redirect } from "next/navigation";

export default async function AgentWorkshopPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/projects/${projectId}/agents`);
}
