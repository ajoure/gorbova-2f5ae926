import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Users, ChevronRight, ChevronDown, BookOpen, Eye, ArrowDownAZ, ArrowDown01, FolderOpen } from "lucide-react";
import { LessonViewersModal } from "./LessonViewersModal";
import { cn } from "@/lib/utils";
import type { TrainingModule } from "@/hooks/useTrainingModules";

interface ProgressTabContentProps {
  modules: TrainingModule[];
}

interface LessonWithProgress {
  id: string;
  title: string;
  module_id: string;
  completion_mode: string | null;
  sort_order: number;
  created_at: string;
  studentCount: number;
  completedCount: number;
}

type SortMode = "order" | "alpha";

// Recursive tree node for modules
interface ModuleTreeNode {
  module: TrainingModule;
  children: ModuleTreeNode[];
  lessons: LessonWithProgress[];
}

function buildTree(
  modules: TrainingModule[],
  lessons: LessonWithProgress[],
  sortMode: SortMode
): ModuleTreeNode[] {
  const lessonsByModule = new Map<string, LessonWithProgress[]>();
  for (const lesson of lessons) {
    const arr = lessonsByModule.get(lesson.module_id) || [];
    arr.push(lesson);
    lessonsByModule.set(lesson.module_id, arr);
  }

  const moduleMap = new Map(modules.map((m) => [m.id, m]));
  const childrenMap = new Map<string | null, TrainingModule[]>();

  for (const m of modules) {
    const parentKey = m.parent_module_id || null;
    const arr = childrenMap.get(parentKey) || [];
    arr.push(m);
    childrenMap.set(parentKey, arr);
  }

  const sortModules = (list: TrainingModule[]) => {
    if (sortMode === "alpha") {
      return [...list].sort((a, b) => a.title.localeCompare(b.title, "ru"));
    }
    // "order" — sort_order, fallback created_at
    return [...list].sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.created_at.localeCompare(b.created_at);
    });
  };

  const sortLessons = (list: LessonWithProgress[]) => {
    if (sortMode === "alpha") {
      return [...list].sort((a, b) => a.title.localeCompare(b.title, "ru"));
    }
    return [...list].sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.created_at.localeCompare(b.created_at);
    });
  };

  const buildNode = (parentId: string | null): ModuleTreeNode[] => {
    const children = childrenMap.get(parentId) || [];
    return sortModules(children).map((m) => ({
      module: m,
      children: buildNode(m.id),
      lessons: sortLessons(lessonsByModule.get(m.id) || []),
    }));
  };

  return buildNode(null);
}

