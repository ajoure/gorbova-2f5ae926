
# План: Восстановление работы Preview на ПК

## Проблема

Preview в Lovable editor показывает **сырой JavaScript код как текст** вместо нормального рендеринга приложения. На скриншоте видны фрагменты:
- `'+` 
- `'Предпросмотр в редакторе lovable.dev на iOS'`
- `document.close(); // Hard stop`

Это происходит на **ПК**, где iOS-guard вообще не должен срабатывать.

## Диагноз

iOS-guard в `index.html` использует агрессивный метод `document.write()` который **полностью переписывает HTML документ**. При определённых условиях (Vite hot-reload, кеширование, race conditions) это может вызвать некорректный рендеринг:

1. **Vite HMR interference** — горячая перезагрузка может "видеть" частично выполненный скрипт
2. **Browser caching** — старая версия index.html может быть закеширована
3. **Script parse timing** — `document.write` до полной загрузки документа может сломать парсинг

## Решение

**Убрать `document.write` из iOS-guard и заменить на безопасный React-based redirect.**

### Изменения

| # | Файл | Действие |
|---|------|----------|
| 1 | `index.html` | Удалить весь iOS guard из `<head>` (строки 8-72) |
| 2 | `src/App.tsx` | Добавить проверку iOS + iframe в начале рендера и показать message-компонент вместо приложения |

### Почему это лучше

1. **Нет `document.write`** — самый опасный метод, который ломает парсинг
2. **React lifecycle** — проверка происходит внутри React после полной загрузки
3. **Безопасный fallback** — если проверка даёт ложный результат, приложение всё равно загрузится
4. **Совместимость с HMR** — Vite hot-reload работает корректно

### Новая логика в App.tsx

```tsx
// В начале App компонента
const isIOSSafariInPreview = useMemo(() => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIOS = /iP(hone|ad|od)/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);
  if (!isIOS || !isSafari) return false;
  
  let inIframe = false;
  try { inIframe = window.self !== window.top; } catch { inIframe = true; }
  const qs = window.location.search || '';
  const hasFlag = qs.includes('forceHideBadge') || qs.includes('lovable') || qs.includes('preview');
  
  return inIframe || hasFlag;
}, []);

if (isIOSSafariInPreview) {
  return <IOSPreviewMessage />;
}
```

### IOSPreviewMessage компонент

Простой компонент с тем же содержимым, что было в `document.write`, но без риска сломать парсинг:

```tsx
function IOSPreviewMessage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-5 text-center">
      <div className="max-w-xs">
        <div className="text-5xl mb-4">📱</div>
        <h2 className="text-slate-800 text-xl font-semibold mb-2">
          Мобильный режим
        </h2>
        <p className="text-slate-500 text-sm leading-relaxed mb-5">
          Предпросмотр в редакторе lovable.dev на iOS перегружает Safari.
          <br />
          Откройте сайт в отдельной вкладке.
        </p>
        <a
          href="https://gorbova.lovable.app"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-6 py-3 bg-blue-500 text-white rounded-xl font-semibold shadow-lg"
        >
          Открыть сайт →
        </a>
        <p className="text-slate-400 text-xs mt-4">
          Desktop preview работает как обычно.
        </p>
      </div>
    </div>
  );
}
```

## Результат

- ✅ Preview на ПК работает нормально
- ✅ iOS Safari в preview показывает message без риска крашей
- ✅ Vite HMR работает корректно
- ✅ Нет `document.write` — нет риска сломать парсинг

## Критерии готовности (DoD)

1. Preview загружается на ПК без отображения сырого кода
2. iOS Safari в preview iframe показывает сообщение "Мобильный режим"
3. Публичный сайт (gorbova.lovable.app) работает на iOS Safari нормально
4. Нет регрессий в функциональности приложения
