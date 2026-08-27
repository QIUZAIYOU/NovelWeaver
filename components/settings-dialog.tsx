// components/settings-dialog.tsx
// 设置弹窗 — 模型配置、DeepSeek 优化引擎、外观设置

"use client";

import React, { useState, useEffect } from "react";
import { Save, RotateCcw, CheckCircle2, RefreshCw, Loader2, Zap, Cpu, TrendingUp, X } from "lucide-react";
import { useTheme } from "@/lib/theme-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useSettingsStore, DEEPSEEK_PRICING, PRESET_MODELS, DEFAULT_PROMPT_TEMPLATES, type PromptTemplates } from "@/stores/settings-store";
import { useAppStore } from "@/stores/app-store";
import { toast } from "@/hooks/use-toast";

export function SettingsDialog() {
  const { settingsOpen, setSettingsOpen } = useAppStore();
  const { modelConfig, setModelConfig, setPreset, promptTemplates, setPromptTemplate, resetPromptTemplate, resetAllPromptTemplates } = useSettingsStore();
  const { theme, setTheme } = useTheme();
  const [saved, setSaved] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"config" | "deepseek" | "appearance" | "prompts">("config");

  // 本地表单状态
  const [form, setForm] = useState({ ...modelConfig });

  // 模型列表相关状态
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelsFetched, setModelsFetched] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // 每次打开弹窗时同步表单
  useEffect(() => {
    if (settingsOpen) {
      setForm({ ...modelConfig });
      setSaved(false);
    }
  }, [settingsOpen, modelConfig]);

  /** 更新表单字段 */
  const updateField = (field: string, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  /** 获取模型列表 */
  const handleFetchModels = async () => {
    if (!form.apiBaseUrl.trim()) {
      toast({ title: "请先填写 API Base URL", variant: "destructive" });
      return;
    }
    setFetchingModels(true);
    setAvailableModels([]);
    setModelsFetched(false);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiBaseUrl: form.apiBaseUrl, apiKey: form.apiKey }),
      });
      const data = await res.json();
      if (data.success && data.data.length > 0) {
        setAvailableModels(data.data);
        setModelsFetched(true);
        toast({ title: "获取成功", description: `找到 ${data.data.length} 个可用模型`, variant: "success" });
      } else {
        toast({ title: "未找到模型", description: data.error || "请检查 API 地址和 Key 是否正确", variant: "destructive" });
      }
    } catch {
      toast({ title: "获取失败", description: "无法连接到 API 服务器", variant: "destructive" });
    } finally {
      setFetchingModels(false);
    }
  };

  const handleSelectModel = (modelName: string) => updateField("modelName", modelName);

  const handleSave = () => {
    setModelConfig(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    const defaults = {
      apiBaseUrl: "https://api.deepseek.com",
      apiKey: "",
      modelName: "deepseek-v4-flash",
      temperature: 0.7,
      topP: 0.9,
      maxTokens: 8192,
      systemPrompt:
        "你是一位经验丰富的作家和故事讲述者。你擅长创作生动的叙事、刻画鲜明的角色，并能根据用户的需求进行小说创作或跑团辅助。",
      preset: "flash" as const,
      effort: "max" as const,
    };
    setForm(defaults);
    setModelConfig(defaults);
    setAvailableModels([]);
    setModelsFetched(false);
  };

  return (
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>
            配置 AI 模型连接和应用偏好
          </DialogDescription>
        </DialogHeader>

        {/* Tab 导航 */}
        <div className="flex gap-0.5 border-b border-border -mx-6 px-6 shrink-0">
          <TabButton active={settingsTab === "config"} onClick={() => setSettingsTab("config")}>模型配置</TabButton>
          <TabButton active={settingsTab === "deepseek"} onClick={() => setSettingsTab("deepseek")}>DeepSeek 优化</TabButton>
          <TabButton active={settingsTab === "appearance"} onClick={() => setSettingsTab("appearance")}>外观</TabButton>
          <TabButton active={settingsTab === "prompts"} onClick={() => setSettingsTab("prompts")}>提示词</TabButton>
        </div>

        <div className="space-y-6">
          {settingsTab === "config" && (
          <>
          {/* 模型配置 */}
          <Card>
            <CardHeader>
              <CardTitle>AI 模型配置</CardTitle>
              <CardDescription>
                配置 OpenAI 兼容 API 的连接参数（支持 Ollama、vLLM、OpenAI 等）
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* API Base URL */}
              <div className="space-y-2">
                <Label htmlFor="dlg-apiBaseUrl">API Base URL</Label>
                <Input
                  id="dlg-apiBaseUrl"
                  placeholder="http://localhost:11434/v1"
                  value={form.apiBaseUrl}
                  onChange={(e) => {
                    updateField("apiBaseUrl", e.target.value);
                    if (modelsFetched) { setModelsFetched(false); setAvailableModels([]); }
                  }}
                />
                <p className="text-sm text-muted-foreground">
                  Ollama 默认：http://localhost:11434/v1 | OpenAI：https://api.openai.com/v1
                </p>
              </div>

              {/* API Key */}
              <div className="space-y-2">
                <Label htmlFor="dlg-apiKey">API Key</Label>
                <Input
                  id="dlg-apiKey"
                  type="password"
                  placeholder="sk-...（Ollama 可留空）"
                  value={form.apiKey}
                  onChange={(e) => updateField("apiKey", e.target.value)}
                />
              </div>

              {/* 模型名称 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="dlg-modelName">模型名称</Label>
                  <Button variant="outline" size="sm" onClick={handleFetchModels}
                    disabled={fetchingModels || !form.apiBaseUrl.trim()} className="gap-1.5 h-7 text-sm">
                    {fetchingModels ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    {fetchingModels ? "获取中..." : "获取模型列表"}
                  </Button>
                </div>
                {modelsFetched && availableModels.length > 0 && (
                  <Select value={form.modelName} onValueChange={handleSelectModel}>
                    <SelectTrigger><SelectValue placeholder="从列表中选择模型" /></SelectTrigger>
                    <SelectContent>
                      {availableModels.map((model) => (
                        <SelectItem key={model} value={model}>{model}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Input id="dlg-modelName" placeholder="llama3 / gpt-4o / qwen2"
                  value={form.modelName} onChange={(e) => updateField("modelName", e.target.value)} />
              </div>

              <Separator />

              {/* 高级参数 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dlg-temperature">Temperature：{form.temperature}</Label>
                  <Input id="dlg-temperature" type="range" min="0" max="2" step="0.1"
                    value={form.temperature} onChange={(e) => updateField("temperature", parseFloat(e.target.value))}
                    className="accent-primary" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dlg-topP">Top-P：{form.topP}</Label>
                  <Input id="dlg-topP" type="range" min="0" max="1" step="0.05"
                    value={form.topP} onChange={(e) => updateField("topP", parseFloat(e.target.value))}
                    className="accent-primary" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dlg-maxTokens">最大 Token 数</Label>
                  <Input id="dlg-maxTokens" type="number" min="256" max="128000"
                    value={form.maxTokens} onChange={(e) => updateField("maxTokens", parseInt(e.target.value) || 4096)} />
                </div>
              </div>

              <Separator />

              {/* 系统预设 Prompt */}
              <div className="space-y-2">
                <Label htmlFor="dlg-systemPrompt">系统预设 Prompt</Label>
                <Textarea id="dlg-systemPrompt" rows={4}
                  placeholder="定义 AI 的默认行为和风格..."
                  value={form.systemPrompt} onChange={(e) => updateField("systemPrompt", e.target.value)} />
              </div>

              {/* 操作按钮 */}
              <div className="flex items-center gap-3">
                <Button onClick={handleSave} className="gap-2">
                  {saved ? <><CheckCircle2 className="h-4 w-4" />已保存</> : <><Save className="h-4 w-4" />保存设置</>}
                </Button>
                <Button variant="outline" onClick={handleReset} className="gap-2">
                  <RotateCcw className="h-4 w-4" />恢复默认
                </Button>
              </div>
            </CardContent>
          </Card>
          </>
          )}

          {settingsTab === "deepseek" && (
          <>
          {/* DeepSeek 优化配置 */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" />
                <div>
                  <CardTitle>DeepSeek 优化引擎</CardTitle>
                  <CardDescription>利用 DeepSeek prefix-cache 缓存技术，大幅降低长会话成本</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label>模型预设</Label>
                <div className="grid grid-cols-3 gap-3">
                  {(["flash", "auto", "pro"] as const).map((preset) => {
                    const m = PRESET_MODELS[preset];
                    const p = DEEPSEEK_PRICING[m.cost];
                    return (
                      <button key={preset} onClick={() => setPreset(preset)}
                        className={`flex flex-col items-center gap-2 border-2 p-4 transition-smooth ${
                          modelConfig.preset === preset ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                        }`}>
                        <span className="text-lg font-bold">{preset === "flash" ? "⚡" : preset === "auto" ? "🔄" : "🧠"}</span>
                        <span className="text-sm font-medium">{m.label}</span>
                        <span className="text-sm text-muted-foreground">输入 $0.14/M · 输出 $0.28/M</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-sm text-muted-foreground">
                  {modelConfig.preset === "flash" && "经济模式：默认使用 v4-Flash，适合日常创作"}
                  {modelConfig.preset === "auto" && "智能模式：复杂任务自动切换到 Pro，确保推理质量"}
                  {modelConfig.preset === "pro" && "深度模式：全程使用 v4-Pro，适合高难度写作任务"}
                </p>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="dlg-effort">推理努力程度</Label>
                <select id="dlg-effort" value={form.effort || "max"}
                  onChange={(e) => updateField("effort", e.target.value)}
                  className="flex h-8 w-full border border-input bg-background px-3 py-2 text-sm">
                  <option value="low">低 — 快速响应，节省 Token</option>
                  <option value="medium">中 — 平衡速度与质量</option>
                  <option value="high">高 — 更深入的推理</option>
                  <option value="max">最高 — 充分发挥模型能力</option>
                </select>
              </div>

              <div className="border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-400 mb-1">
                  <TrendingUp className="h-4 w-4" />缓存优化已激活
                </div>
                <p className="text-sm text-blue-600/80 dark:text-blue-400/80">
                  NovelWeaver 已针对 DeepSeek prefix-cache 优化 System Prompt 结构。
                  不可变前缀（项目设定 + 角色信息）在会话中保持稳定，
                  让缓存命中率可达 90%+，大幅降低重复输入的 Token 消耗。
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
                <div className="p-3 bg-muted">
                  <p className="font-medium text-foreground mb-1">当前模型</p>
                  <p className="font-mono">{modelConfig.modelName}</p>
                </div>
                <div className="p-3 bg-muted">
                  <p className="font-medium text-foreground mb-1">定价参考</p>
                  <p className="font-mono">输入 $0.14/M · 缓存 $0.0028/M · 输出 $0.28/M</p>
                </div>
              </div>
            </CardContent>
          </Card>
          </>
          )}

          {settingsTab === "appearance" && (
          <>
          {/* 主题设置 */}
          <Card>
            <CardHeader>
              <CardTitle>外观设置</CardTitle>
              <CardDescription>选择你喜欢的主题风格</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                {(["light", "dark", "system"] as const).map((t) => (
                  <button key={t} onClick={() => setTheme(t)}
                    className={`flex flex-col items-center gap-2 border-2 p-4 transition-smooth ${
                      mounted && theme === t ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                    }`} suppressHydrationWarning>
                    <span className="text-2xl">{t === "light" ? "☀️" : t === "dark" ? "🌙" : "💻"}</span>
                    <span className="text-sm font-medium">{t === "light" ? "浅色" : t === "dark" ? "深色" : "跟随系统"}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
          </>
          )}

          {settingsTab === "prompts" && (
          <PromptsSection
            promptTemplates={promptTemplates}
            setPromptTemplate={setPromptTemplate}
            resetPromptTemplate={resetPromptTemplate}
            resetAllPromptTemplates={resetAllPromptTemplates}
          />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tab 按钮 ─────────────────────────────────────────────

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-smooth ${
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground/60 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

// ─── 提示词编辑区域 ─────────────────────────────────────

const PROMPT_LABELS: Record<keyof PromptTemplates, { label: string; desc: string }> = {
  contextConstraints: { label: "上下文约束", desc: "注入给所有智能体的通用约束规则，限制编造、编号、角色死亡等行为" },
  complianceRules: { label: "合规规则", desc: "每个智能体运行前注入的实时合规检查规则，含 @mention 限制和写作风格" },
  dispatcher: { label: "调度统领", desc: "任务调度统领的完整提示词模板" },
  writer: { label: "主笔", desc: "创作型智能体——负责故事正文撰写" },
  loreKeeper: { label: "设定监理", desc: "审查型智能体——检查世界观设定一致性" },
  characterAgent: { label: "角色监理", desc: "审查型智能体——验证角色言行与角色卡的一致性" },
  editor: { label: "润色师", desc: "文字润色型智能体——在保持原意和风格的前提下优化文本" },
  customAgentCollaborationRules: { label: "自定义智能体协作规则", desc: "注入到每个自定义智能体的协作流程规则" },
  generateCharacter: { label: "角色生成", desc: "AI 生成新角色时使用的提示词" },
  generateLore: { label: "世界观生成", desc: "AI 生成新世界观词条时使用的提示词" },
  generateProject: { label: "项目信息生成", desc: "AI 生成项目描述和系统提示词时使用的提示词" },
  memoryExtract: { label: "记忆提取", desc: "从故事正文中提取结构化记忆的提示词" },
  groupChatSystem: { label: "群组对话模拟", desc: "群组聊天中模拟多角色对话的系统提示词" },
  chatRoleplay: { label: "聊天角色扮演", desc: "聊天中角色扮演指令" },
  chatOutputSpec: { label: "聊天输出规范", desc: "聊天回复的输出格式规范" },
  autoUpdateAnalysis: { label: "交付台自动更新分析", desc: "分析故事正文提取角色/世界观变更的提示词" },
  autoUpdateSystem: { label: "交付台自动更新系统提示", desc: "自动更新时的 AI 系统角色设定" },
  autoCompleteCharacter: { label: "AI 补全角色", desc: "AI 自动补全角色缺失字段的提示词" },
  autoCompleteLore: { label: "AI 补全世界观", desc: "AI 自动补全世界观词条缺失字段的提示词" },
  optimizeCharacter: { label: "角色 AI 优化", desc: "AI 优化/增强已有角色数据的提示词（optimize-character API）" },
  writingStyle: { label: "写作风格指南", desc: "降低 AI 腔调的写作规范——避免'不是...而是'、减少模糊限定词、用细节代替抽象" },
};

/** 提示词分组配置 */
const PROMPT_GROUPS: { label: string; keys: (keyof PromptTemplates)[] }[] = [
  {
    label: "智能协作 · 通用规则",
    keys: ["contextConstraints", "complianceRules", "customAgentCollaborationRules", "writingStyle"],
  },
  {
    label: "智能协作 · 内置智能体",
    keys: ["dispatcher", "writer", "loreKeeper", "characterAgent", "editor"],
  },
  {
    label: "内容生成（AI Generate）",
    keys: ["generateCharacter", "generateLore", "generateProject"],
  },
  {
    label: "对话系统",
    keys: ["chatRoleplay", "chatOutputSpec", "groupChatSystem"],
  },
  {
    label: "数据提取",
    keys: ["memoryExtract", "autoUpdateAnalysis", "autoUpdateSystem", "autoCompleteCharacter", "autoCompleteLore", "optimizeCharacter"],
  },
];

function PromptsSection({
  promptTemplates,
  setPromptTemplate,
  resetPromptTemplate,
  resetAllPromptTemplates,
}: {
  promptTemplates: PromptTemplates;
  setPromptTemplate: (key: keyof PromptTemplates, value: string) => void;
  resetPromptTemplate: (key: keyof PromptTemplates) => void;
  resetAllPromptTemplates: () => void;
}) {
  const [openSection, setOpenSection] = useState<keyof PromptTemplates | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-medium">提示词模板</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            自定义各智能体的提示词，修改后将在下次协作时生效。含 <code className="text-[10px] bg-muted px-1">${'${var}'}</code> 占位符的模板请保留占位符
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={resetAllPromptTemplates} className="gap-1.5 text-xs shrink-0">
          <RotateCcw className="h-3 w-3" /> 全部重置
        </Button>
      </div>

      <div className="space-y-4">
        {PROMPT_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{group.label}</span>
              <div className="flex-1 border-t border-border/50" />
              <span className="text-[10px] text-muted-foreground/50">{group.keys.length} 项</span>
            </div>
            <div className="space-y-1">
              {group.keys.map((key) => {
                const info = PROMPT_LABELS[key];
                const isOpen = openSection === key;
                return (
                  <div key={key} className="border border-border rounded overflow-hidden">
                    <button
                      onClick={() => setOpenSection(isOpen ? null : key)}
                      className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium text-foreground bg-muted/30 hover:bg-muted transition-colors text-left gap-2"
                    >
                      <span className="truncate min-w-0">{info.label}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-muted-foreground/50 font-normal">{promptTemplates[key].length} 字符</span>
                        <span className={`text-xs text-muted-foreground/50 transition-transform ${isOpen ? "rotate-180" : ""}`}>▼</span>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="p-3 border-t border-border">
                        <p className="text-xs text-muted-foreground/70 mb-2">{info.desc}</p>
                        <Textarea
                          value={promptTemplates[key]}
                          onChange={(e) => setPromptTemplate(key, e.target.value)}
                          rows={Math.min(promptTemplates[key].split("\n").length, 16)}
                          className="text-xs font-mono leading-relaxed resize-y min-h-[80px]"
                        />
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-xs text-muted-foreground">{promptTemplates[key].length} 字符</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs text-muted-foreground"
                            onClick={() => resetPromptTemplate(key)}
                          >
                            <RotateCcw className="h-2.5 w-2.5 mr-1" /> 重置
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
