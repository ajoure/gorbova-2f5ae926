import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  User, 
  MessageSquare, 
  Megaphone, 
  CheckCircle, 
  XCircle, 
  CreditCard,
  History,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { 
  TelegramClubMember,
  useUserAccessGrants,
} from '@/hooks/useTelegramIntegration';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

interface MemberDetailsDrawerProps {
  member: TelegramClubMember | null;
  onClose: () => void;
}

export function MemberDetailsDrawer({ member, onClose }: MemberDetailsDrawerProps) {
  const userId = member?.profiles?.user_id;
  
  // Fetch access grants history
  const { data: accessGrants, isLoading: grantsLoading } = useUserAccessGrants(userId || null);

  // Fetch orders/purchases
  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ['user-orders', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('orders')
        .select('*, products(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'order': return 'Заказ';
      case 'payment': return 'Платёж';
      case 'manual': return 'Ручная выдача';
      case 'subscription': return 'Подписка';
      default: return source;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return 'Активен';
      case 'expired': return 'Истёк';
      case 'revoked': return 'Отозван';
      case 'paid': return 'Оплачен';
      case 'pending': return 'Ожидает';
      case 'failed': return 'Ошибка';
      default: return status;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
      case 'paid':
        return <Badge className="bg-green-500/10 text-green-600">{getStatusLabel(status)}</Badge>;
      case 'expired':
        return <Badge variant="secondary">{getStatusLabel(status)}</Badge>;
      case 'revoked':
      case 'failed':
        return <Badge variant="destructive">{getStatusLabel(status)}</Badge>;
      default:
        return <Badge variant="outline">{getStatusLabel(status)}</Badge>;
    }
  };

  return (
    <Sheet open={!!member} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Карточка участника
          </SheetTitle>
        </SheetHeader>

        {member && (
          <div className="mt-6 space-y-6">
            {/* Summary */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Сводка</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Telegram</span>
                  <span className="font-medium">
                    {member.telegram_username ? `@${member.telegram_username}` : `ID: ${member.telegram_user_id}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Имя в TG</span>
                  <span>{member.telegram_first_name} {member.telegram_last_name}</span>
                </div>
                {member.profiles && (
                  <>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ФИО</span>
                      <span>{member.profiles.full_name || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Email</span>
                      <span>{member.profiles.email || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Телефон</span>
                      <span>{member.profiles.phone || '—'}</span>
                    </div>
                  </>
                )}
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Статус доступа</span>
                  {member.access_status === 'ok' ? (
                    <Badge className="bg-green-500/10 text-green-600 gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Разрешён
                    </Badge>
                  ) : member.access_status === 'no_access' ? (
                    <Badge variant="destructive" className="gap-1">
                      <XCircle className="h-3 w-3" />
                      Нет доступа
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {member.access_status}
                    </Badge>
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <MessageSquare className="h-4 w-4" />
                    В чате
                  </span>
                  {member.in_chat ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Megaphone className="h-4 w-4" />
                    В канале
                  </span>
                  {member.in_channel ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Tabs for history */}
            {member.profiles && (
              <Tabs defaultValue="access" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="access" className="gap-1">
                    <History className="h-4 w-4" />
                    Доступ
                  </TabsTrigger>
                  <TabsTrigger value="purchases" className="gap-1">
                    <CreditCard className="h-4 w-4" />
                    Покупки
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="access" className="mt-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">История доступа</CardTitle>
                      <CardDescription>Все выдачи и отзывы доступа</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {grantsLoading ? (
                        <div className="flex justify-center py-4">
                          <Loader2 className="h-5 w-5 animate-spin" />
                        </div>
                      ) : accessGrants && accessGrants.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Клуб</TableHead>
                              <TableHead>Тип</TableHead>
                              <TableHead>Период</TableHead>
                              <TableHead>Статус</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {accessGrants.map((grant) => (
                              <TableRow key={grant.id}>
                                <TableCell className="font-medium">
                                  {grant.telegram_clubs?.club_name || '—'}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline">{getSourceLabel(grant.source)}</Badge>
                                </TableCell>
                                <TableCell className="text-sm">
                                  <div>{format(new Date(grant.start_at), 'dd.MM.yy', { locale: ru })}</div>
                                  {grant.end_at && (
                                    <div className="text-muted-foreground">
                                      до {format(new Date(grant.end_at), 'dd.MM.yy', { locale: ru })}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>{getStatusBadge(grant.status)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <p className="text-center text-muted-foreground py-4">
                          Нет записей о доступе
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="purchases" className="mt-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">История покупок</CardTitle>
                      <CardDescription>Все заказы и платежи</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {ordersLoading ? (
                        <div className="flex justify-center py-4">
                          <Loader2 className="h-5 w-5 animate-spin" />
                        </div>
                      ) : orders && orders.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Дата</TableHead>
                              <TableHead>Продукт</TableHead>
                              <TableHead>Сумма</TableHead>
                              <TableHead>Статус</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {orders.map((order) => (
                              <TableRow key={order.id}>
                                <TableCell className="text-sm">
                                  {format(new Date(order.created_at), 'dd.MM.yy HH:mm', { locale: ru })}
                                </TableCell>
                                <TableCell className="font-medium">
                                  {order.products?.name || '—'}
                                </TableCell>
                                <TableCell>
                                  {(order.amount / 100).toFixed(2)} {order.currency}
                                </TableCell>
                                <TableCell>{getStatusBadge(order.status)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <p className="text-center text-muted-foreground py-4">
                          Нет покупок
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}

            {/* Unlinked user warning */}
            {!member.profiles && (
              <Card className="border-destructive/50 bg-destructive/5">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                    <div>
                      <p className="font-medium">Telegram не связан с аккаунтом</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Этот пользователь находится в чате/канале, но не имеет привязанного аккаунта в системе.
                        Он будет помечен как нарушитель и может быть удалён.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
