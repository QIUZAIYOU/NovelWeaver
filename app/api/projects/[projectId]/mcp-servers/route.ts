// app/api/projects/[projectId]/mcp-servers/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, serverError, handleJsonError } from "@/lib/api/errors";
import { sanitizeString } from "@/lib/api/validation";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const servers = await prisma.mcpServer.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ success: true, data: servers });
  } catch (error) {
    return serverError("获取 MCP 服务器列表失败", error, "McpServerAPI");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return notFound("项目不存在");

    let body: Record<string, unknown>;
    try { body = await request.json(); } catch (error) { return handleJsonError(error); }

    const name = sanitizeString(body.name, 200, 1);
    if (!name) return badRequest("服务器名称不能为空");

    const transport = typeof body.transport === "string" ? body.transport : "stdio";
    const tools = Array.isArray(body.tools) ? JSON.stringify(body.tools) : "[]";

    const server = await prisma.mcpServer.create({
      data: {
        projectId,
        name,
        transport,
        command: sanitizeString(body.command ?? "", 5000) ?? "",
        args: Array.isArray(body.args) ? JSON.stringify(body.args) : "[]",
        url: sanitizeString(body.url ?? "", 5000) ?? "",
        apiKey: sanitizeString(body.apiKey ?? "", 5000) ?? "",
        tools,
        isActive: body.isActive !== false,
      },
    });

    return NextResponse.json({ success: true, data: server }, { status: 201 });
  } catch (error) {
    return serverError("创建 MCP 服务器失败", error, "McpServerAPI");
  }
}
