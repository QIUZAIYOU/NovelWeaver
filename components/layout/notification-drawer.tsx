// components/layout/notification-drawer.tsx
// 通知抽屉 — 右侧滑出，显示系统消息列表

"use client";

import React from "react";
import { X, Bell, CheckCircle2, AlertCircle, AlertTriangle, Info, Trash2 } from "lucide-react";
import { useAppStore, type Notification } from "@/stores/app-store";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/utils";

const TYPE_ICONS: Record<Notification["type"], React.ElementType> = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const TYPE_COLORS: Record<Notification["type"], string> = {
  success: "text-[#00cc66]",
  error: "text-[#ff4444]",
  warning: "text-[#ff8800]",
  info: "text-[#4488ff]",
};

export function NotificationDrawer() {
  const { notificationOpen, setNotificationOpen, notifications, markNotificationRead, clearAllNotifications } = useAppStore();
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <>
      {/* 遮罩层 */}
      {notificationOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => setNotificationOpen(false)}
        />
      )}

      {/* 抽屉面板 */}
      <div
        className={cn(
          "fixed top-0 right-0 z-50 h-full w-80 bg-card border-l border-border shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col",
          notificationOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-foreground" />
            <span className="text-sm font-medium">通知</span>
            {unreadCount > 0 && (
              <span className="text-[10px] font-mono bg-primary text-primary-foreground px-1.5">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {notifications.length > 0 && (
              <button
                className="h-6 w-6 flex items-center justify-center text-muted-foreground/60 hover:text-destructive transition-colors"
                onClick={clearAllNotifications}
                title="清除全部"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              className="h-6 w-6 flex items-center justify-center text-muted-foreground/60 hover:text-foreground transition-colors"
              onClick={() => setNotificationOpen(false)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Bell className="h-10 w-10 text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground/60">暂无通知</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {notifications.map((n) => {
                const Icon = TYPE_ICONS[n.type];
                const color = TYPE_COLORS[n.type];
                return (
                  <button
                    key={n.id}
                    onClick={() => markNotificationRead(n.id)}
                    className={cn(
                      "w-full text-left px-4 py-3 transition-colors hover:bg-muted/30",
                      !n.read && "bg-primary/[0.02]",
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", color)} />
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-sm", !n.read ? "text-foreground" : "text-muted-foreground")}>
                          {n.title}
                        </p>
                        {n.description && (
                          <p className="text-xs text-muted-foreground/70 mt-0.5 line-clamp-2">
                            {n.description}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground/50 mt-1">
                          {formatRelativeTime(new Date(n.timestamp))}
                        </p>
                      </div>
                      {!n.read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
