PATCH P0.9.10 — Фикс прогресса видео + сохранение select в диагностической таблице

Проблема 1: Прогресс видео застревает на низких % (3%, 6%, 13%)

Корневая причина

API Kinescope IframePlayer у многих пользователей ненадёжно отправляет события timeupdate. Логика Math.max(prev, percent) правильная (прогресс монотонно растёт), но когда API не присылает события, прогресс остаётся почти на нуле.

Fallback-таймер есть, но:
	•	Требует, чтобы пользователь вручную нажал кнопку “Start View”
	•	Использует захардкоженный duration_seconds, который может не совпадать с реальной длительностью видео
	•	Не стартует автоматически: если пользователь просто смотрит видео “как обычно”, прогресс не трекается

Исправление

Автоматически запускать fallback-таймер, если Kinescope API не ответил в течение 3 секунд и видео видно на экране. Убрать необходимость ручного клика “Start View” в fallback-сценарии без API.

Файл: src/components/admin/lesson-editor/blocks/VideoUnskippableBlock.tsx

Изменения:
	1.	После того как apiDetectionDone становится true (таймаут 3 секунды) и API не работает, автоматически стартовать fallback-таймер вместо показа кнопки “Start View”.
	2.	Если задан duration_seconds и API упал, начинать отсчёт автоматически с момента детекта.
	3.	Оставить кнопку “Start View” только как вторичное действие (например, если пользователь хочет перезапустить таймер).

⸻

Проблема 2: Поля select в диагностической таблице не сохраняются

Корневая причина

В DiagnosticTableBlock.tsx обработчик select (onValueChange) (строки 427–433 для вертикального, 506–513 для горизонтального) вызывает onRowsChange?.(newRows) как сайд-эффект внутри колбэка setLocalRows. Это хрупко в React 18 из-за batching.

Более критично: onRowsChange вызывает updateState в useLessonProgressState, где запись в БД дебаунсится на 500мс. Если пользователь нажимает “Complete” или уходит со страницы в это окно, данные теряются.

Исправление

Привести обработку select к тому же паттерну, что у text/number: updateLocalRow + debouncedCommit, чтобы поведение было единообразным и flush гарантированно срабатывал на Complete.

Файл: src/components/admin/lesson-editor/blocks/DiagnosticTableBlock.tsx

Изменения:
	1.	Заменить inline select onValueChange (и в horizontal, и в vertical) на вызов updateLocalRow(rowIndex, col.id, v) — как у text/number.
	2.	Это проведёт изменения через debouncedCommit (300мс), который корректно flush-ится через flushAndCommit при нажатии кнопки “Complete”.
	3.	Также сохранится корректная логика flush на unmount.

Конкретные изменения кода

Horizontal layout select (строки 506–513):

// БЫЛО:
onValueChange={(v) => {
  setLocalRows((prev) => {
    const newRows = [...prev];
    newRows[rowIndex] = { ...newRows[rowIndex], [col.id]: v };
    onRowsChange?.(newRows);
    return newRows;
  });
}}

// СТАЛО:
onValueChange={(v) => updateLocalRow(rowIndex, col.id, v)}

Vertical layout select (строки 427–433):
То же изменение — заменить inline обработчик на updateLocalRow(rowIndex, col.id, v).

⸻

Файлы для изменения

Файл	Изменения
src/components/admin/lesson-editor/blocks/DiagnosticTableBlock.tsx	Заменить 2 обработчика select на вызов updateLocalRow
src/components/admin/lesson-editor/blocks/VideoUnskippableBlock.tsx	Автостарт fallback-таймера при фейле API


⸻

Что НЕ трогаем
	•	Логику Math.max для видео (она правильная)
	•	Дебаунс-таймеры в useLessonProgressState (они работают корректно)
	•	KvestLessonView.tsx (правки не нужны)
	•	Другие типы блоков

⸻

DoD
	1.	Поля select (риски, тип дохода) сохраняются после перезагрузки страницы — SQL-пруф из lesson_progress_state
	2.	Fallback-таймер для видео запускается автоматически при фейле Kinescope API без ручного клика
	3.	Нет регрессий для text/number/slider (они уже используют updateLocalRow)
	4.	Кнопка Complete по-прежнему flush-ит все отложенные изменения перед отметкой завершения