import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import {
  ArrowLeft,
  Plus,
  Edit,
  Trash2,
  Globe,
  Loader2,
  CheckCircle,
  XCircle,
  ExternalLink,
  RefreshCw,
} from "lucide-react";

interface NewsSource {
  id: string;
  name: string;
  url: string;
  country: string;
  category: string;
  is_active: boolean;
  priority: number;
  last_scraped_at: string | null;
  last_error: string | null;
  created_at: string;
}

const AdminEditorialSources = () => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<NewsSource | null>(null);
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [form, setForm] = useState({
    name: "",
    url: "",
    country: "by",
    category: "npa",
    priority: 50,
    is_active: true,
  });

  const { data: sources, isLoading } = useQuery({
    queryKey: ["news-sources", countryFilter, categoryFilter],
    queryFn: async () => {
      let query = supabase
        .from("news_sources")
        .select("*")
        .order("priority", { ascending: false });

      if (countryFilter !== "all") {
        query = query.eq("country", countryFilter);
      }
      if (categoryFilter !== "all") {
        query = query.eq("category", categoryFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as NewsSource[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form & { id?: string }) => {
      if (data.id) {
        const { error } = await supabase
          .from("news_sources")
          .update({
            name: data.name,
            url: data.url,
            country: data.country,
            category: data.category,
            priority: data.priority,
            is_active: data.is_active,
          })
          .eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("news_sources").insert({
          name: data.name,
          url: data.url,
          country: data.country,
          category: data.category,
          priority: data.priority,
          is_active: data.is_active,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingSource ? "Источник обновлён" : "Источник добавлен");
      queryClient.invalidateQueries({ queryKey: ["news-sources"] });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("news_sources").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Источник удалён");
      queryClient.invalidateQueries({ queryKey: ["news-sources"] });
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("news_sources")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["news-sources"] });
    },
  });

  const resetForm = () => {
    setForm({
      name: "",
      url: "",
      country: "by",
      category: "npa",
      priority: 50,
      is_active: true,
    });
    setEditingSource(null);
  };

  const handleEdit = (source: NewsSource) => {
    setEditingSource(source);
    setForm({
      name: source.name,
      url: source.url,
      country: source.country,
      category: source.category,
      priority: source.priority,
      is_active: source.is_active,
    });
    setDialogOpen(true);
  };

  const handleAdd = () => {
    resetForm();
    setDialogOpen(true);
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      npa: "НПА",
      government: "Госорган",
      media: "СМИ",
    };
    return labels[category] || category;
  };

  const getCountryFlag = (country: string) => {
    return country === "by" ? "🇧🇾" : "🇷🇺";
  };

  const activeCount = sources?.filter((s) => s.is_active).length || 0;
  const byCount = sources?.filter((s) => s.country === "by").length || 0;
  const ruCount = sources?.filter((s) => s.country === "ru").length || 0;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" asChild>
              <a href="/admin/editorial">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Назад
              </a>
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Globe className="h-6 w-6" />
                Источники новостей
              </h1>
              <p className="text-muted-foreground">
                {sources?.length || 0} источников • {activeCount} активных
              </p>
            </div>
          </div>
          <Button onClick={handleAdd}>
            <Plus className="h-4 w-4 mr-2" />
            Добавить источник
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{sources?.length || 0}</div>
              <div className="text-sm text-muted-foreground">Всего источников</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-600">{activeCount}</div>
              <div className="text-sm text-muted-foreground">Активных</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">🇧🇾 {byCount}</div>
              <div className="text-sm text-muted-foreground">Беларусь</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">🇷🇺 {ruCount}</div>
              <div className="text-sm text-muted-foreground">Россия</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-4">
          <Select value={countryFilter} onValueChange={setCountryFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Страна" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все страны</SelectItem>
              <SelectItem value="by">🇧🇾 Беларусь</SelectItem>
              <SelectItem value="ru">🇷🇺 Россия</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Категория" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все категории</SelectItem>
              <SelectItem value="npa">НПА</SelectItem>
              <SelectItem value="government">Госорганы</SelectItem>
              <SelectItem value="media">СМИ</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Вкл</TableHead>
                    <TableHead>Источник</TableHead>
                    <TableHead>Категория</TableHead>
                    <TableHead className="w-20">Приор.</TableHead>
                    <TableHead>Последний скан</TableHead>
                    <TableHead className="w-24">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sources?.map((source) => (
                    <TableRow key={source.id}>
                      <TableCell>
                        <Switch
                          checked={source.is_active}
                          onCheckedChange={(checked) =>
                            toggleMutation.mutate({ id: source.id, is_active: checked })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{getCountryFlag(source.country)}</span>
                          <div>
                            <div className="font-medium">{source.name}</div>
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
                            >
                              {new URL(source.url).hostname}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{getCategoryLabel(source.category)}</Badge>
                      </TableCell>
                      <TableCell>{source.priority}</TableCell>
                      <TableCell>
                        {source.last_scraped_at ? (
                          <div className="flex items-center gap-1">
                            {source.last_error ? (
                              <XCircle className="h-4 w-4 text-destructive" />
                            ) : (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            )}
                            <span className="text-sm">
                              {format(new Date(source.last_scraped_at), "dd.MM HH:mm", { locale: ru })}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">Никогда</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(source)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm("Удалить этот источник?")) {
                                deleteMutation.mutate(source.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Add/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingSource ? "Редактировать источник" : "Добавить источник"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Название</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="МНС РБ"
                />
              </div>
              <div>
                <label className="text-sm font-medium">URL</label>
                <Input
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://nalog.gov.by/news/"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Страна</label>
                  <Select
                    value={form.country}
                    onValueChange={(v) => setForm({ ...form, country: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="by">🇧🇾 Беларусь</SelectItem>
                      <SelectItem value="ru">🇷🇺 Россия</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Категория</label>
                  <Select
                    value={form.category}
                    onValueChange={(v) => setForm({ ...form, category: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="npa">НПА</SelectItem>
                      <SelectItem value="government">Госорган</SelectItem>
                      <SelectItem value="media">СМИ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Приоритет (1-100)</label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 50 })}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
                />
                <label className="text-sm">Активен</label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Отмена
              </Button>
              <Button
                onClick={() => {
                  saveMutation.mutate({
                    ...form,
                    id: editingSource?.id,
                  });
                }}
                disabled={saveMutation.isPending || !form.name || !form.url}
              >
                {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Сохранить
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminEditorialSources;
