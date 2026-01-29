
# План: Исправление крашей редактора Lovable на мобильных устройствах

## Диагностика проблемы

Проект club.gorbova.by крашит редактор Lovable на мобильных устройствах из-за чрезмерного потребления памяти. Другие проекты работают нормально, потому что у них меньше размер bundle.

### Выявленные причины:

| Проблема | Влияние | Файл |
|----------|---------|------|
| 90+ статических импортов в App.tsx | Весь код загружается сразу | `src/App.tsx` |
| 8 компонентов с `import * as XLSX` | +300KB к bundle | Разные файлы |
| `window.location.reload()` в ProtectedRoute | Потенциальные циклы перезагрузки | `src/components/layout/ProtectedRoute.tsx` |
| InboxTabContent: 1021 строк + ResizablePanelGroup | Тяжёлый рендеринг на мобильных | `src/components/admin/communication/InboxTabContent.tsx` |
| AdminKbImport: 1030 строк | Тяжёлый компонент | `src/pages/admin/AdminKbImport.tsx` |

---

## Решение: Code Splitting + Lazy Loading

### Шаг 1: Lazy Loading для тяжёлых admin-страниц

**Файл:** `src/App.tsx`

Заменить статические импорты на динамические для тяжёлых страниц:

```typescript
import { lazy, Suspense } from "react";

// Статические импорты для критичных страниц (первый экран)
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";

// Lazy imports для тяжёлых admin-страниц
const AdminKbImport = lazy(() => import("./pages/admin/AdminKbImport"));
const AdminCommunication = lazy(() => import("./pages/admin/AdminCommunication"));
const AdminPaymentsHub = lazy(() => import("./pages/admin/AdminPaymentsHub"));
const AdminOrdersV2 = lazy(() => import("./pages/admin/AdminOrdersV2"));
const AdminProductsV2 = lazy(() => import("./pages/admin/AdminProductsV2"));
const AdminBepaidArchiveImport = lazy(() => import("./pages/admin/AdminBepaidArchiveImport"));
// ... и другие тяжёлые страницы
```

Обернуть роуты в `<Suspense>`:

```tsx
<Route path="/admin/kb-import" element={
  <ProtectedRoute>
    <Suspense fallback={<PageLoader />}>
      <AdminKbImport />
    </Suspense>
  </ProtectedRoute>
} />
```

### Шаг 2: Lazy Loading для xlsx библиотеки

**Файлы с xlsx:**
- `src/pages/admin/AdminKbImport.tsx`
- `src/components/admin/bepaid/SmartImportDialog.tsx`
- `src/components/admin/bepaid/BepaidImportDialog.tsx`
- и другие

Заменить статический импорт на динамический:

```typescript
// БЫЛО:
import * as XLSX from "xlsx";

// СТАЛО:
const parseExcel = async (file: File) => {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  // ...
};
```

### Шаг 3: Убрать window.location.reload() из ProtectedRoute

**Файл:** `src/components/layout/ProtectedRoute.tsx`

Заменить:
```typescript
// БЫЛО (строка 40):
window.location.reload();

// СТАЛО:
// Не перезагружаем страницу - просто ждём AuthContext
console.log("Session found on retry, waiting for AuthContext sync");
```

### Шаг 4: Упростить InboxTabContent для мобильных

**Файл:** `src/components/admin/communication/InboxTabContent.tsx`

Добавить проверку на мобильное устройство и отключить тяжёлые фичи:

```typescript
const isMobile = window.innerWidth < 768;

// На мобильных не используем ResizablePanelGroup
if (isMobile) {
  return <SimpleMobileInboxLayout dialogs={dialogs} />;
}
```

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `src/App.tsx` | Lazy loading для 15-20 тяжёлых admin-страниц |
| `src/components/layout/ProtectedRoute.tsx` | Убрать window.location.reload() |
| `src/pages/admin/AdminKbImport.tsx` | Динамический import xlsx |
| `src/components/admin/bepaid/*.tsx` | Динамический import xlsx (3 файла) |
| `src/components/admin/communication/InboxTabContent.tsx` | Упрощённый layout для мобильных |

---

## Ожидаемый результат

1. **Начальный bundle уменьшится** на ~40-50% за счёт code splitting
2. **Редактор Lovable перестанет крашиться** на мобильных
3. **Время первой загрузки** сократится
4. **Опубликованное приложение** продолжит работать стабильно

---

## Порядок применения

1. Сначала применяю lazy loading в App.tsx (главное исправление)
2. Затем убираю reload из ProtectedRoute
3. Затем динамический import xlsx в AdminKbImport
4. По желанию — остальные файлы с xlsx

## Важно

Это исправление направлено на **уменьшение размера bundle** и **снижение нагрузки на память**, что должно решить проблему крашей редактора на мобильных. Функциональность приложения не изменится.
