// lib/ai/agent-hooks.ts
// 服务端 Hook 系统 — 类似 crewAI 的 step_callback / task_callback，基于 EventEmitter

import { EventEmitter } from "events";

// ============================================================
// 事件数据类型
// ============================================================

export interface HookStepData {
  agentId: string;
  name: string;
  emoji: string;
  role?: string;
  output: string;
  time: number;
  iteration: number;
  status: string;
}

export interface HookFlowData {
  steps: HookStepData[];
  iterations: number;
  totalTime: number;
  isComplete: boolean;
  usage?: { inputTokens: number; outputTokens: number; cachedTokens: number; cost: number };
  projectId?: string;
}

export interface HookErrorData {
  error: string;
  details?: string;
  projectId?: string;
}

export interface HookStreamData {
  agentId: string;
  name: string;
  output: string;
  time: number;
  status: string;
}

// ============================================================
// Hook 事件名称
// ============================================================

export const HOOK_EVENTS = {
  STEP_START: "step-start",
  STEP_DONE: "step-done",
  STEP_FAILED: "step-failed",
  STEP_STREAM: "step-stream",
  FLOW_DONE: "flow-done",
  FLOW_ERROR: "flow-error",
  REVISION_LOOP: "revision-loop",
} as const;

export type HookEvent = (typeof HOOK_EVENTS)[keyof typeof HOOK_EVENTS];

// ============================================================
// Webhook 配置
// ============================================================

interface WebhookEntry {
  url: string;
  events: HookEvent[];
  headers?: Record<string, string>;
}

// ============================================================
// 预设插件类型
// ============================================================

export interface AgentPlugin {
  name: string;
  onStepStart?: (data: HookStepData) => void | Promise<void>;
  onStepDone?: (data: HookStepData) => void | Promise<void>;
  onStepFailed?: (data: HookStepData & { error: string }) => void | Promise<void>;
  onStepStream?: (data: HookStreamData) => void | Promise<void>;
  onFlowDone?: (data: HookFlowData) => void | Promise<void>;
  onFlowError?: (data: HookErrorData) => void | Promise<void>;
  onRevisionLoop?: (data: { reviewer: string; writer: string; feedback: string }) => void | Promise<void>;
}

// ============================================================
// AgentHooks 主类
// ============================================================

export class AgentHooks {
  private emitter = new EventEmitter();
  private webhooks: WebhookEntry[] = [];
  private plugins: AgentPlugin[] = [];
  private maxListeners = 20;

  constructor() {
    this.emitter.setMaxListeners(this.maxListeners);
  }

  // ── 注册 webhook ──

  addWebhook(url: string, events: HookEvent[], headers?: Record<string, string>) {
    this.webhooks.push({ url, events, headers });
  }

  // ── 注册插件 ──

  addPlugin(plugin: AgentPlugin) {
    this.plugins.push(plugin);
    // 自动绑定插件方法到事件
    for (const [eventName, method] of Object.entries(plugin)) {
      if (eventName === "name") continue;
      const hookEvent = (HOOK_EVENTS as Record<string, string>)[
        eventName.replace(/^on/, "").replace(/([A-Z])/g, "-$1").toLowerCase()
      ];
      if (hookEvent && typeof method === "function") {
        this.emitter.on(hookEvent, method.bind(plugin));
      }
    }
  }

  // ── 触发事件 ──

  emit(event: HookEvent, data: unknown): void {
    // 1. 本地监听器
    this.emitter.emit(event, data);

    // 2. 插件监听器（已通过 addPlugin 绑定）
    // 3. Webhook（异步发送，不阻塞）
    const matchingWebhooks = this.webhooks.filter(w => w.events.includes(event));
    for (const wh of matchingWebhooks) {
      this.sendWebhook(wh, event, data).catch(() => {
        // webhook 失败不阻塞主流程
      });
    }
  }

  private async sendWebhook(wh: WebhookEntry, event: string, data: unknown) {
    try {
      await fetch(wh.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...wh.headers,
        },
        body: JSON.stringify({ event, data, timestamp: new Date().toISOString() }),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // webhook 超时或失败不抛出
    }
  }

  // ── 便捷触发方法 ──

  emitStepStart(step: HookStepData) {
    this.emit(HOOK_EVENTS.STEP_START, step);
  }

  emitStepDone(step: HookStepData) {
    this.emit(HOOK_EVENTS.STEP_DONE, step);
  }

  emitStepFailed(step: HookStepData, error: string) {
    this.emit(HOOK_EVENTS.STEP_FAILED, { ...step, error });
  }

  emitStepStream(data: HookStreamData) {
    this.emit(HOOK_EVENTS.STEP_STREAM, data);
  }

  emitFlowDone(data: HookFlowData) {
    this.emit(HOOK_EVENTS.FLOW_DONE, data);
  }

  emitFlowError(data: HookErrorData) {
    this.emit(HOOK_EVENTS.FLOW_ERROR, data);
  }

  emitRevisionLoop(reviewer: string, writer: string, feedback: string) {
    this.emit(HOOK_EVENTS.REVISION_LOOP, { reviewer, writer, feedback });
  }
}

// ============================================================
// 内置预设插件
// ============================================================

/** 控制台日志插件 — 调试用 */
export const consoleLoggerPlugin: AgentPlugin = {
  name: "console-logger",
  onStepStart: (data) => {
    console.log(`[Hook] 开始: ${data.name} (轮次 #${data.iteration})`);
  },
  onStepDone: (data) => {
    console.log(`[Hook] 完成: ${data.name} (${(data.time / 1000).toFixed(1)}s, ${data.output.length}字符)`);
  },
  onStepFailed: (data) => {
    console.error(`[Hook] 失败: ${data.name}: ${data.error}`);
  },
  onFlowDone: (data) => {
    console.log(`[Hook] 流程完成: ${data.steps.length}步, ${(data.totalTime / 1000).toFixed(1)}s`);
  },
  onFlowError: (data) => {
    console.error(`[Hook] 流程错误: ${data.error}`);
  },
};

export function createAgentHooks(config?: {
  webhooks?: { url: string; events: HookEvent[] }[];
  plugins?: AgentPlugin[];
}): AgentHooks {
  const hooks = new AgentHooks();
  if (config?.plugins) {
    for (const p of config.plugins) hooks.addPlugin(p);
  }
  if (config?.webhooks) {
    for (const w of config.webhooks) hooks.addWebhook(w.url, w.events);
  }
  return hooks;
}
