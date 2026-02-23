
# Исправление FloatingToolbar — тулбар исчезает после первого показа

## Корневая причина

В `FloatingToolbar.tsx` есть listener `window.addEventListener("scroll", onScroll, true)` с `capture: true`. Это означает, что ЛЮБОЙ скролл в любом элементе на странице (включая контент-область редактора) мгновенно прячет тулбар. После скрытия selection сбрасывается, и тулбар больше не появляется.

Кроме того, `mousedown` listener на document (строка 158) для закрытия подменю конфликтует с работой тулбара.

## Решение

### Файл: `src/components/ui/FloatingToolbar.tsx`

Три точечных исправления:

### 1. Убрать агрессивный scroll listener

Вместо того чтобы скрывать тулбар при любом скролле, нужно **пересчитывать позицию** при скролле. Если selection ещё активна — обновить координаты. Если selection пропала — скрыть.

```typescript
// БЫЛО (строки 146-154):
useEffect(() => {
  const onScroll = () => {
    setVisible(false);
    setShowColors(false);
    setShowSizes(false);
  };
  window.addEventListener("scroll", onScroll, true);
  return () => window.removeEventListener("scroll", onScroll, true);
}, []);

// СТАНЕТ:
useEffect(() => {
  const onScroll = () => {
    // Пересчитать позицию вместо скрытия
    updatePosition();
    setShowColors(false);
    setShowSizes(false);
  };
  window.addEventListener("scroll", onScroll, true);
  return () => window.removeEventListener("scroll", onScroll, true);
}, [updatePosition]);
```

### 2. Исправить mousedown listener

Текущий `handleClick` на `mousedown` может конфликтовать с кликами. Нужно убедиться, что он только закрывает подменю (цвет/размер), но не мешает основному тулбару.

Логика уже правильная (проверяет `toolbarRef.current.contains`), но нужно добавить проверку: если клик внутри `data-rich-editable` элемента — не закрывать подменю сразу, просто пусть `selectionchange` разберётся.

### 3. Добавить защиту от мерцания

При скролле `updatePosition` может вызываться слишком часто. Добавить `requestAnimationFrame` throttle для scroll handler.

```typescript
useEffect(() => {
  let rafId: number | null = null;
  const onScroll = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      updatePosition();
      setShowColors(false);
      setShowSizes(false);
    });
  };
  window.addEventListener("scroll", onScroll, true);
  return () => {
    window.removeEventListener("scroll", onScroll, true);
    if (rafId) cancelAnimationFrame(rafId);
  };
}, [updatePosition]);
```

## Затронутые файлы

| Файл | Действие |
|---|---|
| `src/components/ui/FloatingToolbar.tsx` | Исправить scroll handler (пересчёт позиции вместо скрытия) + RAF throttle |

## Что НЕ трогаем

- RichTextarea.tsx — без изменений
- Блоки конструктора — без изменений
- LessonBlockEditor.tsx — без изменений
- БД — без изменений
