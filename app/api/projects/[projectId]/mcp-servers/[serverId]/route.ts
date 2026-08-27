// app/api/projects/[projectId]/mcp-servers/[serverId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, serverError, handleJsonError } from "@/lib/api/errors";
import { sanitizeString } from "@/lib/api/validation";

async function getOrError(id: string, projectId: string) {
  const s = await prisma.mcpServer.findUnique({ where: { id } });
  if (!s || s.projectId !== projectId) return { error: notFound("MCP 服务器不存在") };
  return { server: s };
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; serverId: string }> }
) {
  try {
    const { projectId, serverId } = await params;
    const { error } = await getOrError(serverId, projectId);
    if (error) return error;

    let body: Record<string, unknown>;
    try { body = await request.json(); } catch (err) { return handleJsonError(err); }

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) { const n = sanitizeString(body.name, 200, 1); if (!n) return badRequest("名称不能为空"); data.name = n; }
    if (body.transport !== undefined) data.transport = body.transport;
    if (body.command !== undefined) data.command = sanitizeString(body.command ?? "", 5000) ?? "";
    if (body.args !== undefined) data.args = Array.isArray(body.args) ? JSON.stringify(body.args) : "[]";
    if (body.url !== undefined) data.url = sanitizeString(body.url ?? "", 5000) ?? "";
    if (body.apiKey !== undefined) data.apiKey = sanitizeString(body.apiKey ?? "", 5000) ?? "";
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.tools !== undefined) data.tools = Array.isArray(body.tools) ? JSON.stringify(body.tools) : "[]";

    if (Object.keys(data).length === 0) return badRequest("没有要更新的字段");
    const updated = await prisma.mcpServer.update({ where: { id: serverId }, data });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return serverError("更新 MCP 服务器失败", error, "McpServerItemAPI");
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; serverId: string }> }
) {
  try {
    const { projectId, serverId } = await params;
    const { error } = await getOrError(serverId, projectId);
    if (error) return error;
    await prisma.mcpServer.delete({ where: { id: serverId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError("删除 MCP 服务器失败", error, "McpServerItemAPI");
  }
}
