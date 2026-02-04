
# План: Критические мелочи — 4 точечных исправления

## Файлы для изменения

| Файл | Изменение |
|------|-----------|
| `VideoUnskippableBlock.tsx` | Origin-check, API-detection deps, сброс таймера |
| `DiagnosticTableBlock.tsx` | Перезапись localRows при получении реальных rows |

---

## 1. Origin-check: корректная проверка поддоменов Kinescope

**Файл:** `VideoUnskippableBlock.tsx`, строки 134-138

**Текущий код:**
```typescript
const originValid = KINESCOPE_ORIGINS.some(o => event.origin === o);
```

**Проблема:** Не покрывает поддомены (`video.kinescope.io`, `embed.kinescope.io`, etc.)

**Исправление:**
```typescript
// Проверка через host: kinescope.io или *.kinescope.io
try {
  const url = new URL(event.origin);
  const host = url.host;
  const originValid = host === 'kinescope.io' || host.endsWith('.kinescope.io');
  if (!originValid) {
    return;
  }
} catch {
  return; // Невалидный origin
}
```

**Результат:** Покрывает все поддомены Kinescope (`player.kinescope.io`, `video.kinescope.io`, `embed.kinescope.io`, etc.)

---

## 2. API-detection effect: зависеть от embedUrl строки

**Файл:** `VideoUnskippableBlock.tsx`, строки 206-223

**Текущий код:**
```typescript
useEffect(() => {
  // ...
  const embedUrl = getEmbedUrl();
  if (embedUrl && content.duration_seconds) {
    // ...
  }
  // ...
}, [isEditing, isCompleted, apiWorking, getEmbedUrl, content.duration_seconds]);
//                                       ^^^^^^^^^^^ функция!
```

**Проблема:** `getEmbedUrl` — функция, может меняться (referential equality) и вызывать лишние перезапуски эффекта.

**Исправление:**
```typescript
// Вычислить embedUrl до эффекта (стабильное значение)
const embedUrl = getEmbedUrl();

useEffect(() => {
  if (isEditing || isCompleted || apiWorking) return;
  
  if (embedUrl && content.duration_seconds) {
    apiDetectionTimeoutRef.current = setTimeout(() => {
      if (!apiWorking) {
        setApiDetectionDone(true);
      }
    }, 5000);
  }
  
  return () => {
    if (apiDetectionTimeoutRef.current) {
      clearTimeout(apiDetectionTimeoutRef.current);
    }
  };
}, [isEditing, isCompleted, apiWorking, embedUrl, content.duration_seconds]);
//                                       ^^^^^^^^ строка!
```

**Результат:** Эффект зависит от стабильной строки, а не от функции.

---

## 3. Сброс таймера при apiWorking=true

**Файл:** `VideoUnskippableBlock.tsx`, строки 163-172

**Текущий код:**
```typescript
if (eventType === 'player:timeupdate' || eventType === 'timeupdate') {
  setApiWorking(true);
  
  // Остановить fallback таймер если был запущен
  if (fallbackIntervalRef.current) {
    clearInterval(fallbackIntervalRef.current);
    // ...
  }
  // ...
}
```

**Проблема:** Не сбрасываем `apiDetectionTimeoutRef` и `apiDetectionDone`. Оверлей может всплыть позже если таймер успел сработать до первого `timeupdate`.

**Исправление:**
```typescript
if (eventType === 'player:timeupdate' || eventType === 'timeupdate') {
  setApiWorking(true);
  
  // Сбросить флаг детекции и её таймер
  setApiDetectionDone(false);
  if (apiDetectionTimeoutRef.current) {
    clearTimeout(apiDetectionTimeoutRef.current);
    apiDetectionTimeoutRef.current = null;
  }
  
  // Остановить fallback таймер если был запущен
  if (fallbackIntervalRef.current) {
    clearInterval(fallbackIntervalRef.current);
    fallbackIntervalRef.current = null;
    setFallbackTimer(null);
  }
  
  // ... остальной код
}
```

**Результат:** Оверлей гарантированно не появится после получения API-событий.

---

## 4. DiagnosticTable: перезапись localRows при получении реальных rows

**Файл:** `DiagnosticTableBlock.tsx`, строки 112-129

**Текущий код:**
```typescript
useEffect(() => {
  if (initDoneRef.current) return; // ← Блокирует обновление!
  
  if (rows.length === 0 && !isCompleted) {
    // Создать пустую строку
    // ...
    initDoneRef.current = true;
  } else if (rows.length > 0) {
    setLocalRows(rows);
    initDoneRef.current = true;
  }
}, [rows, isCompleted, genId]);
```

**Проблема:** 
1. Если сначала `rows=[]` → создаётся пустая строка → `initDoneRef=true`
2. Затем приходят реальные `rows` → но `initDoneRef` уже `true` → данные не применяются

**Исправление:**
```typescript
useEffect(() => {
  // Если пришли реальные данные — ВСЕГДА применить (даже после init)
  if (rows.length > 0) {
    setLocalRows(rows);
    initDoneRef.current = true;
    return;
  }
  
  // Одноразовая инициализация пустой строкой
  if (initDoneRef.current) return;
  
  if (!isCompleted) {
    const newRow: Record<string, unknown> = { _id: genId() };
    columnsRef.current.forEach(col => {
      newRow[col.id] = col.type === 'number' ? 0 : col.type === 'slider' ? 5 : '';
    });
    setLocalRows([newRow]);
    onRowsChangeRef.current?.([newRow]);
    initDoneRef.current = true;
  }
}, [rows, isCompleted, genId]);
```

**Результат:** 
- При `rows=[]` → создаётся пустая строка
- При `rows.length > 0` (данные из БД) → `localRows` перезаписываются реальными данными
- Нет "залипания" пустышки

---

## Итоговые изменения

| Пункт | Строки | Изменение |
|-------|--------|-----------|
| 1 | 134-138 | `host === 'kinescope.io' \|\| host.endsWith('.kinescope.io')` |
| 2 | 206-223 | Deps: `embedUrl` (строка) вместо `getEmbedUrl` (функция) |
| 3 | 163-172 | Добавить `clearTimeout(apiDetectionTimeoutRef)` + `setApiDetectionDone(false)` |
| 4 | 112-129 | Приоритет реальных `rows` над пустой инициализацией |

---

## Минимальный diff

- **VideoUnskippableBlock.tsx:** ~15 строк изменено
- **DiagnosticTableBlock.tsx:** ~8 строк изменено
- Никаких новых файлов
- Никаких изменений в других компонентах
