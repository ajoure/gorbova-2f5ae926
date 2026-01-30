# План v8: Ультра-ранний iOS Guard + Диагностика

## Анализ текущего состояния

Guard v7 реализован корректно:
- Синхронная проверка в теле компонента (не useEffect)
- Стоит ВНУТРИ BrowserRouter, ВЫШЕ Routes
- Возвращает <Navigate /> немедленно

**Но проблема остаётся.** Это означает одно из трёх:

1) Guard не успевает отработать — краш/перезагрузка происходит ДО первого рендера IOSAdminGuard (или ДО выполнения main.tsx)
2) Тяжесть не в /admin, а в другом автосценарии (например, Excel runtime/парсер подтягивается косвенно или выполняется ещё до UI)
3) lovable.dev editor на iOS Safari сам по себе на грани лимита памяти, и любое “лишнее” в превью вызывает перезагрузку

Чтобы получить детерминированный ответ и убрать автокраш — добавляем **3 уровня защиты ДО React**, плюс **жёсткую диагностику** и **hard-stop для Excel в iOS preview**.

---

## Технические изменения

### 0) STOP-принципы (обязательные)
- Add-only: не ломать существующие фичи, только предохранители/логи.
- Все guards включаются ТОЛЬКО для iOS Safari + preview/iframe.
- Никаких новых тяжёлых зависимостей.
- DoD принимается только по факту: iPhone lovable.dev перестал перезагружаться.

---

### 1) Ультра-ранний guard в index.html (до загрузки React)

Файл: `index.html` (или `public/index.html` — фактический путь в проекте)

Добавить inline-скрипт ПЕРЕД загрузкой main.tsx / bundle:

