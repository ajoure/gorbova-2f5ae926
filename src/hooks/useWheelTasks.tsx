import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

export interface WheelTask {
  id: string;
  sphere_key: string;
  content: string;
  important: boolean;
  urgent: boolean;
  completed: boolean;
  linked_eisenhower_task_id: string | null;
  created_at: string;
}

type QuadrantType = "urgent-important" | "not-urgent-important" | "urgent-not-important" | "not-urgent-not-important";

function getQuadrant(important: boolean, urgent: boolean): QuadrantType {
  if (important && urgent) return "urgent-important";
  if (important && !urgent) return "not-urgent-important";
  if (!important && urgent) return "urgent-not-important";
  return "not-urgent-not-important";
}

export function useWheelTasks(sphereKey?: string) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<WheelTask[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    if (!user) {
      setTasks([]);
      setLoading(false);
      return;
    }

    let query = supabase
      .from("wheel_balance_tasks")
      .select("id, sphere_key, content, important, urgent, completed, linked_eisenhower_task_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (sphereKey) {
      query = query.eq("sphere_key", sphereKey);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching wheel tasks:", error);
    } else {
      setTasks(data || []);
    }
    setLoading(false);
  }, [user, sphereKey]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const addTask = async (content: string, sphereKey: string, important: boolean, urgent: boolean) => {
    if (!user) return null;

    // First create eisenhower task
    const quadrant = getQuadrant(important, urgent);
    
    const { data: eisenhowerTask, error: eisenhowerError } = await supabase
      .from("eisenhower_tasks")
      .insert({ 
        user_id: user.id, 
        content, 
        quadrant,
        source: "wheel_balance"
      })
      .select("id")
      .single();

    if (eisenhowerError) {
      toast({
        title: "Ошибка",
        description: "Не удалось создать задачу в матрице",
        variant: "destructive",
      });
      return null;
    }

    // Then create wheel task with link
    const { data: wheelTask, error: wheelError } = await supabase
      .from("wheel_balance_tasks")
      .insert({ 
        user_id: user.id, 
        sphere_key: sphereKey,
        content, 
        important,
        urgent,
        linked_eisenhower_task_id: eisenhowerTask.id
      })
      .select("id, sphere_key, content, important, urgent, completed, linked_eisenhower_task_id, created_at")
      .single();

    if (wheelError) {
      // Rollback eisenhower task
      await supabase.from("eisenhower_tasks").delete().eq("id", eisenhowerTask.id);
      toast({
        title: "Ошибка",
        description: "Не удалось добавить задачу",
        variant: "destructive",
      });
      return null;
    }

    // Update eisenhower task with source_task_id
    await supabase
      .from("eisenhower_tasks")
      .update({ source_task_id: wheelTask.id })
      .eq("id", eisenhowerTask.id);

    setTasks(prev => [...prev, wheelTask]);
    toast({
      title: "Задача добавлена",
      description: "Задача также добавлена в матрицу Эйзенхауэра",
    });
    return wheelTask;
  };

  const updateTask = async (taskId: string, updates: { content?: string; important?: boolean; urgent?: boolean; completed?: boolean }) => {
    if (!user) return false;

    const task = tasks.find(t => t.id === taskId);
    if (!task) return false;

    const { error } = await supabase
      .from("wheel_balance_tasks")
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

    // Update linked eisenhower task if importance/urgency changed
    if ((updates.important !== undefined || updates.urgent !== undefined) && task.linked_eisenhower_task_id) {
      const newImportant = updates.important ?? task.important;
      const newUrgent = updates.urgent ?? task.urgent;
      const newQuadrant = getQuadrant(newImportant, newUrgent);
      
      await supabase
        .from("eisenhower_tasks")
        .update({ quadrant: newQuadrant })
        .eq("id", task.linked_eisenhower_task_id);
    }

    // Update content in eisenhower task if changed
    if (updates.content && task.linked_eisenhower_task_id) {
      await supabase
        .from("eisenhower_tasks")
        .update({ content: updates.content })
        .eq("id", task.linked_eisenhower_task_id);
    }

    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t));
    return true;
  };

  const deleteTask = async (taskId: string) => {
    if (!user) return false;

    const task = tasks.find(t => t.id === taskId);
    
    // Delete linked eisenhower task first (cascade will handle wheel task)
    if (task?.linked_eisenhower_task_id) {
      await supabase
        .from("eisenhower_tasks")
        .delete()
        .eq("id", task.linked_eisenhower_task_id);
    }

    const { error } = await supabase
      .from("wheel_balance_tasks")
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

  const toggleComplete = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return false;
    return updateTask(taskId, { completed: !task.completed });
  };

  return {
    tasks,
    loading,
    addTask,
    updateTask,
    deleteTask,
    toggleComplete,
    refetch: fetchTasks,
  };
}
