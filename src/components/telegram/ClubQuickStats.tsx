import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  Database,
  UserCheck,
  AlertTriangle,
  Clock,
  Shield,
  ShieldAlert,
  Ghost,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TelegramClub, EnrichedClubMember } from "@/hooks/useTelegramIntegration";

// ---------- Типы ----------
interface StatsData {
  total: number;
  orphaned: number;
  relevant: number;
  in_chat: number;
  in_channel: number;
  in_any: number;
  has_active_access: number;
  violators: number;
  bought_not_joined: number;
  unknown: number;
  status_ok: number;
  status_removed: number;
  status_no_access: number;
}

interface ClubQuickStatsProps {
  club: TelegramClub;
  stats: StatsData | null | undefined;
  members: EnrichedClubMember[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
}

// ---------- Одна стеклянная карточка ----------
type CardVariant = "default" | "success" | "warning" | "danger" | "info" | "amber" | "ghost";

const variantStyles: Record<CardVariant, { text: string; iconBg: string }> = {
  default:  { text: "text-white/90",   iconBg: "bg-white/10" },
  success:  { text: "text-emerald-300", iconBg: "bg-emerald-400/15" },
  warning:  { text: "text-amber-300",  iconBg: "bg-amber-400/15" },
  danger:   { text: "text-rose-300",   iconBg: "bg-rose-400/15" },
  info:     { text: "text-sky-300",    iconBg: "bg-sky-400/15" },
  amber:    { text: "text-amber-200",  iconBg: "bg-amber-300/15" },
  ghost:    { text: "text-violet-300", iconBg: "bg-violet-400/15" },
};

interface GlassCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  variant?: CardVariant;
  tooltip?: string;
}

function GlassCard({ title, value, subtitle, icon, variant = "default", tooltip }: GlassCardProps) {
  const s = variantStyles[variant];

  const inner = (
    <div
      className={cn(
        "relative overflow-hidden rounded-[24px] p-3.5",
        "bg-white/[0.06] border border-white/[0.20]",
        "shadow-[0_16px_48px_rgba(0,0,0,0.20),inset_0_0_0_1px_rgba(255,255,255,0.08)]",
        "ring-1 ring-white/[0.08]",
      )}
      style={{
        backdropFilter: "blur(24px) saturate(170%)",
        WebkitBackdropFilter: "blur(24px) saturate(170%)",
      }}
    >
      {/* Glare */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-14 left-[-30%] h-36 w-[160%] rotate-[-12deg] bg-gradient-to-b from-white/25 via-white/8 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-br from-white/8 via-transparent to-white/4" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0 space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/55">
            {title}
          </p>
          <p className={cn("text-xl font-semibold tabular-nums tracking-tight leading-tight", s.text)}>
            {value}
          </p>
          {subtitle && (
            <p className="text-[11px] text-white/45 tabular-nums leading-tight">{subtitle}</p>
          )}
        </div>
        <div className={cn("shrink-0 p-1.5 rounded-xl", s.iconBg)}>
          {icon}
        </div>
      </div>
    </div>
  );

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="cursor-help">{inner}</div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs" side="bottom">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    );
  }

  return inner;
}

// ---------- Информационная строка внизу ----------
interface InfoRowProps {
  label: string;
  value: string | number;
  variant?: "normal" | "warn";
}

function InfoRow({ label, value, variant = "normal" }: InfoRowProps) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-white/55">{label}</span>
      <span
        className={cn(
          "text-[12px] font-semibold tabular-nums",
          variant === "warn" ? "text-amber-300" : "text-white/80"
        )}
      >
        {value}
      </span>
    </div>
  );
}

