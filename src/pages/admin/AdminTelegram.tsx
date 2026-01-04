import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TelegramBotsTab } from '@/components/telegram/TelegramBotsTab';
import { TelegramClubsTab } from '@/components/telegram/TelegramClubsTab';
import { TelegramLogsTab } from '@/components/telegram/TelegramLogsTab';
import { Bot, Users, FileText } from 'lucide-react';

export default function AdminTelegram() {
  const [activeTab, setActiveTab] = useState('bots');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Telegram</h1>
        <p className="text-muted-foreground">
          Управление ботами, клубами и доступами Telegram
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="bots" className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            Боты
          </TabsTrigger>
          <TabsTrigger value="clubs" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Клубы
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Логи
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bots">
          <TelegramBotsTab />
        </TabsContent>

        <TabsContent value="clubs">
          <TelegramClubsTab />
        </TabsContent>

        <TabsContent value="logs">
          <TelegramLogsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
