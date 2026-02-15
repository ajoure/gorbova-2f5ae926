
# Исправление Push-уведомлений и звуковых оповещений

## Проблема 1 (критическая): VAPID_PRIVATE_KEY невалидный

Логи edge-функции `send-push-notification` показывают ошибку при каждой попытке отправки:
```
Vapid private key should be 32 bytes long when decoded
```

Секрет `VAPID_PRIVATE_KEY` содержит некорректное значение. Необходимо сгенерировать новую пару VAPID-ключей и обновить секреты.

**Действие**: Попросить администратора ввести корректный VAPID_PRIVATE_KEY. Для генерации пары ключей можно использовать:
```
npx web-push generate-vapid-keys
```
Затем обновить секреты `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` и `VITE_VAPID_PUBLIC_KEY` (публичный ключ должен совпадать).

После обновления ключей существующую подписку в `push_subscriptions` нужно удалить — она была создана со старым публичным ключом и не будет работать с новым. Пользователю потребуется переподписаться.

## Проблема 2: "Уведомления заблокированы" в preview

Это ожидаемое поведение: preview-окно Lovable работает в iframe на другом домене, и браузер всегда возвращает `Notification.permission === "denied"` для iframe.

**Действие**: Не требует изменения кода. Push работает только на опубликованном сайте (gorbova.lovable.app).

## Проблема 3: Звук не воспроизводится

`AudioContext` в современных браузерах требует предварительной активации пользователем (клик, касание). Если контекст создаётся впервые при получении realtime-события без предшествующего взаимодействия, он будет в состоянии `suspended` и звук не воспроизведётся.

**Решение**: Инициализировать AudioContext при первом клике пользователя на странице и "разморозить" его вызовом `resume()`.

### Файл: `src/hooks/useIncomingMessageAlert.ts`

Добавить:
- Обработчик первого клика для создания и активации AudioContext
- Вызов `ctx.resume()` перед воспроизведением звука
- Удаление обработчика после активации

```typescript
useEffect(() => {
  const initAudio = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    audioContextRef.current.resume();
    document.removeEventListener('click', initAudio);
    document.removeEventListener('touchstart', initAudio);
  };
  document.addEventListener('click', initAudio, { once: true });
  document.addEventListener('touchstart', initAudio, { once: true });
  return () => {
    document.removeEventListener('click', initAudio);
    document.removeEventListener('touchstart', initAudio);
  };
}, []);
```

И в `playNotificationSound`:
```typescript
if (ctx.state === 'suspended') {
  await ctx.resume();
}
```

---

## Порядок действий

1. Сгенерировать новую пару VAPID-ключей (попрошу ввести через инструмент секретов)
2. Обновить секреты VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VITE_VAPID_PUBLIC_KEY
3. Очистить старую подписку из push_subscriptions
4. Исправить инициализацию AudioContext в useIncomingMessageAlert.ts
5. Передеплоить send-push-notification
6. Протестировать на опубликованном сайте

### Изменяемые файлы
- `src/hooks/useIncomingMessageAlert.ts` — fix AudioContext activation