// ---------- Основной компонент ----------
export function ClubQuickStats({ club, stats, members, isLoading, isError }: ClubQuickStatsProps) {
  // ---- Вычисляем администраторов из загруженных участников ----
  const { adminsCount, adminsWithAccess, adminsWithoutAccess } = (() => {
    if (!members) return { adminsCount: 0, adminsWithAccess: 0, adminsWithoutAccess: 0 };

    const admins = members.filter((m) => {
      const r = m.last_telegram_check_result as Record<string, any> | null;
      const chatStatus = r?.chat?.status ?? r?.status;
      const channelStatus = r?.channel?.status;
      return (
        chatStatus === "administrator" ||
        chatStatus === "creator" ||
        channelStatus === "administrator" ||
        channelStatus === "creator"
      );
    });

    return {
      adminsCount: admins.length,
      adminsWithAccess: admins.filter((m) => m.has_active_access).length,
      adminsWithoutAccess: admins.filter((m) => !m.has_active_access).length,
    };
  })();

  // ---- Незарегистрированные нарушители ----
  // Реально в Telegram (API) – в нашей системе = разница.
  // В системе tracked как in_chat / in_channel.
  const apiChat = club.members_count_chat ?? 0;
  const apiChannel = club.members_count_channel ?? 0;
  const trackedChat = isError ? null : (stats?.in_chat ?? null);
  const trackedChannel = isError ? null : (stats?.in_channel ?? null);

  // Незарегистрированных = «в Telegram но нет в системе»
  const unregisteredChat =
    trackedChat !== null && apiChat > 0 ? Math.max(0, apiChat - trackedChat) : null;
  const unregisteredChannel =
    trackedChannel !== null && apiChannel > 0 ? Math.max(0, apiChannel - trackedChannel) : null;
  const totalUnregistered =
    unregisteredChat !== null || unregisteredChannel !== null
      ? Math.max(unregisteredChat ?? 0, unregisteredChannel ?? 0)
      : null;

  const fmt = (n: number | null | undefined): string =>
    n === null || n === undefined ? "—" : String(n);

  if (isLoading) {
    return (
      <div className="relative isolate rounded-3xl p-4 overflow-hidden">
        <div
          className="absolute inset-0 -z-10"
          style={{ background: "linear-gradient(135deg, #0B2A6F 0%, #123B8B 50%, #0A1E4A 100%)" }}
        />
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-[88px] rounded-[24px] bg-white/10 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative isolate rounded-3xl p-4 overflow-hidden">
      {/* Тёмно-синий фон */}
      <div
        className="absolute inset-0 -z-10"
        style={{ background: "linear-gradient(135deg, #0B2A6F 0%, #123B8B 50%, #0A1E4A 100%)" }}
      />
      {/* Цветовые пятна для глубины */}
      <div className="absolute -z-10 top-[-100px] left-[-100px] h-[300px] w-[300px] rounded-full bg-cyan-400/20 blur-[90px] pointer-events-none" />
      <div className="absolute -z-10 bottom-[-120px] right-[-120px] h-[360px] w-[360px] rounded-full bg-violet-500/15 blur-[110px] pointer-events-none" />

      {/* ---- 6 основных карточек ---- */}
      <div className="relative grid grid-cols-2 md:grid-cols-6 gap-3 mb-3">
        {/* В Telegram (API) */}
        <GlassCard
          title="Telegram API"
          value={apiChat > 0 ? `${apiChat}` : "—"}
          subtitle={apiChannel > 0 ? `Канал: ${apiChannel}` : undefined}
          icon={<MessageSquare className="h-4 w-4 text-sky-300" />}
          variant="info"
          tooltip="Данные Telegram API: реальное кол-во участников в чате и канале (включая ботов и администраторов)"
        />

        {/* В системе (DB) */}
        <GlassCard
          title="В системе"
          value={isError ? "—" : fmt(stats?.in_chat)}
          subtitle={isError ? undefined : `Канал: ${fmt(stats?.in_channel)}`}
          icon={<Database className="h-4 w-4 text-white/70" />}
          variant="default"
          tooltip="Участники, отслеживаемые нашей системой: прошли синхронизацию и подтверждены через getChatMember"
        />

        {/* С доступом */}
        <GlassCard
          title="С доступом"
          value={isError ? "—" : fmt(stats?.has_active_access)}
          icon={<UserCheck className="h-4 w-4 text-emerald-300" />}
          variant="success"
          tooltip="Участники с активной подпиской или ручным доступом"
        />

        {/* Нарушители */}
        <GlassCard
          title="Нарушители"
          value={isError ? "—" : fmt(stats?.violators)}
          icon={<AlertTriangle className="h-4 w-4 text-rose-300" />}
          variant="danger"
          tooltip="Физически присутствуют в чате/канале, но активного доступа нет — подлежат удалению"
        />

        {/* Не вошли */}
        <GlassCard
          title="Не вошли"
          value={isError ? "—" : fmt(stats?.bought_not_joined)}
          icon={<Clock className="h-4 w-4 text-amber-300" />}
          variant="warning"
          tooltip="Доступ выдан, но участник ещё не вступил в чат или канал"
        />

        {/* Не в системе */}
        <GlassCard
          title="Вне системы"
          value={totalUnregistered !== null ? totalUnregistered : "—"}
          icon={<Ghost className="h-4 w-4 text-violet-300" />}
          variant="ghost"
          tooltip={
            `Находятся в Telegram-чате/канале, но не привязали аккаунт к нашей системе — бот не может их удалить.\n` +
            (unregisteredChat !== null ? `Чат: ${unregisteredChat} чел. ` : "") +
            (unregisteredChannel !== null ? `Канал: ${unregisteredChannel} чел.` : "")
          }
        />
      </div>

      {/* ---- Нижняя информационная панель ---- */}
      <div
        className="relative rounded-2xl px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.10)",
          backdropFilter: "blur(16px)",
        }}
      >
        {/* Левая колонка — участники */}
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
            Состав клуба
          </p>
          <InfoRow
            label="Всего в Telegram (чат)"
            value={apiChat > 0 ? apiChat : "нет данных"}
          />
          <InfoRow
            label="Из них с доступом"
            value={isError ? "—" : fmt(stats?.has_active_access)}
          />
          {adminsCount > 0 && (
            <InfoRow label="Администраторы" value={adminsCount} />
          )}
          {adminsWithoutAccess > 0 && (
            <InfoRow
              label="Администраторы без доступа"
              value={adminsWithoutAccess}
              variant="warn"
            />
          )}
        </div>

        {/* Правая колонка — безопасность */}
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
            Безопасность
          </p>
          <InfoRow
            label="Нарушителей (есть в Telegram)"
            value={isError ? "—" : fmt(stats?.violators)}
          />
          <InfoRow
            label="Вне системы (нет в БД)"
            value={totalUnregistered !== null ? totalUnregistered : "нет данных"}
            variant={totalUnregistered !== null && totalUnregistered > 0 ? "warn" : "normal"}
          />
          <InfoRow
            label="Нарушители + вне системы"
            value={
              isError || totalUnregistered === null
                ? "—"
                : (stats?.violators ?? 0) + totalUnregistered
            }
            variant={
              !isError && totalUnregistered !== null &&
              ((stats?.violators ?? 0) + totalUnregistered > 0)
                ? "warn"
                : "normal"
            }
          />
        </div>
      </div>
    </div>
  );
}
