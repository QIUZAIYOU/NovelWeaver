// app/projects/[projectId]/graph/page.tsx
// 关系图谱 - 力导向图可视化项目知识关联

"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import * as d3 from "d3";
import { Search, ZoomIn, ZoomOut, RotateCcw, Loader2, Filter, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ============================================================
// 类型定义
// ============================================================

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  type: "character" | "lore" | "memory" | "outline" | "worldstate";
  group: string;
  subtitle?: string;
  link?: string;
  entityId?: string;
  /** 搜索匹配标记 */
  _searchMatch?: boolean;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  type: "tag" | "mention" | "hierarchy" | "keyword";
  strength: number;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  stats: { totalNodes: number; totalLinks: number; byType: Record<string, number> };
}

// ============================================================
// 样式配置
// ============================================================

const TYPE_STYLES: Record<string, { color: string; radius: number }> = {
  character: { color: "#3b82f6", radius: 18 },
  lore: { color: "#10b981", radius: 16 },
  memory: { color: "#f59e0b", radius: 12 },
  outline: { color: "#8b5cf6", radius: 15 },
  worldstate: { color: "#ec4899", radius: 14 },
};

const LINK_COLORS: Record<string, string> = {
  tag: "rgba(59,130,246,0.3)",
  mention: "rgba(16,185,129,0.2)",
  hierarchy: "rgba(139,92,246,0.4)",
  keyword: "rgba(236,72,153,0.2)",
};

// ============================================================
// 页面组件
// ============================================================

