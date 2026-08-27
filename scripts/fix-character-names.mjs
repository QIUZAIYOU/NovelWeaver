// scripts/fix-character-names.mjs
// 为已有对话消息补充 characterName 元数据
// 运行: node scripts/fix-character-names.mjs

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** 从消息内容中提取 @角色名 */
function extractMention(text) {
  const match = text.match(/@(\S+)/);
  return match ? match[1] : null;
}

async function main() {
  // 获取所有 assistant 消息
  const messages = await prisma.message.findMany({
    where: { role: "assistant" },
    orderBy: { createdAt: "asc" },
  });

  console.log(`共 ${messages.length} 条 AI 消息`);

  let updated = 0;

  for (const msg of messages) {
    // 跳过已有 characterName 的
    let metadata = {};
    try { metadata = JSON.parse(msg.metadata); } catch { metadata = {}; }
    if (metadata.characterName) continue;

    // 查找上一条用户消息是否有 @角色
    const prevUserMsg = await prisma.message.findFirst({
      where: {
        projectId: msg.projectId,
        role: "user",
        createdAt: { lt: msg.createdAt },
      },
      orderBy: { createdAt: "desc" },
    });

    if (prevUserMsg) {
      const charName = extractMention(prevUserMsg.content);
      if (charName) {
        metadata.characterName = charName;
        await prisma.message.update({
          where: { id: msg.id },
          data: { metadata: JSON.stringify(metadata) },
        });
        console.log(`  ✔ [${msg.id.slice(0,8)}] → ${charName}`);
        updated++;
      }
    }
  }

  console.log(`\n已更新 ${updated} 条消息`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
