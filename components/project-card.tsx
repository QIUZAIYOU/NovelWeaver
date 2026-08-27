// components/project-card.tsx
// 项目卡片 — 首页项目列表中的单个项目

"use client";

import React from "react";
import Link from "next/link";
import {
  Sparkles, Swords, Users, Globe, Brain, Clock, Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/utils";

interface ProjectCardProps {
  project: {
    id: string;
    name: string;
    type: string;
    description: string | null;
    updatedAt: string;
    _count: {
      characters: number;
      loreEntries: number;
      memories: number;
    };
  };
  onDelete: (id: string) => void;
  /** 入场动画延迟 (ms) */
  animationDelay?: number;
}

export function ProjectCard({ project, onDelete, animationDelay = 0 }: ProjectCardProps) {
  const isTRPG = project.type === "trpg";

  return (
    <Link
      href={`/projects/${project.id}/workspace`}
      className="block animate-fade-up"
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      <Card className="h-full group hover:shadow-lg hover:border-primary/30 hover:translate-y-[-2px] transition-shadow duration-300 cursor-pointer overflow-hidden">
        {/* 顶部色条 */}
        <div className={`h-1 ${isTRPG ? "bg-orange-500" : "bg-primary"}`} />

        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`flex items-center justify-center w-9 h-9 ${
                isTRPG ? "bg-orange-100 dark:bg-orange-900/30" : "bg-primary/10"
              }`}>
                {isTRPG ? (
                  <Swords className="h-4 w-4 text-orange-500" />
                ) : (
                  <Sparkles className="h-4 w-4 text-primary" />
                )}
              </div>
              <div className="min-w-0">
                <CardTitle className="text-sm font-semibold truncate group-hover:text-primary transition-colors">
                  {project.name}
                </CardTitle>
                <Badge variant="secondary" className="mt-0.5 text-[10px] h-4 px-1.5">
                  {isTRPG ? "跑团" : "小说"}
                </Badge>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity -mr-1 -mt-1"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(project.id); }}
              aria-label="删除项目"
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive transition-colors" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-0 space-y-3">
          {project.description && (
            <p className="text-xs text-muted-foreground/70 leading-relaxed line-clamp-2">
              {project.description}
            </p>
          )}

          {/* 统计行 */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground/60 tabular-nums">
            <span className="flex items-center gap-1" title="角色">
              <Users className="h-3 w-3" />
              {project._count.characters}
            </span>
            <span className="flex items-center gap-1" title="设定词条">
              <Globe className="h-3 w-3" />
              {project._count.loreEntries}
            </span>
            <span className="flex items-center gap-1" title="记忆">
              <Brain className="h-3 w-3" />
              {project._count.memories}
            </span>
            <span className="flex items-center gap-1 ml-auto" title="更新时间">
              <Clock className="h-3 w-3" />
              {formatRelativeTime(project.updatedAt)}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
