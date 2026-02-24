

# Исправление формата времени в аудиоплеере

## Проблема

Функция `formatTime` в `CustomAudioPlayer.tsx` отображает время только в формате `MM:SS`. Для длинных аудио (например, 4+ часа) это даёт `289:45` вместо `04:49:45`.

## Решение

Обновить функцию `formatTime` (строки 27-31) для поддержки формата `HH:MM:SS` при длительности ≥ 1 часа:

```typescript
function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "00:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) {
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
```

## Затронутые файлы

| Файл | Действие |
|---|---|
| `src/components/ui/CustomAudioPlayer.tsx` | Обновить `formatTime` — добавить часы |

## Что НЕ трогаем

Всё остальное без изменений.

