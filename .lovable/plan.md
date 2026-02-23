
# Исправление: часы в диагностической таблице показываются как 0

## Проблема

Модальное окно прогресса ученика (`StudentProgressModal`) читает данные из `pointA_rows` используя **неправильные имена полей**:

| Что ищет модальное окно | Что реально хранится в БД | Результат |
|---|---|---|
| `source_name` | `source` | "—" вместо названия |
| `task_hours` | `work_hours` | 0 вместо реальных часов |
| `communication_hours` | `overhead_hours` | 0 вместо реальных часов |

Подтверждено SQL-запросом: в `lesson_progress_state.state_json.pointA_rows` данные хранятся с ключами `source`, `work_hours`, `overhead_hours` (так как именно эти `id` заданы в колонках `DiagnosticTableBlock`).

## Решение

Точечное исправление в одном файле -- привести имена полей к реальной схеме данных.

### Файл: `src/components/admin/trainings/StudentProgressModal.tsx`

**1) Интерфейс `PointARow` (строки 55-60):** заменить имена полей:

```
interface PointARow {
  source?: string;         // было source_name
  income?: number;
  work_hours?: number;     // было task_hours
  overhead_hours?: number; // было communication_hours
}
```

**2) Агрегация (строки 152-154):** обновить ключи:

```
const totalTaskHours = pointARows.reduce((sum, r) => sum + (r.work_hours || 0), 0);
const totalCommHours = pointARows.reduce((sum, r) => sum + (r.overhead_hours || 0), 0);
```

**3) Таблица строк (строки 222-225):** обновить отображение:

```
<TableCell>{row.source || "—"}</TableCell>
<TableCell className="text-right">{row.income || 0} BYN</TableCell>
<TableCell className="text-right">{row.work_hours || 0} ч</TableCell>
<TableCell className="text-right">{row.overhead_hours || 0} ч</TableCell>
```

## Затронутые файлы

| Файл | Изменение |
|---|---|
| `src/components/admin/trainings/StudentProgressModal.tsx` | Исправить 3 места: интерфейс, агрегация, рендер таблицы |

## НЕ трогаем

- `DiagnosticTableBlock.tsx` -- данные сохраняются корректно
- `KvestLessonView.tsx` -- передаёт rows as-is
- `useLessonProgressState.tsx` -- хранит rows as-is
- Схему БД -- данные в БД корректны

## DoD

1. Часы задач и переписки отображаются корректно (реальные значения из БД)
2. Источник дохода показывает название, а не "—"
3. Итоги (суммы и доход/час) рассчитываются правильно
4. Нет ошибок сборки/TS
