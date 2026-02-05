ЖЁСТКИЕ ПРАВИЛА ИСПОЛНЕНИЯ ДЛЯ LOVABLE.DEV

1) Ничего не ломать и не трогать лишнее. Только то, что описано ниже.
2) Add-only где возможно. Удаления — только там, где явно указано.
3) Всегда: DRY-RUN → EXECUTE. Любые массовые/опасные действия только с STOP-guard.
4) Никаких хардкод-UUID / магических значений. Project-ref — только из фактов (см. ниже).
5) Строгие STOP-предохранители: если деплой/функция таймаутит или 404 — остановиться и зафиксировать причину, НЕ продолжать “пачкой”.
6) Безопасность: если `verify_jwt=false`, то обязателен ручной guard внутри функции: Authorization → getUser() → has_role(admin/superadmin) / permissions. Иначе `verify_jwt=true`.
7) Финальный отчёт (DoD) только фактами: Network/HTTP статус + скрины UI из 7500084@gmail.com + список изменённых файлов + diff-summary.

STOP-CONDITIONS:
- Любая функция после деплоя всё ещё 404 → STOP, проверка project-ref, config.toml, фактического деплоя.
- Любая функция возвращает 200 без токена/без роли → STOP, критический security bug.

# PATCH: Регистрация admin-функций + фикс project-ref + стабилизация импортов

## Цель
Устранить 404 ("Failed to send a request to the Edge Function") для критических admin-функций на `/admin/payments` и исправить CI/CD workflow, который сейчас линкается на НЕПРАВИЛЬНЫЙ Supabase проект.

---

## Результаты аудита (факты)

### Функции-сироты (есть в repo, но НЕ зарегистрированы в config.toml → будут 404)
| Функция | Импорт | Auth Guard |
|---------|--------|------------|
| `admin-fix-payments-integrity` | `esm.sh` | ✅ admin/super_admin |
| `admin-search-profiles` | `esm.sh` | ✅ admin + has_permission |
| `admin-payments-diagnostics` | `npm:` | ✅ admin |
| `admin-bepaid-emergency-unlink` | `esm.sh` | ✅ superadmin only |
| `admin-bepaid-full-reconcile` | `esm.sh` | ✅ admin |
| `admin-bepaid-reconcile-amounts` | `esm.sh` | ✅ admin |

### GitHub Actions баг (BLOCKER)
- Сейчас: `supabase link --project-ref ypwsuumurrtkxatoyqhk` (НЕПРАВИЛЬНЫЙ проект)
- Должно быть: `supabase link --project-ref hdjgkjceownmmnrqqtuz` (ФАКТ: это project-ref в реальном Network URL `https://hdjgkjceownmmnrqqtuz.supabase.co/...`)

---

## PATCH-0 (BLOCKER): Фикс project-ref в GitHub Actions

Файл: `.github/workflows/deploy-functions.yml`

Изменение (строка 28):
```yaml
# БЫЛО
supabase link --project-ref ypwsuumurrtkxatoyqhk

# СТАЛО
supabase link --project-ref hdjgkjceownmmnrqqtuz

DoD PATCH-0:
	•	В логах GitHub Actions видно supabase link на hdjgkjceownmmnrqqtuz
	•	Следующий деплой функций идёт в правильный проект (проверить по Network URL)

⸻

PATCH-1: Регистрация функций в supabase/config.toml

Файл: supabase/config.toml

Добавить в конец (после строки 331):

[functions.admin-fix-payments-integrity]
verify_jwt = false

[functions.admin-search-profiles]
verify_jwt = false

[functions.admin-payments-diagnostics]
verify_jwt = false

[functions.admin-bepaid-emergency-unlink]
verify_jwt = false

[functions.admin-bepaid-full-reconcile]
verify_jwt = false

[functions.admin-bepaid-reconcile-amounts]
verify_jwt = false

Обоснование:
	•	Все 6 функций содержат ручной auth guard (Authorization → getUser → role/permission), поэтому verify_jwt=false допустим.
	•	Если в какой-то из функций guard окажется неполным — вернуть verify_jwt=true ИЛИ добавить недостающий guard (см. PATCH-4 Security).

⸻

PATCH-2: Стабилизация импортов (esm.sh → npm:)

Причина:
	•	esm.sh повышает риск “Bundle generation timed out” при деплое.
	•	npm: specifier уже показал стабильный деплой (пример: bepaid-list-subscriptions).

Файлы для изменения (5 шт; admin-payments-diagnostics уже OK):
	1.	supabase/functions/admin-fix-payments-integrity/index.ts (строка 2)
	2.	supabase/functions/admin-search-profiles/index.ts (строка 1)
	3.	supabase/functions/admin-bepaid-emergency-unlink/index.ts (строка 1)
	4.	supabase/functions/admin-bepaid-full-reconcile/index.ts (строка 1)
	5.	supabase/functions/admin-bepaid-reconcile-amounts/index.ts (строка 2)

Замена:

// БЫЛО
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// СТАЛО
import { createClient } from "npm:@supabase/supabase-js@2";


⸻

PATCH-3: Точечный деплой (с STOP-guard)

Деплоить по 1 функции за раз (Lovable Cloud):

supabase--deploy_edge_functions: ["<function-name>"]

Порядок:
	1.	admin-search-profiles
	2.	admin-fix-payments-integrity
	3.	admin-payments-diagnostics
	4.	admin-bepaid-emergency-unlink
	5.	admin-bepaid-full-reconcile
	6.	admin-bepaid-reconcile-amounts

STOP-guard:
	•	Любая функция таймаутит/не отвечает/после деплоя 404 → STOP, прикладываем логи деплоя + Network.

⸻

PATCH-4: Security Guard (обязательная проверка, иначе STOP)

Для каждой функции с verify_jwt=false подтвердить:
	1.	Нет Authorization → 401
	2.	getUser(token) невалиден → 401
	3.	Нет admin/superadmin (и где нужно permission) → 403
	4.	Только admin/superadmin → 200

Если у любой функции отсутствует один из пунктов — ДОБАВИТЬ минимальным diff.

⸻

Верификация (DoD)

A) Network (НЕ 404):
	•	POST /functions/v1/admin-search-profiles → 200/401/403
	•	POST /functions/v1/admin-fix-payments-integrity → 200/401/403
	•	POST /functions/v1/admin-payments-diagnostics → 200/401/403

B) Security:
	•	Без токена → 401
	•	Не-админ → 403
	•	Админ (7500084@gmail.com) → 200

C) UI:
	•	/admin/payments — поиск профилей/контактов, диагностика и фиксы работают без “Failed to send…”

D) CI:
	•	GitHub Actions деплоит в hdjgkjceownmmnrqqtuz

⸻

Diff-summary

Файл	Изменение
.github/workflows/deploy-functions.yml	project-ref: ypwsuumurrtkxatoyqhk → hdjgkjceownmmnrqqtuz
supabase/config.toml	+6 секций [functions.*]
supabase/functions/admin-fix-payments-integrity/index.ts	esm.sh → npm:
supabase/functions/admin-search-profiles/index.ts	esm.sh → npm:
supabase/functions/admin-bepaid-emergency-unlink/index.ts	esm.sh → npm:
supabase/functions/admin-bepaid-full-reconcile/index.ts	esm.sh → npm:
supabase/functions/admin-bepaid-reconcile-amounts/index.ts	esm.sh → npm:

Если хочешь, следующим сообщением дам ультра-короткий PATCH-лист (5–7 пунктов) без таблиц — чисто “сделай раз, два, три” для Lovable.