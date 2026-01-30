# План: Синхронный iOS Guard (исправление краша lovable.dev на iPhone)

## Корневая причина проблемы

**Почему текущий guard не работает:**

Текущий `IOSAdminGuard` использует `useEffect`, который срабатывает **после первого рендера**. Это создаёт проблему:

	1.	iOS Safari в lovable.dev открывает URL /admin/payments
	2.	React рендерит App.tsx
	3.	BrowserRouter видит path = /admin/payments
	4.	React-Router СРАЗУ начинает matching маршрутов
	5.	Находит Route для /admin/payments
	6.	Начинает lazy() загрузку AdminPaymentsPage
	7.	ТОЛЬКО ТЕПЕРЬ срабатывает useEffect в IOSAdminGuard
	8.	К этому моменту уже загружаются тяжёлые чанки → iOS краш

**Цепочка событий — визуально:**

Время →
├── BrowserRouter mount
├── Routes matching: /admin/payments ← СРАЗУ находит маршрут
├── lazy() import начинается ← ПРОБЛЕМА: тяжёлый код загружается
├── useEffect guard срабатывает ← СЛИШКОМ ПОЗДНО
└── navigate(’/dashboard’) ← Чанки уже грузятся, память израсходована

## Решение: Синхронная проверка ДО Routes

Нужно проверить условия **синхронно в теле компонента**, ДО того как React-Router начнёт matching:

```typescript
// Синхронная проверка (не useEffect!)
const shouldBlockAdmin = isIOSSafari() && isInPreview() && isAdminRoute();

if (shouldBlockAdmin) {
  // Перенаправляем синхронно, ДО рендера Routes
  return <Navigate to="/dashboard" replace />;
}

Это прервёт рендер до того, как начнётся загрузка тяжёлых чанков.

⸻

Технические изменения

1. Рефакторинг useIOSAdminGuard.ts — добавить синхронную версию

Файл: src/hooks/useIOSAdminGuard.ts

Изменения:
	•	Добавить экспортируемую функцию shouldBlockIOSAdmin() — чистая синхронная проверка (не хук)
	•	Оставить существующий useIOSAdminGuard() как fallback

/**
 * SYNC check: returns true if we should block admin route on iOS
 * Call this in component body (not in useEffect) for immediate redirect
 */
export function shouldBlockIOSAdmin(pathname: string): boolean {
  if (typeof window === 'undefined') return false;
  if (!isIOSSafari()) return false;

  const inPreview = isInIframe() || hasLovablePreviewFlag();
  if (!inPreview) return false;

  return pathname.startsWith('/admin');
}

2. Изменить IOSAdminGuard компонент — синхронный redirect

Файл: src/hooks/useIOSAdminGuard.ts

Компонент IOSAdminGuard теперь будет:
	1.	Читать location.pathname через useLocation()
	2.	Синхронно проверять условия
	3.	Если нужен блок — сразу возвращать <Navigate /> вместо children
	4.	Это предотвратит рендер Routes и lazy-loading

export function IOSAdminGuard({ children }: IOSAdminGuardProps): JSX.Element {
  const location = useLocation();

  // SYNC check - runs BEFORE Routes are rendered
  if (shouldBlockIOSAdmin(location.pathname)) {
    console.info('[iOS Admin Guard] SYNC block at:', location.pathname);
    overwriteLastRoute('/dashboard');
    return createElement(Navigate, { to: '/dashboard', replace: true });
  }

  return createElement(Fragment, null, children);
}

2.1. Важный фикс: Guard должен стоять ВЫШЕ <Routes />

Файл: src/App.tsx (или где собирается Router)

Требование:
	•	IOSAdminGuard должен оборачивать всё дерево, содержащее <Routes />, чтобы <Navigate /> прервал рендер до матчингa маршрутов.

Пример:

<BrowserRouter>
  <IOSAdminGuard>
    <AppProviders>
      <Routes>...</Routes>
    </AppProviders>
  </IOSAdminGuard>
</BrowserRouter>

DoD для этого пункта:
	•	При открытии /admin/* на iOS в preview не появляется спиннер/скелетон админки вообще — сразу показывается /dashboard.

2.2. Доп. предохранитель от “не-админ” тяжёлых страниц (если всё ещё падает)

Если краш продолжается даже на /dashboard, значит тяжело не только /admin/*.
Добавить расширенный список блокируемых путей только для lovable preview на iOS:

const HEAVY_PREFIXES = ['/admin', '/admin/kb-import', '/admin/broadcasts', '/knowledge/import'];
return HEAVY_PREFIXES.some(p => pathname.startsWith(p));

(Добавлять только при подтверждённой необходимости, чтобы не блокировать лишнее.)

⸻

3. Обновить BUILD_MARKER

Файл: src/lib/externalLinkKillSwitch.ts

export const BUILD_MARKER = "build: 2026-01-30T19:30 ios-sync-guard-v7";


⸻

Почему это сработает

Момент	До исправления	После исправления
BrowserRouter mount	✅	✅
IOSAdminGuard render	Проходит насквозь	СТОП: возвращает Navigate
Routes matching	Начинается	НЕ происходит
lazy() import	Загружается	НЕ загружается
Память iOS	Переполняется	В норме


⸻

Изменяемые файлы

Файл	Изменение
src/hooks/useIOSAdminGuard.ts	Добавить синхронную проверку + синхронный Navigate в компоненте
src/App.tsx	(проверить/зафиксить) что IOSAdminGuard стоит выше <Routes />
src/lib/externalLinkKillSwitch.ts	Обновить BUILD_MARKER


⸻

Критерии готовности (DoD)
	1.	На iPhone в lovable.dev редакторе вкладка не падает
	2.	Превью сразу показывает /dashboard, а не спиннер загрузки админки
	3.	В консоли виден лог [iOS Admin Guard] SYNC block
	4.	BUILD_MARKER = ios-sync-guard-v7
	5.	На десктопе поведение не изменено — админка работает

⸻

Риски
	•	Риск минимален: синхронная проверка — это просто if в теле компонента
	•	Не затрагивает никакую другую логику
	•	Работает только на iOS Safari в iframe/preview