export default function GraphPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [pinned, setPinned] = useState(false);
  // 选中节点信息（用于底部浮窗）—— 唯一触发 React 重渲染的 state
  const [selectedInfo, setSelectedInfo] = useState<GraphNode | null>(null);

  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const hoveredIdRef = useRef<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const redrawCounter = useRef(0);

  // ============================================================
  // 加载数据
  // ============================================================

  const loadGraph = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/graph`);
      const d = await res.json();
      if (d.success) setGraphData(d.data);
    } catch (err) {
      console.error("加载关系图谱失败:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  // ============================================================
  // D3 力导向图渲染（仅随 graphData/typeFilter/searchQuery 变化重绘）
  // ============================================================

  useEffect(() => {
    if (!graphData || !svgRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    if (width <= 0 || height <= 0) return;

    // 重置 ref 状态
    hoveredIdRef.current = null;
    selectedIdRef.current = null;
    setSelectedInfo(null);

    // --- 数据过滤 ---

    let filteredNodes = graphData.nodes;
    let filteredLinks = graphData.links;

    if (typeFilter !== "all") {
      const typeSet = new Set(graphData.nodes.filter((n) => n.type === typeFilter).map((n) => n.id));
      filteredNodes = graphData.nodes.filter((n) => typeSet.has(n.id));
      filteredLinks = graphData.links.filter((l) => {
        const sid = String(typeof l.source === "object" ? (l.source as GraphNode).id : l.source);
        const tid = String(typeof l.target === "object" ? (l.target as GraphNode).id : l.target);
        return typeSet.has(sid) && typeSet.has(tid);
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchedIds = new Set(
        filteredNodes.filter((n) => n.label.toLowerCase().includes(q) || (n.subtitle || "").toLowerCase().includes(q)).map((n) => n.id)
      );
      const connectedIds = new Set(matchedIds);
      for (const link of filteredLinks) {
        const sid = String(typeof link.source === "object" ? (link.source as GraphNode).id : link.source);
        const tid = String(typeof link.target === "object" ? (link.target as GraphNode).id : link.target);
        if (matchedIds.has(sid)) connectedIds.add(tid);
        if (matchedIds.has(tid)) connectedIds.add(sid);
      }
      filteredNodes = filteredNodes.filter((n) => connectedIds.has(n.id));
      filteredLinks = filteredLinks.filter((l) => {
        const sid = String(typeof l.source === "object" ? (l.source as GraphNode).id : l.source);
        const tid = String(typeof l.target === "object" ? (l.target as GraphNode).id : l.target);
        return connectedIds.has(sid) && connectedIds.has(tid);
      });

      // 标记搜索匹配
      const matchSet = matchedIds;
      filteredNodes.forEach((n) => {
        n._searchMatch = matchSet.has(n.id);
      });
    }

    // --- 构建 D3 图 ---

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const links = filteredLinks.map((l) => ({
      ...l,
      source: typeof l.source === "object" ? (l.source as GraphNode).id : l.source,
      target: typeof l.target === "object" ? (l.target as GraphNode).id : l.target,
    })) as GraphLink[];

    const simulation = d3
      .forceSimulation(filteredNodes)
      .force("link", d3.forceLink<GraphNode, GraphLink>(links).id((d) => d.id).distance(80))
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius((d) => (TYPE_STYLES[(d as GraphNode).type]?.radius || 12) + 5));

    simulationRef.current = simulation;

    // 主绘图组
    const g = svg.append("g");

    // 缩放 (绑定在 SVG 上，但只响应空白区域)
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 3])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });
    zoomRef.current = zoom;
    svg.call(zoom);

    // 双击重置 zoom
    svg.on("dblclick.zoom", null);
    svg.on("dblclick", () => {
      selectedIdRef.current = null;
      setSelectedInfo(null);
      resetHighlight();
      svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
    });

    // 点击背景重置选中 + 悬停态
    svg.on("click", (event) => {
      if (event.target === svgRef.current || event.target === g.node()) {
        selectedIdRef.current = null;
        setSelectedInfo(null);
        resetHighlight();
      }
    });

    // --- 边 ---
    const linkGroup = g.append("g").selectAll("line").data(links).join("line")
      .attr("stroke", (l) => LINK_COLORS[l.type] || "rgba(0,0,0,0.1)")
      .attr("stroke-width", (l) => Math.max(1, l.strength * 0.5))
      .attr("stroke-dasharray", (l) => (l.type === "mention" ? "4,2" : l.type === "keyword" ? "2,2" : "none"))
      .attr("opacity", 0.3);

    // --- 节点组 ---
    const nodeGroup = g.append("g").selectAll("g").data(filteredNodes).join("g")
      .attr("cursor", "pointer") as unknown as d3.Selection<SVGGElement, GraphNode, SVGGElement, unknown>;

    // 圆形
    nodeGroup.append("circle")
      .attr("r", (d) => (d._searchMatch ? (TYPE_STYLES[d.type]?.radius || 12) + 6 : TYPE_STYLES[d.type]?.radius || 12))
      .attr("fill", (d) => TYPE_STYLES[d.type]?.color || "#666")
      .attr("stroke", (d) => d._searchMatch ? "#fff" : "rgba(255,255,255,0.3)")
      .attr("stroke-width", (d) => d._searchMatch ? 3 : 1);

    // 标签
    nodeGroup.append("text")
      .text((d) => d.label)
      .attr("dy", (d) => (TYPE_STYLES[d.type]?.radius || 12) + 14)
      .attr("text-anchor", "middle")
      .attr("font-size", "10px")
      .attr("fill", "currentColor")
      .attr("pointer-events", "none")
      .attr("opacity", 0.7)
      .style("font-weight", (d) => d._searchMatch ? "bold" : "normal");

    // --- D3 事件（不触发 React 重渲染） ---

    // 拖拽
    const drag = d3.drag<SVGGElement, GraphNode>()
      .on("start", (event, d) => {
        if (!event.active && !pinned) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active && !pinned) simulation.alphaTarget(0);
        if (!pinned) { d.fx = null; d.fy = null; }
        else { d.fx = d.x; d.fy = d.y; }
      });
    nodeGroup.call(drag);

    // 悬停高亮（纯 D3 操作，不涉及 React state）
    nodeGroup.on("mouseenter", function (event, d) {
      hoveredIdRef.current = d.id;

      linkGroup.attr("opacity", (l) => {
        const sid = String(typeof l.source === "object" ? (l.source as GraphNode).id : l.source);
        const tid = String(typeof l.target === "object" ? (l.target as GraphNode).id : l.target);
        return (sid === d.id || tid === d.id) ? 0.7 : 0.05;
      });
      nodeGroup.selectAll<SVGCircleElement, GraphNode>("circle").attr("opacity", (n: GraphNode) => {
        if (n.id === d.id) return 1;
        const connected = links.some((l) => {
          const sid = String(typeof l.source === "object" ? (l.source as GraphNode).id : l.source);
          const tid = String(typeof l.target === "object" ? (l.target as GraphNode).id : l.target);
          return (sid === n.id && tid === d.id) || (sid === d.id && tid === n.id);
        });
        return connected ? 0.9 : 0.15;
      });
      nodeGroup.selectAll<SVGTextElement, GraphNode>("text").attr("opacity", (n: GraphNode) => {
        if (n.id === d.id) return 1;
        const connected = links.some((l) => {
          const sid = String(typeof l.source === "object" ? (l.source as GraphNode).id : l.source);
          const tid = String(typeof l.target === "object" ? (l.target as GraphNode).id : l.target);
          return (sid === n.id && tid === d.id) || (sid === d.id && tid === n.id);
        });
        return connected ? 0.9 : 0.15;
      });
    });

    // 重置高亮状态
    const resetHighlight = () => {
      hoveredIdRef.current = null;
      linkGroup.attr("opacity", 0.3);
      nodeGroup.selectAll("circle").attr("opacity", 0.9);
      nodeGroup.selectAll("text").attr("opacity", 0.7);
    };

    nodeGroup.on("mouseleave", resetHighlight);

    // 点击选中（仅更新 selectedInfo 用于 UI 浮窗）
    nodeGroup.on("click", (event, d) => {
      event.stopPropagation();
      if (selectedIdRef.current === d.id) {
        selectedIdRef.current = null;
        setSelectedInfo(null);
      } else {
        selectedIdRef.current = d.id;
        setSelectedInfo(d);
      }
    });

    // --- 物理模拟更新 ---
    simulation.on("tick", () => {
      linkGroup
        .attr("x1", (d) => (d.source as GraphNode).x!)
        .attr("y1", (d) => (d.source as GraphNode).y!)
        .attr("x2", (d) => (d.target as GraphNode).x!)
        .attr("y2", (d) => (d.target as GraphNode).y!);
      nodeGroup.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [graphData, typeFilter, searchQuery, pinned]);

  // ============================================================
  // 缩放控制（不触发重渲染）
  // ============================================================

  const handleZoomIn = () => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).transition().duration(200).call(zoomRef.current.scaleBy, 1.3);
  };

  const handleZoomOut = () => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).transition().duration(200).call(zoomRef.current.scaleBy, 0.7);
  };

  const handleReset = () => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).transition().duration(400).call(zoomRef.current.transform, d3.zoomIdentity);
    setPinned(false);
    selectedIdRef.current = null;
    setSelectedInfo(null);
    if (simulationRef.current) simulationRef.current.alpha(0.3).restart();
  };

  // ============================================================
  // 选中节点跳转
  // ============================================================

  const handleNodeNavigate = () => {
    if (!selectedInfo?.link) return;
    const base = `/projects/${projectId}/${selectedInfo.link}`;
    const url = selectedInfo.entityId
      ? `${base}?highlight=${selectedInfo.entityId}`
      : base;
    router.push(url);
  };

  // ============================================================
  // 渲染
  // ============================================================

  const typeOptions = [
    { value: "all", label: "全部" },
    { value: "character", label: "角色" },
    { value: "lore", label: "知识库" },
    { value: "memory", label: "记忆" },
    { value: "outline", label: "大纲" },
    { value: "worldstate", label: "状态" },
  ];

  return (
    <div className="flex-1 flex flex-col h-full select-none">
      {/* 顶部工具栏 */}
      <div className="flex items-center gap-2 p-3 border-b border-border bg-background/95 backdrop-blur shrink-0">
        <h2 className="text-sm font-semibold mr-2 shrink-0">关系图谱</h2>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="搜索节点…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto">
          <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          {typeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTypeFilter(opt.value)}
              className={cn(
                "px-2 py-1 text-sm rounded transition-smooth shrink-0",
                typeFilter === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="border-l border-border pl-2 flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomIn} title="放大" aria-label="放大">
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomOut} title="缩小" aria-label="缩小">
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleReset} title="重置视图" aria-label="重置视图">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={pinned ? "default" : "ghost"}
            size="sm"
            className="h-7 text-sm gap-1"
            onClick={() => setPinned(!pinned)}
          >
            {pinned ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            <span className="hidden sm:inline">{pinned ? "固定" : "浮动"}</span>
          </Button>
        </div>

        {graphData && (
          <span className="text-sm text-muted-foreground ml-2 hidden lg:block shrink-0">
            {graphData.stats.totalNodes} 节点 · {graphData.stats.totalLinks} 连接
          </span>
        )}
      </div>

      {/* 关系图谱画布 */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden bg-card/5">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">构建关系图谱…</p>
            </div>
          </div>
        ) : !graphData || graphData.nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">暂无数据来构建关系图谱</p>
              <p className="text-sm text-muted-foreground/60 mt-1">添加角色、知识库词条和记忆后自动生成关联</p>
            </div>
          </div>
        ) : (
          <svg ref={svgRef} width="100%" height="100%" className="cursor-grab active:cursor-grabbing" />
        )}

        {/* 选中节点详情浮窗 - 不挡画布交互 */}
        {selectedInfo && (
          <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-72 pointer-events-auto">
            <Card className="shadow-lg">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: TYPE_STYLES[selectedInfo.type]?.color || "#666" }}
                  />
                  <span className="text-sm font-medium">{selectedInfo.group}</span>
                  <Badge variant="secondary" className="text-sm ml-auto">
                    {selectedInfo.type}
                  </Badge>
                  <button
                    className="text-muted-foreground hover:text-foreground text-sm ml-1"
                    onClick={() => { selectedIdRef.current = null; setSelectedInfo(null); }}
                    aria-label="关闭"
                  >
                    ✕
                  </button>
                </div>
                <p className="text-sm font-semibold truncate">{selectedInfo.label}</p>
                {selectedInfo.subtitle && (
                  <p className="text-sm text-muted-foreground truncate">{selectedInfo.subtitle}</p>
                )}
                {selectedInfo.link && (
                  <Button variant="outline" size="sm" className="mt-2 h-7 text-sm w-full" onClick={handleNodeNavigate}>
                    前往查看
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* 图例 */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-t border-border bg-background/80 text-sm text-muted-foreground shrink-0 overflow-x-auto">
        {Object.entries(TYPE_STYLES).map(([type, style]) => (
          <div key={type} className="flex items-center gap-1.5 shrink-0">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: style.color }} />
            <span>{typeOptions.find((o) => o.value === type)?.label || type}</span>
          </div>
        ))}
        <span className="ml-auto hidden sm:block">拖拽移动 · 滚轮缩放 · 悬停高亮关联 · 双击重置</span>
      </div>
    </div>
  );
}
