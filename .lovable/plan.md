# PATCH: План доработок спринта PAYMENTS / TIMEZONE / TRIAL BUGS (режим редактирования)

## Жёсткие правила исполнения для Lovable.dev (обязательное)
- Ничего не ломать и не трогать лишнее; add-only, точечные правки.
- Любые массовые операции: сначала DRY-RUN → только потом EXECUTE.
- Никаких хардкод-UUID “на глаз”; только доказуемые JOIN/CTE/RPC.
- STOP-предохранители: лимиты, батчи, early-abort при аномалиях.
- Безопасность: все админ-инструменты за RBAC, без “silent” путей.
- Финальный отчёт обязан содержать: DoD SQL результаты, audit_logs пруфы, UI-скрины, diff-summary изменённых файлов.
- Пруфы принимаются только из тестовой админ-учётки подрядчика: 1@ajoure.by (обязательно).
- Пароли не хранить и не передавать в чате/коде.

---

# План доработок спринта PAYMENTS / TIMEZONE / TRIAL BUGS

## Выявленные пробелы в реализации

| Компонент | Статус | Требуется |
|-----------|--------|-----------|
| Timezone selector в профиле | ❌ Отсутствует | Добавить UI + сохранение |
| FixPaymentsIntegrityTool | ✅ Создан | Подключить в UI |
| Timezone toggle в Payments | ❌ Отсутствует | Добавить переключатель |
| RPC get_payment_duplicates | ❌ Отсутствует | Создать функцию |
| orphan/mismatch данные | 1 + 2 записи | Запустить Fix tool (DRY-RUN→EXECUTE) |

---

## 1) SQL: RPC get_payment_duplicates (для nightly invariants)

