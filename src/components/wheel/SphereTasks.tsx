import { useState } from "react";
import { Plus, Trash2, Check, Loader2, ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWheelTasks, WheelTask } from "@/hooks/useWheelTasks";

interface SphereTasksProps {
  sphereKey: string;
  sphereTitle: string;
}

export function SphereTasks({ sphereKey, sphereTitle }: SphereTasksProps) {
  const { tasks, loading, addTask, deleteTask, toggleComplete } = useWheelTasks(sphereKey);
  const [newTaskText, setNewTaskText] = useState("");
  const [important, setImportant] = useState<string>("important");
  const [urgent, setUrgent] = useState<string>("not-urgent");
  const [isAdding, setIsAdding] = useState(false);

  const handleAddTask = async () => {
    if (!newTaskText.trim()) return;
    
    setIsAdding(true);
    await addTask(
      newTaskText.trim(), 
      sphereKey, 
      important === "important", 
      urgent === "urgent"
    );
    setNewTaskText("");
    setImportant("important");
    setUrgent("not-urgent");
    setIsAdding(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h4 className="font-semibold text-foreground flex items-center gap-2">
        <ListTodo className="w-4 h-4 text-primary" />
        Задачи по сфере
      </h4>
      
      {/* Task list */}
      {tasks.length > 0 ? (
        <ul className="space-y-2">
          {tasks.map((task, index) => (
            <li 
              key={task.id} 
              className="flex items-start gap-3 p-2 rounded-lg bg-muted/30 group"
            >
              <Checkbox 
                checked={task.completed}
                onCheckedChange={() => toggleComplete(task.id)}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <span className={`text-sm ${task.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                  {index + 1}. {task.content}
                </span>
                <div className="flex gap-1 mt-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${task.important ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {task.important ? 'Важно' : 'Не важно'}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${task.urgent ? 'bg-destructive/20 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                    {task.urgent ? 'Срочно' : 'Не срочно'}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100 h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={() => deleteTask(task.id)}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground italic">
          Нет задач. Добавьте первую задачу ниже.
        </p>
      )}

      {/* Add new task form */}
      <div className="space-y-3 pt-2 border-t border-border/50">
        <Input
          placeholder="Текст задачи..."
          value={newTaskText}
          onChange={(e) => setNewTaskText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
          className="text-sm"
        />
        
        <div className="flex gap-2">
          <Select value={important} onValueChange={setImportant}>
            <SelectTrigger className="flex-1 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="important">Важно</SelectItem>
              <SelectItem value="not-important">Не важно</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={urgent} onValueChange={setUrgent}>
            <SelectTrigger className="flex-1 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="urgent">Срочно</SelectItem>
              <SelectItem value="not-urgent">Не срочно</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button 
          onClick={handleAddTask} 
          disabled={!newTaskText.trim() || isAdding}
          size="sm"
          className="w-full"
        >
          {isAdding ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Plus className="w-4 h-4 mr-2" />
          )}
          Добавить задачу
        </Button>
        
        <p className="text-[10px] text-muted-foreground text-center">
          Задача автоматически появится в Матрице Эйзенхауэра
        </p>
      </div>
    </div>
  );
}
