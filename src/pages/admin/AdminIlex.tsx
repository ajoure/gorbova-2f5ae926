import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Search, 
  FileText, 
  Star, 
  Settings, 
  Wifi, 
  WifiOff, 
  Loader2, 
  Download,
  FileDown,
  Trash2,
  ExternalLink,
  RefreshCw,
  BookOpen,
  Eye
} from 'lucide-react';
import { useIlexApi, IlexSearchResult, IlexDocument } from '@/hooks/useIlexApi';
import { exportToDocx, exportToPdf } from '@/utils/exportDocument';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

export default function AdminIlex() {
  const { 
    isLoading, 
    connectionStatus, 
    checkConnection, 
    search, 
    fetchDocument,
    saveDocument,
    getSavedDocuments,
    deleteDocument 
  } = useIlexApi();
  
  const [activeTab, setActiveTab] = useState('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<IlexSearchResult[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<{ url: string; content: string; title: string; cleanText: string } | null>(null);
  const [savedDocuments, setSavedDocuments] = useState<IlexDocument[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isFetchingDocument, setIsFetchingDocument] = useState(false);

  // Load saved documents on mount
  useEffect(() => {
    loadSavedDocuments();
  }, []);

  const loadSavedDocuments = async () => {
    const docs = await getSavedDocuments();
    setSavedDocuments(docs);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    const results = await search(searchQuery);
    setSearchResults(results);
    setIsSearching(false);
  };

  const handleViewDocument = async (url: string) => {
    setIsFetchingDocument(true);
    const doc = await fetchDocument(url);
    if (doc) {
      setSelectedDocument({ url, ...doc });
      setActiveTab('document');
    }
    setIsFetchingDocument(false);
  };

  const handleSaveDocument = async () => {
    if (!selectedDocument) return;
    
    const success = await saveDocument({
      ilex_id: selectedDocument.url,
      title: selectedDocument.title,
      content: selectedDocument.cleanText,
    });
    
    if (success) {
      loadSavedDocuments();
    }
  };

  const handleDeleteDocument = async (id: string) => {
    const success = await deleteDocument(id);
    if (success) {
      loadSavedDocuments();
    }
  };

  const handleExportDocx = () => {
    if (!selectedDocument) return;
    const filename = `${selectedDocument.title.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_')}.docx`;
    exportToDocx(selectedDocument.cleanText, filename);
  };

  const handleExportPdf = () => {
    if (!selectedDocument) return;
    const filename = `${selectedDocument.title.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_')}.pdf`;
    exportToPdf(selectedDocument.cleanText, filename);
  };

  const getConnectionStatusBadge = () => {
    switch (connectionStatus) {
      case 'online':
        return <Badge variant="default" className="bg-green-500"><Wifi className="h-3 w-3 mr-1" />Онлайн</Badge>;
      case 'offline':
        return <Badge variant="destructive"><WifiOff className="h-3 w-3 mr-1" />Офлайн</Badge>;
      case 'checking':
        return <Badge variant="secondary"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Проверка...</Badge>;
      default:
        return <Badge variant="outline">Неизвестно</Badge>;
    }
  };

  return (
    <AdminLayout>
      <div className="container mx-auto py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BookOpen className="h-6 w-6" />
              iLex Private
            </h1>
            <p className="text-muted-foreground">
              Работа с законодательством Республики Беларусь
            </p>
          </div>
          <div className="flex items-center gap-3">
            {getConnectionStatusBadge()}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={checkConnection}
              disabled={connectionStatus === 'checking'}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${connectionStatus === 'checking' ? 'animate-spin' : ''}`} />
              Проверить
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="search" className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Поиск
            </TabsTrigger>
            <TabsTrigger value="document" className="flex items-center gap-2" disabled={!selectedDocument}>
              <FileText className="h-4 w-4" />
              Документ
            </TabsTrigger>
            <TabsTrigger value="favorites" className="flex items-center gap-2">
              <Star className="h-4 w-4" />
              Избранное
              {savedDocuments.length > 0 && (
                <Badge variant="secondary" className="ml-1">{savedDocuments.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Настройки
            </TabsTrigger>
          </TabsList>

          {/* Search Tab */}
          <TabsContent value="search" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Поиск НПА</CardTitle>
                <CardDescription>
                  Введите запрос для поиска нормативных правовых актов
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSearch} className="flex gap-2">
                  <Input
                    placeholder="Например: закон о предпринимательстве"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1"
                  />
                  <Button type="submit" disabled={isSearching || !searchQuery.trim()}>
                    {isSearching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    <span className="ml-2">Найти</span>
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Результаты ({searchResults.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3">
                      {searchResults.map((result, index) => (
                        <div 
                          key={index}
                          className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-sm line-clamp-2">
                                {result.title}
                              </h4>
                              {result.description && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                  {result.description}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1 truncate">
                                {result.url}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleViewDocument(result.url)}
                                disabled={isFetchingDocument}
                              >
                                {isFetchingDocument ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                asChild
                              >
                                <a href={result.url} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Document Tab */}
          <TabsContent value="document" className="space-y-4">
            {selectedDocument ? (
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{selectedDocument.title}</CardTitle>
                      <CardDescription className="truncate max-w-xl">
                        {selectedDocument.url}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={handleSaveDocument}>
                        <Star className="h-4 w-4 mr-2" />
                        В избранное
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleExportDocx}>
                        <FileText className="h-4 w-4 mr-2" />
                        DOCX
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleExportPdf}>
                        <FileDown className="h-4 w-4 mr-2" />
                        PDF
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px] border rounded-lg p-4">
                    <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap">
                      {selectedDocument.cleanText || selectedDocument.content}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Выберите документ из результатов поиска
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Favorites Tab */}
          <TabsContent value="favorites" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Сохранённые документы</CardTitle>
                <CardDescription>
                  Документы, добавленные в избранное
                </CardDescription>
              </CardHeader>
              <CardContent>
                {savedDocuments.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    Нет сохранённых документов
                  </div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3">
                      {savedDocuments.map((doc) => (
                        <div 
                          key={doc.id}
                          className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-sm line-clamp-2">
                                {doc.title}
                              </h4>
                              <p className="text-xs text-muted-foreground mt-1">
                                Сохранено: {format(new Date(doc.created_at), 'dd MMM yyyy, HH:mm', { locale: ru })}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedDocument({
                                    url: doc.ilex_id,
                                    title: doc.title,
                                    content: doc.content || '',
                                    cleanText: doc.content || '',
                                  });
                                  setActiveTab('document');
                                }}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  if (doc.content) {
                                    exportToDocx(doc.content, `${doc.title.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_')}.docx`);
                                  }
                                }}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleDeleteDocument(doc.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Статус подключения</CardTitle>
                <CardDescription>
                  Проверка доступности iLex Private
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {connectionStatus === 'online' ? (
                      <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
                    ) : connectionStatus === 'offline' ? (
                      <div className="h-3 w-3 rounded-full bg-red-500" />
                    ) : (
                      <div className="h-3 w-3 rounded-full bg-gray-400" />
                    )}
                    <div>
                      <p className="font-medium">iLex Private</p>
                      <p className="text-sm text-muted-foreground">ilex-private.ilex.by</p>
                    </div>
                  </div>
                  {getConnectionStatusBadge()}
                </div>
                <Button 
                  className="w-full" 
                  onClick={checkConnection}
                  disabled={connectionStatus === 'checking'}
                >
                  {connectionStatus === 'checking' ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Проверка...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Проверить подключение
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Информация</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Модуль использует Firecrawl для получения данных с iLex Private с имитацией 
                  поведения реального пользователя (случайные задержки, разные User-Agent).
                </p>
                <Separator />
                <p>
                  <strong>Возможности:</strong>
                </p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Поиск нормативных правовых актов</li>
                  <li>Просмотр текста документов</li>
                  <li>Экспорт в DOCX и PDF</li>
                  <li>Сохранение документов в избранное</li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
