import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, ChevronRight, BookOpen, Eye } from "lucide-react";
import { LessonViewersModal } from "./LessonViewersModal";
import type { TrainingModule } from "@/hooks/useTrainingModules";

interface ProgressTabContentProps {
  modules: TrainingModule[];
}

interface LessonWithProgress {
  id: string;
  title: string;
  module_id: string;
  completion_mode: string | null;
  moduleName: string;
  studentCount: number;
  completedCount: number;
}

export function ProgressTabContent({ modules }: ProgressTabContentProps) {
  const navigate = useNavigate();
  const [viewerModal, setViewerModal] = useState<{ lessonId: string; title: string } | null>(null);

  const moduleIds = modules.map((m) => m.id);

  const { data: allLessons, isLoading } = useQuery({
    queryKey: ["all-lessons-progress", moduleIds],
    queryFn: async () => {
      if (moduleIds.length === 0) return [];

      // Get all lessons for these modules (no completion_mode filter)
      const { data: lessons, error } = await supabase
        .from("training_lessons")
        .select(`
          id,
          title,
          module_id,
          completion_mode,
          training_modules!inner(id, title)
        `)
        .in("module_id", moduleIds)
        .order("sort_order");

      if (error) throw error;

      const lessonIds = lessons?.map((l) => l.id) || [];
      if (lessonIds.length === 0) return [];

      // Kvest lessons: progress from lesson_progress_state
      const kvestLessonIds = lessons?.filter((l) => l.completion_mode === "kvest").map((l) => l.id) || [];
      // Normal lessons: progress from lesson_progress
      const normalLessonIds = lessons?.filter((l) => l.completion_mode !== "kvest").map((l) => l.id) || [];

      const kvestProgressMap = new Map<string, { total: number; completed: number }>();
      const normalProgressMap = new Map<string, { total: number; completed: number }>();

      // Fetch kvest progress
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

      // Fetch normal progress (UNIQUE user_id, lesson_id => count(*) = distinct users)
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
          moduleName: (lesson.training_modules as any)?.title || "Без модуля",
          studentCount: progressMap.get(lesson.id)?.total || 0,
          completedCount: progressMap.get(lesson.id)?.completed || 0,
        } as LessonWithProgress;
      }) || [];
    },
    enabled: moduleIds.length > 0,
  });

  if (isLoading) {
    return (
      <div className="space-y-4 mt-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!allLessons?.length) {
    return (
      <div className="mt-4 relative overflow-hidden rounded-2xl backdrop-blur-xl bg-card/60 dark:bg-card/40 border border-border/50 shadow-lg p-12 text-center">
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
        <div className="relative">
          <Users className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold mb-2">Нет уроков</h3>
          <p className="text-muted-foreground">Создайте уроки для отслеживания прогресса учеников</p>
        </div>
      </div>
    );
  }

  // Group by module
  const groupedByModule = new Map<string, { moduleName: string; lessons: LessonWithProgress[] }>();
  for (const lesson of allLessons) {
    if (!groupedByModule.has(lesson.module_id)) {
      groupedByModule.set(lesson.module_id, { moduleName: lesson.moduleName, lessons: [] });
    }
    groupedByModule.get(lesson.module_id)!.lessons.push(lesson);
  }

  const handleLessonClick = (lesson: LessonWithProgress) => {
    if (lesson.completion_mode === "kvest") {
      navigate(`/admin/training-lessons/${lesson.module_id}/progress/${lesson.id}`);
    } else {
      setViewerModal({ lessonId: lesson.id, title: lesson.title });
    }
  };

  return (
    <div className="space-y-6 mt-4">
      <p className="text-sm text-muted-foreground">
        Прогресс учеников по всем урокам
      </p>

      {Array.from(groupedByModule.entries()).map(([moduleId, group]) => (
        <div key={moduleId}>
          <h3 className="text-sm font-semibold mb-2 text-muted-foreground">{group.moduleName}</h3>
          <div className="space-y-2">
            {group.lessons.map((lesson) => (
              <Card
                key={lesson.id}
                className="group hover:shadow-md transition-all cursor-pointer"
                onClick={() => handleLessonClick(lesson)}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      {lesson.completion_mode === "kvest" ? (
                        <BookOpen className="h-5 w-5 text-primary" />
                      ) : (
                        <Eye className="h-5 w-5 text-primary" />
                      )}
                    </div>
                    <div>
                      <h4 className="font-medium text-sm">{lesson.title}</h4>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge
                          variant={lesson.completion_mode === "kvest" ? "default" : "secondary"}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {lesson.completion_mode === "kvest" ? "Квест" : "Обычный"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="font-normal">
                        <Users className="h-3 w-3 mr-1" />
                        {lesson.studentCount}
                      </Badge>
                      <Badge variant="default" className="font-normal">
                        ✓ {lesson.completedCount}
                      </Badge>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}

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
