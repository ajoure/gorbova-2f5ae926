import React, { useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ContentSectionSelector } from "./ContentSectionSelector";
import { DisplayLayoutSelector, DisplayLayout } from "./DisplayLayoutSelector";

export const gradientOptions = [
  { value: "from-pink-500 to-fuchsia-600", label: "Розовый → Фуксия" },
  { value: "from-blue-500 to-cyan-500", label: "Синий → Голубой" },
  { value: "from-green-500 to-emerald-500", label: "Зелёный → Изумрудный" },
  { value: "from-orange-500 to-amber-500", label: "Оранжевый → Янтарный" },
  { value: "from-purple-500 to-violet-500", label: "Фиолетовый → Сиреневый" },
  { value: "from-red-500 to-rose-500", label: "Красный → Розовый" },
  { value: "from-indigo-500 to-purple-500", label: "Индиго → Фиолетовый" },
  { value: "from-teal-500 to-cyan-500", label: "Бирюзовый → Голубой" },
];

export const generateSlug = (title: string) => {
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

export interface ModuleFormData {
  title: string;
  slug: string;
  description?: string;
  cover_image?: string;
  color_gradient?: string;
  is_active?: boolean;
  menu_section_key?: string;
  display_layout?: string;
}

interface ModuleFormFieldsProps {
  formData: ModuleFormData;
  onChange: (data: ModuleFormData) => void;
  isEditing?: boolean;
  showSectionSelector?: boolean;
  showLayoutSelector?: boolean;
  showActiveSwitch?: boolean;
  compact?: boolean;
}

export function ModuleFormFields({
  formData,
  onChange,
  isEditing = false,
  showSectionSelector = true,
  showLayoutSelector = true,
  showActiveSwitch = true,
  compact = false,
}: ModuleFormFieldsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Выберите файл изображения");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Максимальный размер файла: 5MB");
      return;
    }

    try {
      setUploading(true);
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `training-covers/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("training-assets")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("training-assets")
        .getPublicUrl(filePath);

      onChange({ ...formData, cover_image: urlData.publicUrl });
      toast.success("Обложка загружена");
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Ошибка загрузки файла");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const updateField = <K extends keyof ModuleFormData>(
    field: K,
    value: ModuleFormData[K]
  ) => {
    onChange({ ...formData, [field]: value });
  };

  const handleTitleChange = (newTitle: string) => {
    onChange({
      ...formData,
      title: newTitle,
      slug: isEditing ? formData.slug : generateSlug(newTitle),
    });
  };

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div className={compact ? "space-y-3" : "grid gap-4 md:grid-cols-2"}>
        <div className="space-y-2">
          <Label htmlFor="module-title">Название *</Label>
          <Input
            id="module-title"
            value={formData.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="База знаний"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="module-slug">Адрес страницы *</Label>
          <Input
            id="module-slug"
            value={formData.slug}
            onChange={(e) => updateField("slug", e.target.value)}
            placeholder="baza-znanij"
          />
          <p className="text-xs text-muted-foreground">
            URL: /library/<strong>{formData.slug || "..."}</strong>
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="module-description">Описание</Label>
        <Textarea
          id="module-description"
          value={formData.description || ""}
          onChange={(e) => updateField("description", e.target.value)}
          placeholder="Краткое описание модуля..."
          rows={compact ? 2 : 3}
        />
      </div>

      <div className="space-y-2">
        <Label>Обложка</Label>
        <div className="flex gap-2">
          <Input
            value={formData.cover_image || ""}
            onChange={(e) => updateField("cover_image", e.target.value)}
            placeholder="https://... или загрузите файл"
            className="flex-1"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
          </Button>
        </div>
        {formData.cover_image && (
          <div className="relative mt-2 h-20 w-32 rounded-lg overflow-hidden border">
            <img
              src={formData.cover_image}
              alt="Обложка"
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>Цвет градиента</Label>
        <Select
          value={formData.color_gradient || "from-pink-500 to-fuchsia-600"}
          onValueChange={(value) => updateField("color_gradient", value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {gradientOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-4 rounded bg-gradient-to-r ${opt.value}`} />
                  {opt.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {showActiveSwitch && (
        <div className="flex items-center space-x-2">
          <Switch
            id="module-is_active"
            checked={formData.is_active !== false}
            onCheckedChange={(checked) => updateField("is_active", checked)}
          />
          <Label htmlFor="module-is_active">Активен</Label>
        </div>
      )}

      {showSectionSelector && (
        <ContentSectionSelector
          value={formData.menu_section_key || "products-library"}
          onChange={(value) => updateField("menu_section_key", value)}
        />
      )}

      {showLayoutSelector && (
        <DisplayLayoutSelector
          value={formData.display_layout || "grid"}
          onChange={(value) => updateField("display_layout", value as DisplayLayout)}
        />
      )}
    </div>
  );
}