```html
<script>
  // Ultra-early iOS Safari guard - runs BEFORE React loads
  (function () {
    try {
      var ua = navigator.userAgent || '';
      var isIOS = /iP(hone|ad|od)/.test(ua);
      var isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);

      var inIframe = false;
      try { inIframe = window.self !== window.top; } catch (e) { inIframe = true; }

      // lovable preview markers (keep both)
      var hasPreviewFlag =
        (window.location.search || '').indexOf('forceHideBadge') > -1 ||
        (window.location.search || '').indexOf('lovable') > -1 ||
        (window.location.search || '').indexOf('preview') > -1;

      var isPreview = inIframe || hasPreviewFlag;

      // Block ONLY heavy routes (start with /admin, can extend later)
      var path = window.location.pathname || '';
      var isAdmin = path.indexOf('/admin') === 0;

      if (isIOS && isSafari && isPreview && isAdmin) {
        console.warn('[iOS Ultra-Early Guard] Blocking admin route BEFORE React:', path);
        // hard redirect before any JS bundles allocate memory
        window.history.replaceState(null, '', '/dashboard');
        window.location.replace('/dashboard');
      }
    } catch (e) {
      // fail-open: do nothing if guard crashes
    }
  })();
</script>

DoD-1:
	•	На iPhone lovable.dev при открытии проекта с URL /admin/* — URL мгновенно становится /dashboard ещё до React.

⸻

2) Диагностика на самом старте main.tsx (понять, доходит ли выполнение до React)

Файл: src/main.tsx

Добавить первые строки САМЫМ ВЕРХОМ (до createRoot/React render):

console.info('[Main] Starting React app');
console.info('[Main] build marker:', (window as any).__BUILD_MARKER__ || 'no-global-marker');
console.info('[Main] pathname:', window.location.pathname);
console.info('[Main] search:', window.location.search);
console.info('[Main] userAgent:', navigator.userAgent);
console.info('[Main] inIframe:', (() => { try { return window.self !== window.top; } catch { return true; } })());

DoD-2:
	•	В консоли iPhone видно [Main] Starting React app (если не видно — значит краш ДО React и важнее index.html guard / тяжелый bundle).

⸻

3) Emergency guard в module scope (App.tsx) + расширение блокировки

Файл: src/App.tsx

Добавить emergency guard на уровне module evaluation time (самый верх файла, до export):

(function emergencyIOSGuard() {
  if (typeof window === 'undefined') return;

  const ua = navigator.userAgent || '';
  const isIOS = /iP(hone|ad|od)/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);

  let inIframe = false;
  try { inIframe = window.self !== window.top; } catch { inIframe = true; }

  const qs = window.location.search || '';
  const isPreview = inIframe || qs.includes('forceHideBadge') || qs.includes('lovable') || qs.includes('preview');

  const path = window.location.pathname || '';
  const shouldBlock =
    isIOS &&
    isSafari &&
    isPreview &&
    (
      path.startsWith('/admin')
      // расширяем список при необходимости:
      // || path.startsWith('/admin/kb-import')
      // || path.startsWith('/admin/broadcasts')
    );

  if (shouldBlock) {
    console.warn('[App Emergency Guard] Blocking heavy route at module load:', path);
    window.history.replaceState(null, '', '/dashboard');
    // НЕ location.replace здесь — пусть React Router/guard v7 уже рендерит dashboard,
    // а index.html guard берёт на себя самый ранний redirect.
  }
})();

DoD-3:
	•	Даже если index.html guard не сработал (например, из-за структуры сборки), в логах видно [App Emergency Guard] ... и путь становится /dashboard до матчинг Routes.

⸻

4) HARD STOP для Excel в iOS preview (чтобы подтвердить/устранить регресс)

Ключевая гипотеза: регресс связан с Excel — он попадает в ранний runtime через barrel export / side-effect import / prefetch и убивает память iOS.

Файл (новый): src/lib/iosPreviewHardStops.ts

export function isIOSSafari(): boolean {
  const ua = navigator.userAgent || '';
  const isIOS = /iP(hone|ad|od)/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);
  return isIOS && isSafari;
}

export function isInPreviewContext(): boolean {
  let inIframe = false;
  try { inIframe = window.self !== window.top; } catch { inIframe = true; }
  const qs = window.location.search || '';
  return inIframe || qs.includes('forceHideBadge') || qs.includes('lovable') || qs.includes('preview');
}

/**
 * Hard stop for XLSX import on iOS Safari in lovable preview.
 * Must be called right before dynamic import('xlsx').
 */
export function assertExcelAllowedOrThrow(): void {
  if (typeof window === 'undefined') return;
  if (isIOSSafari() && isInPreviewContext()) {
    throw new Error('Excel disabled in iOS lovable preview (hard stop)');
  }
}

Затем во ВСЕХ местах, где есть await import('xlsx'), добавить проверку прямо перед импортом:

assertExcelAllowedOrThrow();
const XLSX = await import('xlsx');

И обработать ошибку:
	•	показать toast: “Excel-импорт недоступен в preview на iOS. Откройте с компьютера.”
	•	и НЕ продолжать парсинг.

DoD-4:
	•	На iPhone lovable.dev любые кнопки/страницы импорта не приводят к крашу; вместо этого — понятный toast.
	•	На десктопе Excel работает как раньше.

⸻

5) BUILD_MARKER (верификация, что реально на новой сборке)

Файл: src/lib/externalLinkKillSwitch.ts

export const BUILD_MARKER = "build: 2026-01-30T20:30 ios-ultra-early-guard-v8";

Дополнительно (чтобы main.tsx мог прочитать):
В любом раннем месте (например, в src/main.tsx после логов):

(window as any).__BUILD_MARKER__ = "ios-ultra-early-guard-v8";

DoD-5:
	•	В консоли iPhone видно build marker v8.

⸻

Цепочка защиты (3 уровня + Excel hard stop)

Уровень	Где	Когда срабатывает	Что предотвращает
1) Ultra-early	index.html	ДО загрузки JS	автозагрузка /admin в preview
2) Emergency	App.tsx (module scope)	При оценке модуля	ранний матчинг/ленивая подгрузка
3) Sync guard	IOSAdminGuard v7	До Routes render	защита на уровне Router
4) Excel hard stop	перед import(‘xlsx’)	до загрузки XLSX	iOS memory crash из-за XLSX


⸻

Изменяемые файлы

Файл	Изменение
index.html	Inline ultra-early guard
src/main.tsx	Стартовые диагностические логи + глобальный build marker
src/App.tsx	Emergency guard module scope
Новый: src/lib/iosPreviewHardStops.ts	isIOSSafari/isPreview + assertExcelAllowedOrThrow
src/pages/admin/AdminKbImport.tsx и все XLSX места	вызвать assertExcelAllowedOrThrow перед import(‘xlsx’)
src/lib/externalLinkKillSwitch.ts	BUILD_MARKER v8


⸻

Критерии готовности (DoD)
	1.	На iPhone в lovable.dev: вкладка НЕ падает/не перезагружается при открытии проекта
	2.	При URL /admin/* происходит мгновенный уход на /dashboard (в т.ч. до React)
	3.	В консоли iPhone видны:
	•	[iOS Ultra-Early Guard] ... (если стартовали с /admin)
	•	[Main] Starting React app (если дошли до React)
	•	[App Emergency Guard] ... (если сработал module-scope)
	4.	BUILD_MARKER = ios-ultra-early-guard-v8
	5.	Excel-импорт в iOS preview НЕ крашит: вместо этого toast “Excel недоступен в preview на iOS”
	6.	Desktop не сломан: админка/импорт Excel работает как раньше

⸻

Альтернатива (если v8 не поможет)

Если после v8 всё равно происходит перезагрузка ДО появления [Main] Starting React app, значит:
	•	lovable.dev editor на iOS Safari сам по себе превышает лимит памяти,
	•	и наша страница не успевает даже стартовать.

Тогда единственный рабочий процесс:
	•	не использовать lovable.dev editor на iPhone,
	•	открывать либо с десктопа, либо прямой preview URL (без редактора), если он доступен в вашем окружении.

⸻

Риски
	•	Inline-скрипт в index.html минимальный и изолирован; работает только на iOS Safari + preview.
	•	Excel hard stop влияет только на lovable preview на iOS; production/desktop не затрагивает.

