
# FIX: Ошибка добавления блока html_raw — отсутствует в CHECK constraint

## Проблема

Таблица `lesson_blocks` имеет CHECK-ограничение `lesson_blocks_block_type_check`, которое перечисляет допустимые значения `block_type`. Тип `'html_raw'` **отсутствует** в этом списке, поэтому INSERT падает с ошибкой на уровне базы данных.

Тип `checklist` уже присутствует в constraint — его добавление работает корректно.

## Решение

Одна SQL-миграция: пересоздать CHECK-ограничение с добавлением `'html_raw'`.

```sql
ALTER TABLE lesson_blocks DROP CONSTRAINT lesson_blocks_block_type_check;
ALTER TABLE lesson_blocks ADD CONSTRAINT lesson_blocks_block_type_check
  CHECK (block_type = ANY (ARRAY[
    'heading','text','accordion','tabs','spoiler','callout','quote',
    'video','audio','image','gallery','file',
    'button','embed','divider','timeline','steps',
    'quiz_single','quiz_multiple','quiz_true_false','quiz_fill_blank',
    'quiz_matching','quiz_sequence','quiz_hotspot','quiz_survey',
    'input_short','input_long','checklist','table_input','file_upload','rating',
    'container','columns','condition',
    'video_unskippable','diagnostic_table','sequential_form','role_description',
    'html_raw'
  ]));
```

## Затронутые файлы

| Файл | Действие |
|---|---|
| SQL-миграция | DROP + ADD constraint с `html_raw` |

Код фронтенда изменений не требует — блоки уже зарегистрированы.
