import React, { memo } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const generateLessonSlug = (title: string) => {
  return title
    .toLowerCase()
    .replace(/[а-яё]/gi, (char) => {
      const ru = "абвгдеёжзийклмнопрстуфхцчшщъыьэюя";
      const en = ["a","b","v","g","d","e","yo","zh","z","i","j","k","l","m","n","o","p","r","s","t","u","f","h","c","ch","sh","sch","","y","","e","yu","ya"];
      const idx = ru.indexOf(char.toLowerCase());
      return idx >= 0 ? en[idx] : char;
    })
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
};

export interface LessonFormDataSimple {
  title: string;
  slug: string;
  description?: string;
}

interface LessonFormFieldsSimpleProps {
  formData: LessonFormDataSimple;
  onChange: (data: LessonFormDataSimple) => void;
  isEditing?: boolean;
}

export const LessonFormFieldsSimple = memo(function LessonFormFieldsSimple({
  formData,
  onChange,
  isEditing = false,
}: LessonFormFieldsSimpleProps) {
  const handleTitleChange = (newTitle: string) => {
    onChange({
      ...formData,
      title: newTitle,
      slug: isEditing ? formData.slug : generateLessonSlug(newTitle),
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="lesson-title">Название урока</Label>
          <Input
            id="lesson-title"
            value={formData.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Введение в тему"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lesson-slug">URL-адрес</Label>
          <Input
            id="lesson-slug"
            value={formData.slug}
            onChange={(e) => onChange({ ...formData, slug: e.target.value })}
            placeholder="vvedenie-v-temu"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Краткое описание</Label>
        <Textarea
          value={formData.description || ""}
          onChange={(e) => onChange({ ...formData, description: e.target.value })}
          placeholder="О чём этот урок..."
          rows={2}
        />
      </div>
    </div>
  );
});
