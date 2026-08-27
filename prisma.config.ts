// prisma.config.ts
// Prisma v7 配置 — 数据库连接 URL 和 schema 路径

import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: "file:./prisma/novelweaver.db",
  },
});
