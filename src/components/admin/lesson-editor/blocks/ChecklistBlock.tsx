import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Plus, Trash2, GripVertical, FolderPlus } from "lucide-react";

export interface ChecklistItem {
  id: string;
  label: string;
  description?: string;
}

export interface ChecklistGroup {
  id: string;
  title: string;
  items: ChecklistItem[];
}

export interface ChecklistContentData {
  title?: string;
  description?: string;
  groups: ChecklistGroup[];
}

interface ChecklistBlockProps {
  content: ChecklistContentData;
  onChange: (content: ChecklistContentData) => void;
  isEditing?: boolean;
  blockId?: string;
  lessonId?: string;
  savedResponse?: any;
  onSave?: (checkedIds: string[]) => Promise<void>;
}

function generateId() {
  return crypto.randomUUID().slice(0, 8);
}

// ─── Admin Editor ───
function ChecklistEditor({ content, onChange }: { content: ChecklistContentData; onChange: (c: ChecklistContentData) => void }) {
  const addGroup = () => {
    onChange({
      ...content,
      groups: [...content.groups, { id: generateId(), title: "Новая группа", items: [] }],
    });
  };

  const updateGroup = (gIdx: number, patch: Partial<ChecklistGroup>) => {
    const groups = content.groups.map((g, i) => i === gIdx ? { ...g, ...patch } : g);
    onChange({ ...content, groups });
  };

  const removeGroup = (gIdx: number) => {
    onChange({ ...content, groups: content.groups.filter((_, i) => i !== gIdx) });
  };

  const addItem = (gIdx: number) => {
    const groups = [...content.groups];
    groups[gIdx] = {
      ...groups[gIdx],
      items: [...groups[gIdx].items, { id: generateId(), label: "", description: "" }],
    };
    onChange({ ...content, groups });
  };

  const updateItem = (gIdx: number, iIdx: number, patch: Partial<ChecklistItem>) => {
    const groups = [...content.groups];
    groups[gIdx] = {
      ...groups[gIdx],
      items: groups[gIdx].items.map((item, i) => i === iIdx ? { ...item, ...patch } : item),
    };
    onChange({ ...content, groups });
  };

  const removeItem = (gIdx: number, iIdx: number) => {
    const groups = [...content.groups];
    groups[gIdx] = {
      ...groups[gIdx],
      items: groups[gIdx].items.filter((_, i) => i !== iIdx),
    };
    onChange({ ...content, groups });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3">
        <div className="space-y-1.5">
          <Label>Заголовок</Label>
          <Input
            value={content.title || ''}
            onChange={(e) => onChange({ ...content, title: e.target.value })}
            placeholder="Чек-лист действий"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Описание</Label>
          <Input
            value={content.description || ''}
            onChange={(e) => onChange({ ...content, description: e.target.value })}
            placeholder="Отметьте выполненные пункты"
          />
        </div>
      </div>

      {content.groups.map((group, gIdx) => (
        <div key={group.id} className="border rounded-lg p-3 space-y-3">
          <div className="flex items-center gap-2">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <Input
              value={group.title}
              onChange={(e) => updateGroup(gIdx, { title: e.target.value })}
              placeholder="Название группы"
              className="flex-1"
            />
            <Button variant="ghost" size="icon" onClick={() => removeGroup(gIdx)} className="h-8 w-8 text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-2 pl-6">
            {group.items.map((item, iIdx) => (
              <div key={item.id} className="flex items-start gap-2">
                <Checkbox disabled className="mt-2.5" />
                <div className="flex-1 space-y-1">
                  <Input
                    value={item.label}
                    onChange={(e) => updateItem(gIdx, iIdx, { label: e.target.value })}
                    placeholder="Текст пункта"
                  />
                  <Input
                    value={item.description || ''}
                    onChange={(e) => updateItem(gIdx, iIdx, { description: e.target.value })}
                    placeholder="Подсказка (опционально)"
                    className="text-xs"
                  />
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeItem(gIdx, iIdx)} className="h-8 w-8 text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => addItem(gIdx)} className="ml-6">
              <Plus className="h-3.5 w-3.5 mr-1" />Пункт
            </Button>
          </div>
        </div>
      ))}

      <Button variant="outline" onClick={addGroup}>
        <FolderPlus className="h-4 w-4 mr-2" />Добавить группу
      </Button>
    </div>
  );
}

// ─── Student View ───
function ChecklistStudentView({ content, savedResponse, onSave }: {
  content: ChecklistContentData;
  savedResponse?: any;
  onSave?: (checkedIds: string[]) => Promise<void>;
}) {
  const initialChecked: string[] = savedResponse?.checkedIds || savedResponse?.checked_ids || [];
  const [checked, setChecked] = useState<Set<string>>(new Set(initialChecked));

  const allItems = content.groups.flatMap(g => g.items);
  const total = allItems.length;
  const done = allItems.filter(item => checked.has(item.id)).length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  const toggle = useCallback(async (id: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      const arr = Array.from(next);
      onSave?.(arr);
      return next;
    });
  }, [onSave]);

  return (
    <div className="space-y-4">
      {content.title && <h3 className="text-lg font-semibold">{content.title}</h3>}
      {content.description && <p className="text-sm text-muted-foreground">{content.description}</p>}

      {content.groups.map(group => (
        <div key={group.id} className="space-y-2">
          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">{group.title}</h4>
          <div className="space-y-1">
            {group.items.map(item => (
              <label
                key={item.id}
                className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
              >
                <Checkbox
                  checked={checked.has(item.id)}
                  onCheckedChange={() => toggle(item.id)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <span className={`text-sm ${checked.has(item.id) ? 'line-through text-muted-foreground' : ''}`}>
                    {item.label}
                  </span>
                  {item.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>
      ))}

      {total > 0 && (
        <div className="space-y-1.5 pt-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Прогресс</span>
            <span>{done} из {total} ({percent}%)</span>
          </div>
          <Progress value={percent} className="h-2" />
        </div>
      )}
    </div>
  );
}

export function ChecklistBlock({ content, onChange, isEditing = true, savedResponse, onSave }: ChecklistBlockProps) {
  if (!isEditing) {
    return <ChecklistStudentView content={content} savedResponse={savedResponse} onSave={onSave} />;
  }
  return <ChecklistEditor content={content} onChange={onChange} />;
}
