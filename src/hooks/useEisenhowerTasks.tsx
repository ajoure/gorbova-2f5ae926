import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

export interface EisenhowerTask {
  id: string;
  content: string;
  quadrant: string;
  source?: string;
  source_task_id?: string | null;
}

type QuadrantType = "urgent-important" | "not-urgent-important" | "urgent-not-important" | "not-urgent-not-important";

function getImportanceUrgency(quadrant: QuadrantType): { important: boolean; urgent: boolean } {
  switch (quadrant) {
    case "urgent-important": return { important: true, urgent: true };
    case "not-urgent-important": return { important: true, urgent: false };
    case "urgent-not-important": return { important: false, urgent: true };
    case "not-urgent-not-important": return { important: false, urgent: false };
  }
}

export function useEisenhowerTasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<EisenhowerTask[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    if (!user) {
      setTasks([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("eisenhower_tasks")
      .select("id, content, quadrant, source, source_task_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching tasks:", error);
    } else {
      setTasks(data || []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const addTask = async (content: string, quadrant: QuadrantType) => {
    if (!user) return null;

    const { data, error } = await supabase
      .from("eisenhower_tasks")
      .insert({ user_id: user.id, content, quadrant, source: "direct" })
      .select("id, content, quadrant, source, source_task_id")
      .single();

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось добавить задачу",
        variant: "destructive",
      });
      return null;
    }

    setTasks(prev => [...prev, data]);
    return data;
  };

  const updateTask = async (taskId: string, updates: { content?: string; quadrant?: QuadrantType }) => {
    if (!user) return false;

    const task = tasks.find(t => t.id === taskId);

    const { error } = await supabase
      .from("eisenhower_tasks")
      .update(updates)
      .eq("id", taskId)
      .eq("user_id", user.id);

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось обновить задачу",
        variant: "destructive",
      });
      return false;
    }

    // Sync with wheel task if linked
    if (updates.quadrant && task?.source === "wheel_balance" && task?.source_task_id) {
      const { important, urgent } = getImportanceUrgency(updates.quadrant);
      await supabase
        .from("wheel_balance_tasks")
        .update({ important, urgent })
        .eq("id", task.source_task_id);
    }

    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t));
    return true;
  };

  const deleteTask = async (taskId: string) => {
    if (!user) return false;

    const { error } = await supabase
      .from("eisenhower_tasks")
      .delete()
      .eq("id", taskId)
      .eq("user_id", user.id);

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось удалить задачу",
        variant: "destructive",
      });
      return false;
    }

    setTasks(prev => prev.filter(t => t.id !== taskId));
    return true;
  };

  const moveTask = async (taskId: string, newQuadrant: QuadrantType) => {
    return updateTask(taskId, { quadrant: newQuadrant });
  };

  return {
    tasks,
    loading,
    addTask,
    updateTask,
    deleteTask,
    moveTask,
    refetch: fetchTasks,
  };
}
