// stores/app-store.ts
// 全局应用状态管理 - Zustand

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** 通知条目 */
export interface Notification {
  id: string;
  type: "success" | "error" | "info" | "warning";
  title: string;
  description?: string;
  timestamp: number;
  read: boolean;
}

interface AppState {
  /** 侧边栏是否展开 */
  sidebarOpen: boolean;
  /** 当前选中的项目 ID（持久化，用于侧边栏导航） */
  currentProjectId: string | null;
  /** 当前项目类型 */
  currentProjectType: string | null;
  /** 当前项目名称 */
  currentProjectName: string | null;
  /** 移动端侧边栏是否打开 */
  mobileSidebarOpen: boolean;
  /** 设置弹窗是否打开 */
  settingsOpen: boolean;
  /** 通知抽屉是否打开 */
  notificationOpen: boolean;
  /** 通知列表 */
  notifications: Notification[];

  // 操作
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setCurrentProjectId: (id: string | null) => void;
  setCurrentProjectType: (type: string | null) => void;
  setCurrentProjectName: (name: string | null) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setNotificationOpen: (open: boolean) => void;
  addNotification: (n: Omit<Notification, "id" | "timestamp" | "read">) => void;
  markNotificationRead: (id: string) => void;
  clearAllNotifications: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      currentProjectId: null,
      currentProjectType: null,
      currentProjectName: null,
      mobileSidebarOpen: false,
      settingsOpen: false,
      notificationOpen: false,
      notifications: [],

      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setCurrentProjectId: (id) => set({ currentProjectId: id }),
      setCurrentProjectType: (type) => set({ currentProjectType: type }),
      setCurrentProjectName: (name) => set({ currentProjectName: name }),
      setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
      setSettingsOpen: (open) => set({ settingsOpen: open }),
      setNotificationOpen: (open) => set({ notificationOpen: open }),
      addNotification: (n) =>
        set((state) => ({
          notifications: [
            {
              id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
              timestamp: Date.now(),
              read: false,
              ...n,
            },
            ...state.notifications,
          ].slice(0, 100), // 最多保留 100 条
        })),
      markNotificationRead: (id) =>
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        })),
      clearAllNotifications: () => set({ notifications: [] }),
    }),
    {
      name: "novelweaver-app", // localStorage key
    }
  )
);
