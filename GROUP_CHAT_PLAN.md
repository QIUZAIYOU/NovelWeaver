# StoryForge AI 群组聊天功能开发方案

## 一、需求分析

### 1.1 用户需求
- 像微信一样创建群组，将多个角色拉到一个群里
- 角色在群组中可以**自由对话**（AI 扮演所有角色，自动生成对话流）
- 也可以单独与某个角色私聊（已有 `@角色` 功能，但需增强）
- 群聊对话应当真实、自然，角色之间根据性格互相回应

### 1.2 适用场景
| 场景 | 说明 |
|------|------|
| 小队出发前讨论 | 伽马队 5 人讨论任务方案，各自发表意见 |
| 审讯/访谈 | 审问员 + 心理专家 + 被审问者三方对话 |
| 日常互动 | 基地休息室里角色闲聊，展现性格 |
| 危机应对 | 突发事件下多人实时沟通决策 |

---

## 二、技术方案

### 2.1 新增数据模型

```prisma
// 聊天群组
model ChatGroup {
  id          String   @id @default(cuid())
  projectId   String
  name        String                              // 群组名称（如"伽马队"）
  avatar      String   @default("")               // 群头像
  description String   @default("")               // 群描述
  topic       String   @default("")               // 当前讨论主题（用于 AI 上下文）
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  members     ChatGroupMember[]

  @@index([projectId])
}

// 群组成员
model ChatGroupMember {
  id          String   @id @default(cuid())
  groupId     String
  characterId String                              // 角色 ID
  role        String   @default("member")         // "leader" | "member" | "observer"
  joinedAt    DateTime @default(now())

  group       ChatGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)

  @@unique([groupId, characterId])
  @@index([groupId])
}
```

### 2.2 新增 API

| API | 方法 | 功能 |
|-----|------|------|
| `/api/projects/[id]/chat-groups` | GET/POST | 群组列表 / 创建群组 |
| `/api/projects/[id]/chat-groups/[id]` | PUT/DELETE | 更新群组 / 删除群组 |
| `/api/projects/[id]/chat-groups/[id]/members` | GET/POST | 成员列表 / 添加成员 |
| `/api/projects/[id]/chat-groups/[id]/members/[memberId]` | DELETE | 移除成员 |
| `/api/projects/[id]/chat-groups/[id]/chat` | POST | **群组对话：AI 自动生成多角色对话** |

### 2.3 核心 AI 对话机制

群组对话与普通聊天的核心区别：

```
普通聊天：
  用户输入 → AI 以单一身份回复

群组对话：
  用户输入一个场景/话题
  ↓
  AI 读取群组所有角色的性格/背景
  ↓
  AI 依次以每个角色的身份发言
  ↓
  生成一段多人对话流（3-6 轮）
```

Prompt 设计要点：
- 告诉 AI 群组中所有角色的身份、性格、彼此关系
- 要求 AI 按角色依次发言，每个角色用「角色名：」开头
- 发言顺序应符合角色性格（急性子先开口、沉默者最后）
- 对话应有互动感（角色 A 问问题 → 角色 B 回答 → 角色 C 插话）

### 2.4 UI 布局

借鉴微信/Telegram 的布局：

```
┌─────────────────────────────────────────┐
│  创作空间                                │
│  ┌──────────────┬──────────┬──────────┐  │
│  │ 群组列表侧栏  │ 聊天主区域 │ 上下文   │  │
│  │             │          │ 面板     │  │
│  │ 💬 伽马队    │ [角色A]   │         │  │
│  │ 💬 指挥部    │ 我觉得...│         │  │
│  │ 💬 休息室    │ [角色B]   │         │  │
│  │             │ 我不同意..│         │  │
│  │  ➕ 新建群组 │ [角色C]   │         │  │
│  │             │ 听我说...│         │  │
│  │  👤 伊利亚   │         │         │  │
│  │  👤 索菲亚   │ 输入框    │         │  │
│  └──────────────┴──────────┴──────────┘  │
└─────────────────────────────────────────┘
```

---

## 三、实施步骤

| 步骤 | 内容 | 预计时间 |
|------|------|----------|
| 1 | 创建 ChatGroup + ChatGroupMember Prisma 模型 + db push | 10min |
| 2 | 创建群组 CRUD API + 成员管理 API | 20min |
| 3 | 创建群组对话 API（多角色自动对话） | 30min |
| 4 | 创建群组侧栏组件 + 群聊视图 + 成员管理弹窗 | 60min |
| 5 | 集成到创作空间 workspace 页面 | 20min |
| 6 | 验证编译 | 5min |
