import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Trash2 } from 'lucide-react';
import { 
  TelegramClub, 
  TelegramBot,
  useUpdateTelegramClub,
  useDeleteTelegramClub,
} from '@/hooks/useTelegramIntegration';
import { HelpLabel } from '@/components/help/HelpComponents';

interface ClubSettingsDialogProps {
  club: TelegramClub | null;
  bots: TelegramBot[];
  onClose: () => void;
}

export function ClubSettingsDialog({ club, bots, onClose }: ClubSettingsDialogProps) {
  const updateClub = useUpdateTelegramClub();
  const deleteClub = useDeleteTelegramClub();
  
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [formData, setFormData] = useState({
    club_name: club?.club_name || '',
    bot_id: club?.bot_id || '',
    chat_invite_link: club?.chat_invite_link || '',
    channel_invite_link: club?.channel_invite_link || '',
    access_mode: club?.access_mode || 'AUTO_WITH_FALLBACK',
    revoke_mode: club?.revoke_mode || 'KICK_ONLY',
    subscription_duration_days: club?.subscription_duration_days || 30,
  });

  // Update form when club changes
  useState(() => {
    if (club) {
      setFormData({
        club_name: club.club_name,
        bot_id: club.bot_id,
        chat_invite_link: club.chat_invite_link || '',
        channel_invite_link: club.channel_invite_link || '',
        access_mode: club.access_mode,
        revoke_mode: club.revoke_mode,
        subscription_duration_days: club.subscription_duration_days,
      });
    }
  });

  const handleSave = async () => {
    if (!club) return;
    
    await updateClub.mutateAsync({
      id: club.id,
      ...formData,
    });
    onClose();
  };

  const handleDelete = async () => {
    if (!club) return;
    
    await deleteClub.mutateAsync(club.id);
    setShowDeleteDialog(false);
    onClose();
  };

  const activeBots = bots.filter(b => b.status === 'active');

  return (
    <>
      <Dialog open={!!club} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Настройки клуба</DialogTitle>
            <DialogDescription>
              Редактирование параметров клуба {club?.club_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="club_name">Название клуба</Label>
              <Input
                id="club_name"
                value={formData.club_name}
                onChange={(e) => setFormData({ ...formData, club_name: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="bot_id">Бот</Label>
              <Select
                value={formData.bot_id}
                onValueChange={(value) => setFormData({ ...formData, bot_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите бота" />
                </SelectTrigger>
                <SelectContent>
                  {activeBots.map((bot) => (
                    <SelectItem key={bot.id} value={bot.id}>
                      {bot.bot_name} (@{bot.bot_username})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="chat_invite_link">Инвайт-ссылка на чат</Label>
              <Input
                id="chat_invite_link"
                placeholder="https://t.me/+..."
                value={formData.chat_invite_link}
                onChange={(e) => setFormData({ ...formData, chat_invite_link: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="channel_invite_link">Инвайт-ссылка на канал</Label>
              <Input
                id="channel_invite_link"
                placeholder="https://t.me/+..."
                value={formData.channel_invite_link}
                onChange={(e) => setFormData({ ...formData, channel_invite_link: e.target.value })}
              />
            </div>

            <div>
              <HelpLabel helpKey="telegram.access_mode" htmlFor="access_mode">
                Режим доступа
              </HelpLabel>
              <Select
                value={formData.access_mode}
                onValueChange={(value) => setFormData({ ...formData, access_mode: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AUTO_ADD">Автодобавление</SelectItem>
                  <SelectItem value="INVITE_ONLY">Только ссылки</SelectItem>
                  <SelectItem value="AUTO_WITH_FALLBACK">Авто + ссылки (fallback)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="subscription_duration_days">Длительность подписки (дней)</Label>
              <Input
                id="subscription_duration_days"
                type="number"
                value={formData.subscription_duration_days}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  subscription_duration_days: parseInt(e.target.value) || 30 
                })}
              />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              variant="destructive" 
              onClick={() => setShowDeleteDialog(true)}
              className="sm:mr-auto"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Удалить клуб
            </Button>
            <Button variant="outline" onClick={onClose}>
              Отмена
            </Button>
            <Button onClick={handleSave} disabled={updateClub.isPending}>
              {updateClub.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Сохранить'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить клуб?</AlertDialogTitle>
            <AlertDialogDescription>
              Клуб "{club?.club_name}" будет удалён. Все записи о доступе и участниках будут потеряны.
              Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteClub.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Удалить'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
