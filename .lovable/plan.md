План: Исправление Pull-to-Refresh (жест не срабатывает)

Диагностика проблемы

Текущая структура DOM

SidebarProvider
└── div.min-h-screen.flex
    ├── AppSidebar
    └── SidebarInset (main.flex-col, NO overflow)
        ├── header (sticky)
        └── PullToRefresh (div.flex-1)
            └── main.overflow-x-hidden (NO overflow-y)
                └── children (страницы со списками)

Выявленные проблемы

#	Проблема	Последствие
1	findScrollableParent(containerRef.current) возвращает null	scrollTop берётся из window.scrollY, а window может быть не в топе
2	scrollTop !== 0 — строгая проверка	На iOS scrollTop часто 1–5px из-за инерции → жест блокируется
3	THRESHOLD_PERCENT = 0.35 (35%)	На iPhone это слишком много px — пользователь не дотягивает
4	Нет fallback на document.scrollingElement	Если нет scrollable parent — поиск останавливается
5	Поиск от containerRef.current вместо e.target	Ищем скролл-контейнер не от места касания
6	touchmove без preventDefault() и/или passive listener	На iOS/Chrome браузер “забирает” жест под нативный scroll/overscroll → pull не срабатывает
7	Нет clamp для threshold	На больших экранах порог становится чрезмерным


⸻

Изменения

Файл: src/components/layout/PullToRefresh.tsx

0) Добавить константы для стабильного UX:

const THRESHOLD_PERCENT = 0.22; // 22% of screen height (was 35%)
const COOLDOWN_MS = 1500;
const HORIZONTAL_LOCK_THRESHOLD = 12;
const TOP_TOLERANCE = 5; // px tolerance for iOS inertia/overscroll
const THRESHOLD_MIN_PX = 90;
const THRESHOLD_MAX_PX = 220;

1) Снизить threshold и сделать clamp:

// БЫЛО:
const THRESHOLD_PERCENT = 0.35;

// СТАНЕТ:
const THRESHOLD_PERCENT = 0.22;

// Расчёт threshold — БЫЛО:
const threshold = typeof window !== 'undefined' 
  ? Math.max(80, window.innerHeight * THRESHOLD_PERCENT) 
  : 120;

// СТАНЕТ (clamp):
const raw = typeof window !== 'undefined' ? window.innerHeight * THRESHOLD_PERCENT : 120;
const threshold = Math.min(THRESHOLD_MAX_PX, Math.max(THRESHOLD_MIN_PX, raw));

2) Ослабить top-check (разрешить погрешность):

// БЫЛО:
if (scrollTop !== 0) return;

// СТАНЕТ:
if (scrollTop > TOP_TOLERANCE) return;

3) Искать scroll container от e.target + добавить fallback (и безопасный Element/closest):

// handleTouchStart — БЫЛО:
const scrollContainer = findScrollableParent(containerRef.current);

// СТАНЕТ:
const targetEl = (e.target as Element | null) ?? null;
const startFrom = (targetEl && (targetEl as any).closest) ? (targetEl as Element) : (e.currentTarget as Element);

const scrollContainer =
  findScrollableParent(startFrom as HTMLElement)
  ?? (document.scrollingElement as HTMLElement | null);

4) Аналогично в handleTouchMove — ослабить проверку:

// БЫЛО:
if (scrollTop > 0) {
  resetPull();
  return;
}

// СТАНЕТ:
if (scrollTop > TOP_TOLERANCE) {
  resetPull();
  return;
}

5) Включить управление жестом: touchmove non-passive + preventDefault() только при реальном pull

Важно: preventDefault() вызывать только когда:
(а) тянем вниз (dy > 0), (б) мы на верхушке (scrollTop <= TOP_TOLERANCE), (в) жест не горизонтальный.

// При подписке на события (или addEventListener):
// touchmove должен быть non-passive
element.addEventListener('touchmove', handleTouchMove, { passive: false });

// В handleTouchMove (псевдо-логика):
if (dy > 0 && scrollTop <= TOP_TOLERANCE && !isHorizontalGesture) {
  e.preventDefault(); // иначе браузер забирает overscroll
}


⸻

Итоговый diff (концептуально)

// Constants
const THRESHOLD_PERCENT = 0.22;
const TOP_TOLERANCE = 5;
const THRESHOLD_MIN_PX = 90;
const THRESHOLD_MAX_PX = 220;

// handleTouchStart:
const targetEl = (e.target as Element | null) ?? null;
const startFrom = (targetEl && (targetEl as any).closest) ? targetEl : (e.currentTarget as Element);

const scrollContainer =
  findScrollableParent(startFrom as HTMLElement)
  ?? (document.scrollingElement as HTMLElement | null);

const scrollTop = scrollContainer ? scrollContainer.scrollTop : window.scrollY;
if (scrollTop > TOP_TOLERANCE) return;

// handleTouchMove:
if (scrollTop > TOP_TOLERANCE) { resetPull(); return; }

if (dy > 0 && scrollTop <= TOP_TOLERANCE && !isHorizontalGesture) {
  e.preventDefault();
}

// threshold:
const raw = typeof window !== 'undefined' ? window.innerHeight * THRESHOLD_PERCENT : 120;
const threshold = Math.min(THRESHOLD_MAX_PX, Math.max(THRESHOLD_MIN_PX, raw));


⸻

Изменяемые файлы

Файл	Изменения
src/components/layout/PullToRefresh.tsx	threshold 0.22 + clamp, TOP_TOLERANCE=5, scroll container от e.target + fallback, touchmove non-passive + preventDefault() при pull


⸻

DoD

После изменений:
	1.	Обычный скролл по списку НЕ вызывает refresh
	2.	Pull от середины списка — НЕ вызывает refresh
	3.	Намеренный pull от верха списка (превысил threshold) вызывает refresh
	4.	На iOS работает стабильно (не блокируется из-за 1–5px scrollTop)
	5.	Горизонтальные жесты игнорируются
	6.	preventDefault() не ломает обычный скролл (вызывается только при активном pull)
	7.	Виден визуальный индикатор при pull
	8.	Cooldown (1.5s) работает, быстрый повторный pull не срабатывает

⸻

Тест-кейсы
	•	Обычный скролл списка вниз/вверх — без refresh
	•	Pull от середины списка — без refresh
	•	Pull от верха списка <90px — без refresh (не достигнут порог)
	•	Pull от верха списка ~180px на iPhone — refresh срабатывает
	•	Горизонтальный swipe — без refresh
	•	Быстрый повторный pull (<1.5s) — cooldown работает
	•	iOS Safari: жест срабатывает (пруф: видео/скрин-рекордер)
	•	Android Chrome: нет конфликтов со скроллом, refresh срабатывает только от top

⸻
