import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  useCurrentUserTelegramStatus, 
  useGenerateTelegramLinkToken 
} from '@/hooks/useTelegramIntegration';
import { Loader2, Link2, CheckCircle, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

interface TelegramLinkButtonProps {
  botUsername?: string;
}

export function TelegramLinkButton({ botUsername = 'fsby_bot' }: TelegramLinkButtonProps) {
  const { data: status, isLoading } = useCurrentUserTelegramStatus();
  const generateToken = useGenerateTelegramLinkToken();
  const [linkUrl, setLinkUrl] = useState<string | null>(null);

  const handleGenerateLink = async () => {
    const tokenData = await generateToken.mutateAsync();
    if (tokenData) {
      const url = `https://t.me/${botUsername}?start=${tokenData.token}`;
      setLinkUrl(url);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (status?.isLinked) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            Telegram привязан
          </CardTitle>
          <CardDescription>
            @{status.profile?.telegram_username || 'пользователь'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            Привязан {status.profile?.telegram_linked_at && 
              format(new Date(status.profile.telegram_linked_at), 'd MMMM yyyy', { locale: ru })}
          </div>
          {status.access && status.access.length > 0 && (
            <div className="mt-3 space-y-2">
              {status.access.map((acc: { id: string; telegram_clubs?: { club_name: string }; state_chat: string; state_channel: string; active_until: string | null }) => (
                <div key={acc.id} className="flex items-center justify-between">
                  <span className="text-sm">{acc.telegram_clubs?.club_name || 'Клуб'}</span>
                  <div className="flex gap-2">
                    <Badge variant={acc.state_chat === 'active' ? 'default' : 'secondary'}>
                      Чат: {acc.state_chat === 'active' ? 'активен' : 'нет'}
                    </Badge>
                    <Badge variant={acc.state_channel === 'active' ? 'default' : 'secondary'}>
                      Канал: {acc.state_channel === 'active' ? 'активен' : 'нет'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Привязать Telegram
        </CardTitle>
        <CardDescription>
          Привяжите Telegram для доступа к закрытому клубу
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {linkUrl ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Нажмите на кнопку ниже, чтобы открыть бота и привязать аккаунт:
            </p>
            <Button asChild className="w-full">
              <a href={linkUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Открыть бота @{botUsername}
              </a>
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Ссылка действительна 15 минут
            </p>
          </div>
        ) : (
          <Button 
            onClick={handleGenerateLink} 
            disabled={generateToken.isPending}
            className="w-full"
          >
            {generateToken.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Генерация...
              </>
            ) : (
              <>
                <Link2 className="h-4 w-4 mr-2" />
                Привязать Telegram
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
