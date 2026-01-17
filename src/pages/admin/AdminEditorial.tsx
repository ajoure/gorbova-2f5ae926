import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import {
  Newspaper,
  Send,
  Clock,
  CheckCircle,
  RefreshCw,
  ExternalLink,
  Edit,
  Trash2,
  Calendar,
  Globe,
  Loader2,
  Play,
  Settings,
} from "lucide-react";

interface NewsItem {
  id: string;
  title: string;
  summary: string | null;
  ai_summary: string | null;
  source: string;
  source_url: string | null;
  country: string;
  category: string;
  effective_date: string | null;
  telegram_status: string;
  news_priority: string;
  keywords: string[] | null;
  created_at: string;
  scraped_at: string | null;
  source_id: string | null;
  news_sources?: {
    name: string;
  };
}

interface TelegramChannel {
  id: string;
  channel_id: string;
  channel_name: string;
  channel_type: string;
  is_active: boolean;
}

const AdminEditorial = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("drafts");
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<string>("");
  const [editForm, setEditForm] = useState({ title: "", summary: "", effective_date: "" });

  // Fetch news by status
  const { data: draftNews, isLoading: loadingDrafts } = useQuery({
    queryKey: ["editorial-news", "draft"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("news_content")
        .select("*, news_sources(name)")
        .eq("telegram_status", "draft")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as NewsItem[];
    },
  });

  const { data: queuedNews, isLoading: loadingQueued } = useQuery({
    queryKey: ["editorial-news", "queued"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("news_content")
        .select("*, news_sources(name)")
        .eq("telegram_status", "queued")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as NewsItem[];
    },
  });

  const { data: sentNews, isLoading: loadingSent } = useQuery({
    queryKey: ["editorial-news", "sent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("news_content")
        .select("*, news_sources(name)")
        .eq("telegram_status", "sent")
        .order("telegram_sent_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as NewsItem[];
    },
  });

  // Fetch channels
  const { data: channels } = useQuery({
    queryKey: ["telegram-publish-channels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("telegram_publish_channels")
        .select("*")
        .eq("is_active", true);
      if (error) throw error;
      return data as TelegramChannel[];
    },
  });

  // Run scraper mutation
  const runScraperMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("monitor-news", {
        body: { limit: 10 },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Парсинг завершён: ${data.totalItems} новых новостей`);
      queryClient.invalidateQueries({ queryKey: ["editorial-news"] });
    },
    onError: (error) => {
      toast.error(`Ошибка парсинга: ${error.message}`);
    },
  });

  // Publish mutation
  const publishMutation = useMutation({
    mutationFn: async ({ newsId, channelId, action }: { newsId: string; channelId: string; action: string }) => {
      const { data, error } = await supabase.functions.invoke("telegram-publish-news", {
        body: { action, newsId, channelId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      const actionText = variables.action === "add_to_queue" ? "добавлена в очередь" : "опубликована";
      toast.success(`Новость ${actionText}`);
      queryClient.invalidateQueries({ queryKey: ["editorial-news"] });
      setPublishDialogOpen(false);
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  // Update news mutation
  const updateNewsMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<NewsItem> }) => {
      const { error } = await supabase
        .from("news_content")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Новость обновлена");
      queryClient.invalidateQueries({ queryKey: ["editorial-news"] });
      setEditDialogOpen(false);
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  // Delete news mutation
  const deleteNewsMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("news_content")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Новость удалена");
      queryClient.invalidateQueries({ queryKey: ["editorial-news"] });
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const handleEdit = (news: NewsItem) => {
    setSelectedNews(news);
    setEditForm({
      title: news.title,
      summary: news.ai_summary || news.summary || "",
      effective_date: news.effective_date || "",
    });
    setEditDialogOpen(true);
  };

  const handlePublish = (news: NewsItem) => {
    setSelectedNews(news);
    if (channels && channels.length > 0) {
      setSelectedChannel(channels[0].id);
    }
    setPublishDialogOpen(true);
  };

  const getCategoryBadge = (category: string) => {
    const variants: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
      npa: { label: "НПА", variant: "default" },
      government: { label: "Госорган", variant: "secondary" },
      media: { label: "СМИ", variant: "outline" },
    };
    return variants[category] || { label: category, variant: "outline" };
  };

  const getCountryFlag = (country: string) => {
    return country === "by" ? "🇧🇾" : "🇷🇺";
  };

  const renderNewsCard = (news: NewsItem, showActions = true) => (
    <Card key={news.id} className="mb-4">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {news.news_priority === "urgent" && (
                <Badge variant="destructive" className="text-xs">🔴 СРОЧНО</Badge>
              )}
              <Badge {...getCategoryBadge(news.category)}>{getCategoryBadge(news.category).label}</Badge>
              <span className="text-muted-foreground text-xs">{getCountryFlag(news.country)}</span>
              <span className="text-muted-foreground text-xs">
                {news.news_sources?.name || news.source}
              </span>
              <span className="text-muted-foreground text-xs">
                {format(new Date(news.created_at), "dd.MM.yyyy HH:mm", { locale: ru })}
              </span>
            </div>
            <CardTitle className="text-base leading-tight">{news.title}</CardTitle>
          </div>
          {showActions && (
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="icon" onClick={() => handleEdit(news)}>
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (confirm("Удалить эту новость?")) {
                    deleteNewsMutation.mutate(news.id);
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3 line-clamp-3">
          {news.ai_summary || news.summary || "Нет описания"}
        </p>

        {news.effective_date && (
          <div className="flex items-center gap-1 text-sm mb-3">
            <Calendar className="h-4 w-4 text-primary" />
            <span className="underline">
              Вступает в силу: {format(new Date(news.effective_date), "dd MMMM yyyy", { locale: ru })}
            </span>
          </div>
        )}

        {news.keywords && news.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {news.keywords.slice(0, 5).map((kw, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {kw}
              </Badge>
            ))}
          </div>
        )}

        {showActions && (
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={() => handlePublish(news)}>
              <Send className="h-4 w-4 mr-1" />
              В Telegram
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (channels && channels.length > 0) {
                  publishMutation.mutate({
                    newsId: news.id,
                    channelId: channels[0].id,
                    action: "add_to_queue",
                  });
                } else {
                  toast.error("Нет настроенных каналов");
                }
              }}
            >
              <Clock className="h-4 w-4 mr-1" />
              В очередь
            </Button>
            {news.source_url && (
              <Button size="sm" variant="ghost" asChild>
                <a href={news.source_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Источник
                </a>
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Newspaper className="h-6 w-6" />
              Редакция
            </h1>
            <p className="text-muted-foreground">
              Мониторинг новостей и публикация в Telegram
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <a href="/admin/editorial/sources">
                <Settings className="h-4 w-4 mr-2" />
                Источники
              </a>
            </Button>
            <Button
              onClick={() => runScraperMutation.mutate()}
              disabled={runScraperMutation.isPending}
            >
              {runScraperMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Запустить парсинг
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="drafts" className="flex items-center gap-2">
              <Edit className="h-4 w-4" />
              Входящие
              {draftNews && draftNews.length > 0 && (
                <Badge variant="secondary">{draftNews.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="queued" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              В очереди
              {queuedNews && queuedNews.length > 0 && (
                <Badge variant="secondary">{queuedNews.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="sent" className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Опубликовано
            </TabsTrigger>
          </TabsList>

          <TabsContent value="drafts" className="mt-4">
            {loadingDrafts ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : draftNews && draftNews.length > 0 ? (
              <div className="grid gap-4">
                {draftNews.map((news) => renderNewsCard(news))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <Globe className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Нет новых черновиков</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Нажмите "Запустить парсинг" для поиска новостей
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="queued" className="mt-4">
            {loadingQueued ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : queuedNews && queuedNews.length > 0 ? (
              <div className="grid gap-4">
                {queuedNews.map((news) => renderNewsCard(news, false))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Очередь пуста</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="sent" className="mt-4">
            {loadingSent ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : sentNews && sentNews.length > 0 ? (
              <div className="grid gap-4">
                {sentNews.map((news) => renderNewsCard(news, false))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <CheckCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Нет опубликованных новостей</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Редактировать новость</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Заголовок</label>
                <Input
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Описание</label>
                <Textarea
                  value={editForm.summary}
                  onChange={(e) => setEditForm({ ...editForm, summary: e.target.value })}
                  rows={5}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Дата вступления в силу</label>
                <Input
                  type="date"
                  value={editForm.effective_date}
                  onChange={(e) => setEditForm({ ...editForm, effective_date: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Отмена
              </Button>
              <Button
                onClick={() => {
                  if (selectedNews) {
                    updateNewsMutation.mutate({
                      id: selectedNews.id,
                      updates: {
                        title: editForm.title,
                        ai_summary: editForm.summary,
                        effective_date: editForm.effective_date || null,
                      },
                    });
                  }
                }}
                disabled={updateNewsMutation.isPending}
              >
                {updateNewsMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Сохранить
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Publish Dialog */}
        <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Опубликовать в Telegram</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Канал</label>
                <Select value={selectedChannel} onValueChange={setSelectedChannel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите канал" />
                  </SelectTrigger>
                  <SelectContent>
                    {channels?.map((ch) => (
                      <SelectItem key={ch.id} value={ch.id}>
                        {ch.channel_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedNews && (
                <Card className="bg-muted/50">
                  <CardContent className="p-4">
                    <p className="font-medium">{selectedNews.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {selectedNews.ai_summary?.slice(0, 150)}...
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPublishDialogOpen(false)}>
                Отмена
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  if (selectedNews && selectedChannel) {
                    publishMutation.mutate({
                      newsId: selectedNews.id,
                      channelId: selectedChannel,
                      action: "add_to_queue",
                    });
                  }
                }}
                disabled={publishMutation.isPending || !selectedChannel}
              >
                <Clock className="h-4 w-4 mr-2" />
                В очередь
              </Button>
              <Button
                onClick={() => {
                  if (selectedNews && selectedChannel) {
                    publishMutation.mutate({
                      newsId: selectedNews.id,
                      channelId: selectedChannel,
                      action: "publish_single",
                    });
                  }
                }}
                disabled={publishMutation.isPending || !selectedChannel}
              >
                {publishMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Send className="h-4 w-4 mr-2" />
                Опубликовать
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminEditorial;
