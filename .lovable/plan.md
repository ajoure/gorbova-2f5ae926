
Контекст (что видно по симптомам)
- Вы описываете поведение: «при загрузке пытается стать большим, потом снова становится маленьким».
- Это типичный признак того, что:
  1) мы один раз “подтягиваем” iframe стилями,
  2) затем сам Kinescope-скрипт/плеер позже повторно выставляет свои inline-стили (ширина/высота в px или свои обёртки), из‑за чего iframe снова “сжимается”.
- Текущий патч делает setTimeout(50ms) и правит iframe один раз — этого недостаточно, если Kinescope перезаписывает размеры позже.

Цель
- Сделать размер плеера стабильным: всегда на всю ширину карточки, 16:9, без “сжатия обратно”.

Решение (детерминированное, точечное, без лишнего рефакторинга)
Сделаем два слоя защиты одновременно:
1) Правильная структура контейнера (aspect-ratio на внешнем wrapper, а mount-точка плеера — absolute fill).
2) “Жёсткая” фиксация размеров через CSS с `!important` + MutationObserver, который будет повторно применять стили, если Kinescope их изменит после инициализации.

---

1) Исправить разметку контейнера в VideoBlock (правильная геометрия)
Файл: `src/components/admin/lesson-editor/blocks/VideoBlock.tsx`

Сделать:
- Перенести `aspect-video` и `rounded/overflow/bg` на внешний wrapper.
- Внутри wrapper сделать `div id={containerId}` как “mount point” с `absolute inset-0`.
- Добавить инлайновый `<style>` (пер-экземпляр, привязанный к `containerId`) с селекторами `#containerId`, `#containerId iframe` и возможной обёрткой `#containerId > div`, чтобы:
  - контейнер и обёртка занимали 100%,
  - iframe всегда был `position:absolute; inset:0; width:100%; height:100%`,
  - это было `!important`, чтобы перебить inline-стили, которые Kinescope ставит позже.

Почему так:
- Сейчас `aspect-video` висит на том же div, куда Kinescope может поставить свои width/height, тем самым ломая геометрию.
- Внешний wrapper фиксирует размер, а внутренний mount point просто “заполняет” его.

Требования к CSS (минимум):
- `#<id> { width:100%!important; height:100%!important; }`
- `#<id> iframe { width:100%!important; height:100%!important; position:absolute!important; inset:0!important; display:block!important; }`
- `#<id> > div { width:100%!important; height:100%!important; position:absolute!important; inset:0!important; }` (на случай, если Kinescope вставляет дополнительную обёртку)

---

2) Сделать “стабилизатор размеров” в useKinescopePlayer (на случай поздних изменений)
Файл: `src/hooks/useKinescopePlayer.ts`

Сделать:
- Ввести локальную функцию `forceFill()`:
  - находит `containerEl` по `containerId`,
  - правит:
    - containerEl (width/height 100%),
    - wrapper (если есть: `containerEl.firstElementChild`),
    - iframe (как сейчас, но с `inset:0`, `display:block`).
- После создания player:
  - вызвать `forceFill()` сразу,
  - вызвать `forceFill()` ещё раз через `requestAnimationFrame` и через `setTimeout(250-400ms)` (два дополнительных “тика” — часто Kinescope меняет DOM чуть позже).
- Подключить `MutationObserver` на `containerEl`:
  - наблюдать `attributes: true` (style/class), `childList: true`, `subtree: true`,
  - при любом изменении вызывать `forceFill()` (можно с лёгким throttling через rAF, чтобы не спамить).
- На cleanup (return useEffect) обязательно `observer.disconnect()`.

Почему так:
- Даже если Kinescope повторно ставит фиксированные размеры после нашего первого setTimeout — observer увидит это и мгновенно вернёт “fill”.

STOP-предохранители (чтобы не сломать другое)
- Наблюдатель и принудительные стили применяются только внутри `containerId` (точечный селектор), не глобально.
- Никаких изменений для YouTube/Vimeo/прочих — только для Kinescope API режима.

---

3) Проверка в Preview (обязательные пруфы)
Сценарии:
A) Страница `/library/container-knowledge-videos/episode-100`
- Перезагрузка страницы (hard reload).
- Наблюдение: плеер не “скачет” обратно в маленький.
- Скрин: видно нормальный размер видео в карточке.

B) Повторная инициализация (клик по вопросам/таймкодам)
- Нажать Play по вопросу → плеер остаётся нормального размера.
- Скрин: после клика Play плеер всё ещё большой.

C) Адаптивность
- Mobile viewport (390x844) и tablet (820x1180):
  - видео занимает ширину контейнера,
  - 16:9 сохраняется,
  - ничего не выпадает из карточки.
- Скрины mobile + tablet.

DoD
- Видео стабильно “нормального” размера и не уменьшается через 0.5–2 сек после загрузки.
- Приложены скриншоты: desktop + mobile + tablet.
- В консоли нет ошибок, связанных с Kinescope (если будут — приложим и устраним).

Изменяемые файлы (точечно)
- `src/components/admin/lesson-editor/blocks/VideoBlock.tsx` (wrapper + mount point + пер-id CSS)
- `src/hooks/useKinescopePlayer.ts` (forceFill + дополнительные тики + MutationObserver)
