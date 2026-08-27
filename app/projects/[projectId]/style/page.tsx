// app/projects/[projectId]/style/page.tsx
// 文风档案管理页

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Save, Loader2, FileText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { SharedSubNav } from "@/components/shared-sub-nav";

export default function StylePage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ fingerprint: "", constraints: "", styleGuide: "", sampleText: "" });

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/style-profile`);
      const data = await res.json();
      if (data.success) {
        setForm({
          fingerprint: data.data.fingerprint || "",
          constraints: data.data.constraints || "",
          styleGuide: data.data.styleGuide || "",
          sampleText: data.data.sampleText || "",
        });
      }
    } catch (err) {
      console.error("加载文风档案失败:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/style-profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "文风档案已保存", variant: "success" });
      } else {
        toast({ title: "保存失败", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "保存失败", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SharedSubNav tabs={[
        { label: "角色", href: `/projects/${projectId}/characters` },
        { label: "世界观", href: `/projects/${projectId}/lore` },
        { label: "文风", href: `/projects/${projectId}/style` },
        { label: "记忆", href: `/projects/${projectId}/memory` },
        { label: "错误", href: `/projects/${projectId}/error-archive` },
      ]} />
      <div className="flex-1 space-y-6 p-6 md:p-8 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">文风档案</h2>
          <p className="text-muted-foreground mt-1">定义和约束 AI 的写作风格，保持故事的一致性</p>
        </div>
        <Button onClick={handleSave} disabled={saving || loading} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          保存
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">文风指纹</CardTitle>
              <CardDescription className="text-sm">句式分析、词频统计、节奏特征</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea rows={6} value={form.fingerprint} onChange={(e) => setForm(f => ({ ...f, fingerprint: e.target.value }))} placeholder="分析当前文本的句式特点、常用词汇、段落节奏等..." className="text-sm" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">文风约束</CardTitle>
              <CardDescription className="text-sm">明确禁止或避免的写法</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea rows={6} value={form.constraints} onChange={(e) => setForm(f => ({ ...f, constraints: e.target.value }))} placeholder="如：避免使用过多的成语、不要使用现代网络用语、对话要简洁有力..." className="text-sm" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">风格指南</CardTitle>
              <CardDescription className="text-sm">推荐的句式和写作方向</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea rows={6} value={form.styleGuide} onChange={(e) => setForm(f => ({ ...f, styleGuide: e.target.value }))} placeholder="如：多用短句营造紧张感、环境描写要有画面感、对话要体现人物性格..." className="text-sm" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">参考文本</CardTitle>
              <CardDescription className="text-sm">用于 AI 学习风格的代表性段落</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea rows={6} value={form.sampleText} onChange={(e) => setForm(f => ({ ...f, sampleText: e.target.value }))} placeholder="粘贴一段最能代表目标风格的文本，AI 将以此作为风格参考..." className="text-sm" />
            </CardContent>
          </Card>
        </div>
      )}
    </div></>
  );
}