### SQL миграция
```sql
CREATE OR REPLACE FUNCTION public.get_payment_duplicates()
RETURNS TABLE(
  provider TEXT,
  provider_payment_id TEXT,
  duplicate_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT provider, provider_payment_id, COUNT(*) as duplicate_count
  FROM payments_v2
  WHERE provider_payment_id IS NOT NULL
  GROUP BY provider, provider_payment_id
  HAVING COUNT(*) > 1
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_duplicates() TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_payment_duplicates() FROM PUBLIC;

DoD

SELECT COUNT(*) FROM get_payment_duplicates();

Ожидаемо: 0

⸻

2) UI: Timezone selector в профиле

Файл: src/pages/settings/Profile.tsx

Требования
	•	Добавить dropdown: Europe/Minsk, Europe/Warsaw, Europe/Moscow, UTC.
	•	Хранить/читать из profiles.timezone (колонка уже добавлена ранее).
	•	При смене timezone: помечать форму dirty и сохранять при “Сохранить”.

Код-вставка (после секции phone)

<div className="space-y-2">
  <Label>Часовой пояс</Label>
  <Select value={timezone} onValueChange={(v) => { setTimezone(v); setIsDirty(true); }}>
    <SelectTrigger>
      <SelectValue placeholder="Выберите часовой пояс" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="Europe/Minsk">Минск (UTC+3)</SelectItem>
      <SelectItem value="Europe/Warsaw">Варшава (UTC+1/+2)</SelectItem>
      <SelectItem value="Europe/Moscow">Москва (UTC+3)</SelectItem>
      <SelectItem value="UTC">UTC</SelectItem>
    </SelectContent>
  </Select>
</div>

DoD
	•	Скрин из 1@ajoure.by: /settings/profile — selector виден, значение сохраняется после reload.

⸻

3) UI: Подключить FixPaymentsIntegrityTool в админке

Файл: src/components/admin/payments/AutoRenewalsTabContent.tsx

Изменения
	1.	Импорт FixPaymentsIntegrityTool
	2.	Добавить пункт в DropdownMenu рядом с Backfill
	3.	Поднять Dialog state и отрисовать Dialog

Код

import { FixPaymentsIntegrityTool } from "./FixPaymentsIntegrityTool";

const [fixIntegrityDialogOpen, setFixIntegrityDialogOpen] = useState(false);

<DropdownMenuItem onClick={() => setFixIntegrityDialogOpen(true)}>
  <Wrench className="h-4 w-4 mr-2" />
  Fix Integrity (2026+)
</DropdownMenuItem>

<Dialog open={fixIntegrityDialogOpen} onOpenChange={setFixIntegrityDialogOpen}>
  <DialogContent className="max-w-2xl">
    <FixPaymentsIntegrityTool />
  </DialogContent>
</Dialog>

DoD
	•	Скрин из 1@ajoure.by: админка → Payments/AutoRenewals → открывается Fix Integrity dialog.
	•	Внутри видно whoami (email/id/roles).

⸻

4) UI: Timezone toggle в Payments таблице

Файл: src/components/admin/payments/PaymentsTabContent.tsx

Требования
	•	ToggleGroup: My TZ / UTC / Provider.
	•	My TZ берётся из profiles.timezone текущего пользователя (fallback: Europe/Minsk).
	•	Provider TZ: использовать meta.provider_timezone_assumed если есть, иначе Europe/Minsk.
	•	Данные в БД не менять, только формат отображения.

Код (state + UI)

const [displayTimezone, setDisplayTimezone] =
  useState<'user' | 'utc' | 'provider'>('user');

<ToggleGroup
  type="single"
  value={displayTimezone}
  onValueChange={(v) => v && setDisplayTimezone(v as any)}
>
  <ToggleGroupItem value="user" size="sm">My TZ</ToggleGroupItem>
  <ToggleGroupItem value="utc" size="sm">UTC</ToggleGroupItem>
  <ToggleGroupItem value="provider" size="sm">Provider</ToggleGroupItem>
</ToggleGroup>

DoD
	•	Скрин из 1@ajoure.by: таблица Payments с toggle.
	•	Один и тот же payment показывает корректно время при переключении (3 скрина).

⸻

5) Data Fix: orphan + mismatches (DRY-RUN → EXECUTE)

Текущее состояние
	•	1 orphan payment: 8fee626c-b3a8-48ca-b3df-7cc8de857a91 (test_payment: true, amount 150 BYN, provider_payment_id null)
	•	2 mismatches:
	•	Payment 55 BYN → Order 100 BYN (PAY-26-MKOJBZOZ)
	•	Payment 100 BYN → Order 55 BYN (PAY-26-MKNWXMSD)

Действия (обязательный порядок)
	1.	Под 1@ajoure.by открыть Fix Integrity → DRY-RUN (limit ≥ 50).
	2.	Зафиксировать samples:
	•	orphan: подтвердить что test_payment=true и можно НЕ чинить автоматически
	3.	EXECUTE:
	•	orphan test_payment: НЕ создавать order; пометить meta.requires_manual_mapping=true или удалить (только если это точно тест и не влияет на отчётность).
	•	mismatches: если это swap связей — чинить корректно:
	•	приоритет: исправить order_id у платежей (если явно перепутаны),
	•	иначе: исправить final_price/paid_amount у order (только если точно “не тот прайс”, а не “не тот order”).

STOP-условие
	•	Если DRY-RUN показывает “complex/needs_mapping” для mismatches — НЕ EXECUTE автоматически, собрать 2–3 sample JSON и вынести на ручное решение.

⸻

6) Верификация bepaid-webhook trial guards (verify)

Проверить наличие и работоспособность:
	1.	trial_blocks check до создания trial order
	2.	active subscription check до trial
	3.	amount mismatch guard: amount > 5 + order.is_trial=true
	4.	audit_logs: payment.trial_blocked, payment.mismatch_amount_guard_triggered

⸻

Порядок выполнения
	1.	SQL миграция: get_payment_duplicates
	2.	UI: timezone selector в Profile.tsx
	3.	UI: подключить FixPaymentsIntegrityTool
	4.	UI: timezone toggle в PaymentsTabContent.tsx
	5.	Deploy + sanity-check
	6.	Data fix: Fix Integrity tool (DRY-RUN → EXECUTE) под 1@ajoure.by

⸻

DoD проверки после выполнения

SQL

SELECT COUNT(*) FROM get_payment_duplicates();

SELECT COUNT(*) FROM payments_v2
WHERE paid_at >= '2026-01-01'
  AND status='succeeded'
  AND amount>0
  AND profile_id IS NOT NULL
  AND order_id IS NULL;

SELECT COUNT(*) FROM payments_v2 p
JOIN orders_v2 o ON o.id = p.order_id
WHERE p.status='succeeded'
  AND p.amount>0
  AND o.status='paid'
  AND (o.final_price IS NULL OR o.final_price <> p.amount);

UI пруфы (строго 1@ajoure.by)
	•	Скрин: /settings/profile с timezone selector
	•	Скрин: Fix Integrity tool dialog + whoami
	•	Скрин: Payments таблица + timezone toggle (3 режима)

Audit logs (system actor)

SELECT action, COUNT(*) FROM audit_logs
WHERE actor_type='system'
  AND action IN (
    'nightly.payments_invariants_run',
    'payment.trial_blocked',
    'payment.mismatch_amount_guard_triggered',
    'tariff_price.deleted',
    'auth.suspicious_state_detected'
  )
GROUP BY action;


⸻

Файлы для изменения

Файл	Действие
src/pages/settings/Profile.tsx	Добавить timezone selector
src/components/admin/payments/AutoRenewalsTabContent.tsx	Подключить FixPaymentsIntegrityTool
src/components/admin/payments/PaymentsTabContent.tsx	Добавить timezone toggle
SQL миграция	Создать RPC get_payment_duplicates

