import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { format, subDays, startOfDay, eachDayOfInterval, subMonths } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  UserPlus, 
  UserMinus, 
  Target,
  CalendarIcon,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DateRange } from 'react-day-picker';

interface ClubStatisticsProps {
  clubId: string;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--muted))'];

type DatePreset = '7d' | '14d' | '30d' | '90d' | 'custom';

export function ClubStatistics({ clubId }: ClubStatisticsProps) {
  const queryClient = useQueryClient();
  const [datePreset, setDatePreset] = useState<DatePreset>('30d');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 29),
    to: new Date(),
  });

  // Calculate date range based on preset
  const effectiveDateRange = useMemo(() => {
    switch (datePreset) {
      case '7d':
        return { from: subDays(new Date(), 6), to: new Date() };
      case '14d':
        return { from: subDays(new Date(), 13), to: new Date() };
      case '30d':
        return { from: subDays(new Date(), 29), to: new Date() };
      case '90d':
        return { from: subDays(new Date(), 89), to: new Date() };
      case 'custom':
        return dateRange?.from && dateRange?.to 
          ? { from: dateRange.from, to: dateRange.to }
          : { from: subDays(new Date(), 29), to: new Date() };
      default:
        return { from: subDays(new Date(), 29), to: new Date() };
    }
  }, [datePreset, dateRange]);

  // Fetch access grants for activity chart
  const { data: grantsData, isLoading: grantsLoading, refetch: refetchGrants } = useQuery({
    queryKey: ['club-grants-stats', clubId, effectiveDateRange.from?.toISOString(), effectiveDateRange.to?.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('telegram_access_grants')
        .select('created_at, source, status, revoked_at')
        .eq('club_id', clubId)
        .gte('created_at', effectiveDateRange.from.toISOString())
        .lte('created_at', effectiveDateRange.to.toISOString())
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch logs for activity
  const { data: logsData, isLoading: logsLoading, refetch: refetchLogs } = useQuery({
    queryKey: ['club-logs-stats', clubId, effectiveDateRange.from?.toISOString(), effectiveDateRange.to?.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('telegram_logs')
        .select('created_at, action, status')
        .eq('club_id', clubId)
        .gte('created_at', effectiveDateRange.from.toISOString())
        .lte('created_at', effectiveDateRange.to.toISOString())
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
  });

  // Refresh all statistics
  const handleRefresh = () => {
    refetchGrants();
    refetchLogs();
  };

  // Reset statistics cache
  const handleReset = () => {
    queryClient.invalidateQueries({ queryKey: ['club-grants-stats', clubId] });
    queryClient.invalidateQueries({ queryKey: ['club-logs-stats', clubId] });
    setDatePreset('30d');
    setDateRange({
      from: subDays(new Date(), 29),
      to: new Date(),
    });
  };

  // Calculate days in range
  const daysInRange = useMemo(() => {
    if (!effectiveDateRange.from || !effectiveDateRange.to) return 30;
    const diffTime = Math.abs(effectiveDateRange.to.getTime() - effectiveDateRange.from.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }, [effectiveDateRange]);

  // Calculate activity chart data
  const activityData = useMemo(() => {
    if (!grantsData || !effectiveDateRange.from || !effectiveDateRange.to) return [];

    const days = eachDayOfInterval({
      start: effectiveDateRange.from,
      end: effectiveDateRange.to,
    });

    return days.map(day => {
      const dayStart = startOfDay(day);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const dayGrants = grantsData.filter(g => {
        const created = new Date(g.created_at);
        return created >= dayStart && created < dayEnd;
      });

      const dayRevokes = grantsData.filter(g => {
        if (!g.revoked_at) return false;
        const revoked = new Date(g.revoked_at);
        return revoked >= dayStart && revoked < dayEnd;
      });

      return {
        date: format(day, 'dd.MM', { locale: ru }),
        fullDate: format(day, 'd MMMM', { locale: ru }),
        granted: dayGrants.length,
        revoked: dayRevokes.length,
        net: dayGrants.length - dayRevokes.length,
      };
    });
  }, [grantsData, effectiveDateRange]);

  // Calculate source distribution
  const sourceData = useMemo(() => {
    if (!grantsData) return [];

    const sourceMap: Record<string, number> = {};
    grantsData.forEach(grant => {
      const source = grant.source || 'unknown';
      sourceMap[source] = (sourceMap[source] || 0) + 1;
    });

    const sourceLabels: Record<string, string> = {
      manual: 'Ручная выдача',
      payment: 'Оплата',
      invite: 'Инвайт-код',
      system: 'Система',
      unknown: 'Неизвестно',
    };

    return Object.entries(sourceMap).map(([source, count]) => ({
      name: sourceLabels[source] || source,
      value: count,
    }));
  }, [grantsData]);

  // Calculate conversion stats
  const stats = useMemo(() => {
    if (!grantsData || !logsData) return null;

    const totalGranted = grantsData.length;
    const totalRevoked = grantsData.filter(g => g.status === 'revoked').length;
    const activeNow = grantsData.filter(g => g.status === 'active').length;
    
    const retentionRate = totalGranted > 0 
      ? Math.round((activeNow / totalGranted) * 100) 
      : 0;

    const manualGrants = grantsData.filter(g => g.source === 'manual').length;
    const paidGrants = grantsData.filter(g => g.source === 'payment').length;
    const inviteGrants = grantsData.filter(g => g.source === 'invite').length;

    return {
      totalGranted,
      totalRevoked,
      activeNow,
      retentionRate,
      manualGrants,
      paidGrants,
      inviteGrants,
    };
  }, [grantsData, logsData]);

  if (grantsLoading || logsLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Date Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={datePreset} onValueChange={(val) => setDatePreset(val as DatePreset)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Период" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">7 дней</SelectItem>
            <SelectItem value="14d">14 дней</SelectItem>
            <SelectItem value="30d">30 дней</SelectItem>
            <SelectItem value="90d">90 дней</SelectItem>
            <SelectItem value="custom">Свой период</SelectItem>
          </SelectContent>
        </Select>

        {datePreset === 'custom' && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "justify-start text-left font-normal",
                  !dateRange && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, "dd.MM.yy", { locale: ru })} -{" "}
                      {format(dateRange.to, "dd.MM.yy", { locale: ru })}
                    </>
                  ) : (
                    format(dateRange.from, "dd.MM.yy", { locale: ru })
                  )
                ) : (
                  <span>Выберите даты</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={dateRange?.from}
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={2}
                locale={ru}
                disabled={(date) => date > new Date() || date < subMonths(new Date(), 12)}
              />
            </PopoverContent>
          </Popover>
        )}

        <div className="flex gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Обновить
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-1" />
            Сбросить
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Всего выдано доступов</CardDescription>
            <UserPlus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalGranted || 0}</div>
            <p className="text-xs text-muted-foreground">за {daysInRange} {daysInRange === 1 ? 'день' : daysInRange < 5 ? 'дня' : 'дней'}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Отозвано доступов</CardDescription>
            <UserMinus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalRevoked || 0}</div>
            <p className="text-xs text-muted-foreground">за {daysInRange} {daysInRange === 1 ? 'день' : daysInRange < 5 ? 'дня' : 'дней'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Активных сейчас</CardDescription>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeNow || 0}</div>
            <p className="text-xs text-muted-foreground">участников с доступом</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Удержание</CardDescription>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{stats?.retentionRate || 0}%</span>
              {(stats?.retentionRate || 0) >= 70 ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">активных / выданных</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Activity Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Динамика за период</CardTitle>
            <CardDescription>Выданные и отозванные доступы</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activityData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                    interval={daysInRange > 30 ? Math.floor(daysInRange / 10) : 'preserveStartEnd'}
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const data = payload[0]?.payload;
                      return (
                        <div className="rounded-lg border bg-background p-2 shadow-sm">
                          <div className="font-medium">{data?.fullDate}</div>
                          <div className="text-sm text-green-600">Выдано: {data?.granted}</div>
                          <div className="text-sm text-red-600">Отозвано: {data?.revoked}</div>
                        </div>
                      );
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="granted" 
                    stackId="1"
                    stroke="hsl(var(--primary))" 
                    fill="hsl(var(--primary))" 
                    fillOpacity={0.3}
                    name="Выдано"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="revoked" 
                    stackId="2"
                    stroke="hsl(var(--destructive))" 
                    fill="hsl(var(--destructive))" 
                    fillOpacity={0.3}
                    name="Отозвано"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Source Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Источники доступа</CardTitle>
            <CardDescription>Как пользователи получили доступ</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {sourceData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sourceData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {sourceData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Нет данных за выбранный период
                </div>
              )}
            </div>
            
            {/* Legend */}
            <div className="flex flex-wrap gap-4 justify-center mt-4">
              {sourceData.map((entry, index) => (
                <div key={entry.name} className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-sm">{entry.name}: {entry.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Source breakdown cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Оплаты</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.paidGrants || 0}</div>
            <Badge variant="outline" className="mt-1">
              {stats?.totalGranted && stats.paidGrants 
                ? Math.round((stats.paidGrants / stats.totalGranted) * 100) 
                : 0}% от общего
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ручные выдачи</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.manualGrants || 0}</div>
            <Badge variant="outline" className="mt-1">
              {stats?.totalGranted && stats.manualGrants 
                ? Math.round((stats.manualGrants / stats.totalGranted) * 100) 
                : 0}% от общего
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>По инвайт-кодам</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.inviteGrants || 0}</div>
            <Badge variant="outline" className="mt-1">
              {stats?.totalGranted && stats.inviteGrants 
                ? Math.round((stats.inviteGrants / stats.totalGranted) * 100) 
                : 0}% от общего
            </Badge>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