// Recursive component for rendering module tree
function ModuleNode({
  node,
  depth,
  onLessonClick,
}: {
  node: ModuleTreeNode;
  depth: number;
  onLessonClick: (lesson: LessonWithProgress) => void;
}) {
  const hasContent = node.children.length > 0 || node.lessons.length > 0;
  const [isOpen, setIsOpen] = useState(depth === 0); // Root modules open by default

  const totalStudents = node.lessons.reduce((s, l) => s + l.studentCount, 0);
  const totalCompleted = node.lessons.reduce((s, l) => s + l.completedCount, 0);

  if (!hasContent) {
    return (
      <div className={cn("flex items-center gap-2 py-2 text-sm text-muted-foreground", depth > 0 && "ml-4")}>
        <FolderOpen className="h-4 w-4" />
        <span>{node.module.title}</span>
        <span className="text-xs">(пусто)</span>
      </div>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button
          className={cn(
            "w-full flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-muted/50 transition-colors text-left",
            depth > 0 && "ml-4"
          )}
        >
          {isOpen ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
          <span className="font-medium text-sm flex-1 truncate">{node.module.title}</span>
          <div className="flex items-center gap-2 shrink-0">
            {totalStudents > 0 && (
              <Badge variant="secondary" className="text-[10px] font-normal">
                <Users className="h-3 w-3 mr-0.5" />
                {totalStudents}
              </Badge>
            )}
            {totalCompleted > 0 && (
              <Badge variant="default" className="text-[10px] font-normal">
                ✓ {totalCompleted}
              </Badge>
            )}
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className={cn("space-y-1", depth === 0 ? "ml-2" : "ml-6")}>
          {/* Submodules */}
          {node.children.map((child) => (
            <ModuleNode
              key={child.module.id}
              node={child}
              depth={depth + 1}
              onLessonClick={onLessonClick}
            />
          ))}
          {/* Lessons */}
          {node.lessons.map((lesson) => (
            <Card
              key={lesson.id}
              className="group hover:shadow-md transition-all cursor-pointer"
              onClick={() => onLessonClick(lesson)}
            >
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    {lesson.completion_mode === "kvest" ? (
                      <BookOpen className="h-4 w-4 text-primary" />
                    ) : (
                      <Eye className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium text-sm">{lesson.title}</h4>
                    <Badge
                      variant={lesson.completion_mode === "kvest" ? "default" : "secondary"}
                      className="text-[10px] px-1.5 py-0 mt-0.5"
                    >
                      {lesson.completion_mode === "kvest" ? "Квест" : "Обычный"}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="secondary" className="font-normal text-xs">
                      <Users className="h-3 w-3 mr-0.5" />
                      {lesson.studentCount}
                    </Badge>
                    <Badge variant="default" className="font-normal text-xs">
                      ✓ {lesson.completedCount}
                    </Badge>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ProgressTabContent({ modules }: ProgressTabContentProps) {
  const navigate = useNavigate();
  const [viewerModal, setViewerModal] = useState<{ lessonId: string; title: string } | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    return (localStorage.getItem("training_progress_sort_mode") as SortMode) || "order";
  });

  const moduleIds = modules.map((m) => m.id);

  const { data: allLessons, isLoading } = useQuery({
    queryKey: ["all-lessons-progress", moduleIds],
    queryFn: async () => {
      if (moduleIds.length === 0) return [];

      const { data: lessons, error } = await supabase
        .from("training_lessons")
        .select("id, title, module_id, completion_mode, sort_order, created_at")
        .in("module_id", moduleIds)
        .order("sort_order");

      if (error) throw error;

      const lessonIds = lessons?.map((l) => l.id) || [];
      if (lessonIds.length === 0) return [];

      const kvestLessonIds = lessons?.filter((l) => l.completion_mode === "kvest").map((l) => l.id) || [];
      const normalLessonIds = lessons?.filter((l) => l.completion_mode !== "kvest").map((l) => l.id) || [];

      const kvestProgressMap = new Map<string, { total: number; completed: number }>();
      const normalProgressMap = new Map<string, { total: number; completed: number }>();

      if (kvestLessonIds.length > 0) {
        const { data: kvestData } = await supabase
          .from("lesson_progress_state")
          .select("lesson_id, completed_at")
          .in("lesson_id", kvestLessonIds);

        kvestData?.forEach((p) => {
          const current = kvestProgressMap.get(p.lesson_id) || { total: 0, completed: 0 };
          current.total++;
          if (p.completed_at) current.completed++;
          kvestProgressMap.set(p.lesson_id, current);
        });
      }

      if (normalLessonIds.length > 0) {
        const { data: normalData } = await supabase
          .from("lesson_progress")
          .select("lesson_id, completed_at")
          .in("lesson_id", normalLessonIds);

        normalData?.forEach((p) => {
          const current = normalProgressMap.get(p.lesson_id) || { total: 0, completed: 0 };
          current.total++;
          if (p.completed_at) current.completed++;
          normalProgressMap.set(p.lesson_id, current);
        });
      }

      return lessons?.map((lesson) => {
        const isKvest = lesson.completion_mode === "kvest";
        const progressMap = isKvest ? kvestProgressMap : normalProgressMap;
        return {
          id: lesson.id,
          title: lesson.title,
          module_id: lesson.module_id,
          completion_mode: lesson.completion_mode,
          sort_order: lesson.sort_order ?? 0,
          created_at: lesson.created_at,
          studentCount: progressMap.get(lesson.id)?.total || 0,
          completedCount: progressMap.get(lesson.id)?.completed || 0,
        } as LessonWithProgress;
      }) || [];
    },
    enabled: moduleIds.length > 0,
  });

  const tree = useMemo(() => {
    if (!allLessons) return [];
    return buildTree(modules, allLessons, sortMode);
  }, [modules, allLessons, sortMode]);

  const handleSortToggle = () => {
    const next = sortMode === "order" ? "alpha" : "order";
    setSortMode(next);
    localStorage.setItem("training_progress_sort_mode", next);
  };

  const handleLessonClick = (lesson: LessonWithProgress) => {
    if (lesson.completion_mode === "kvest") {
      navigate(`/admin/training-lessons/${lesson.module_id}/progress/${lesson.id}`);
    } else {
      setViewerModal({ lessonId: lesson.id, title: lesson.title });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 mt-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!allLessons?.length && tree.length === 0) {
    return (
      <div className="mt-4 relative overflow-hidden rounded-2xl backdrop-blur-xl bg-card/60 dark:bg-card/40 border border-border/50 shadow-lg p-12 text-center">
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
        <div className="relative">
          <Users className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold mb-2">Нет данных</h3>
          <p className="text-muted-foreground">Создайте уроки для отслеживания прогресса учеников</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      {/* Sort controls */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Прогресс учеников по модулям и урокам</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSortToggle}
          className="gap-1.5 text-xs"
        >
          {sortMode === "alpha" ? (
            <>
              <ArrowDownAZ className="h-3.5 w-3.5" />
              По алфавиту
            </>
          ) : (
            <>
              <ArrowDown01 className="h-3.5 w-3.5" />
              По порядку
            </>
          )}
        </Button>
      </div>

      {/* Module tree */}
      <div className="space-y-1">
        {tree.map((node) => (
          <ModuleNode
            key={node.module.id}
            node={node}
            depth={0}
            onLessonClick={handleLessonClick}
          />
        ))}
      </div>

      {viewerModal && (
        <LessonViewersModal
          lessonId={viewerModal.lessonId}
          lessonTitle={viewerModal.title}
          open={true}
          onOpenChange={(open) => {
            if (!open) setViewerModal(null);
          }}
        />
      )}
    </div>
  );
}
