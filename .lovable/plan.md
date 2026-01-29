Ок — вношу изменения прямо в твой план, без нового.

⸻

План: Исправление кнопки “На сайт” для клуба (обновлённый)

Проблема

Кнопка “На сайт” у продукта “Клуб «Буква Закона»” открывает новую вкладку того же домена (https://club.gorbova.by) с target="_blank". Поскольку это тот же SPA:
	•	новая вкладка сохраняет/наследует SPA-состояние (и/или last route),
	•	пользователь снова попадает в /products и видит “то же самое” вместо лендинга.

Важно: формулировку про session storage лучше не фиксировать как факт (это может быть и router-state/redirect logic). Нам важно поведение: _blank + SPA = уносит в /products.

⸻

Уже исправлено (предыдущий коммит)

Guest guard в ProtectedRoute.tsx:

if (!user && location.pathname === "/products") {
  return <Navigate to="/" replace />;
}

Это работает корректно.

⸻

Требуемые правки

Общая правка (обязательная)

Не хардкодить URL дважды — завести константу в обоих местах:

const CLUB_LANDING_URL = "https://club.gorbova.by/";

И не использовать product.isClub, если такого поля нет. Клуб должен определяться детерминированно (строго):
	•	product.slug === "<club_slug>" или
	•	product.id === "<club_id>" или
	•	product.purchaseLink === "https://club.gorbova.by" (если это уникально для клуба)

⸻

Файл 1: src/pages/Learning.tsx

Строки 157-163 — функция handleGoToSite:

// БЫЛО:
const handleGoToSite = () => {
  if (product.purchaseLink.startsWith("http")) {
    window.open(product.purchaseLink, "_blank");
  } else {
    navigate(product.purchaseLink);
  }
};

// СТАНЕТ:
const CLUB_LANDING_URL = "https://club.gorbova.by/";

const handleGoToSite = () => {
  const isClub = product.slug === "<club_slug>"; // или product.id === "<club_id>"

  if (isClub) {
    // Клуб: полный переход на лендинг (не SPA-навигация, не _blank, same-tab)
    window.location.assign(CLUB_LANDING_URL);
    return;
  }

  if (product.purchaseLink.startsWith("http")) {
    window.open(product.purchaseLink, "_blank");
  } else {
    navigate(product.purchaseLink);
  }
};


⸻

Файл 2: src/pages/Products.tsx

Строки 31-37 — функция handleClick:

// БЫЛО:
const handleClick = () => {
  if (isExternal) {
    window.open(link, "_blank");
  } else {
    navigate(link);
  }
};

// СТАНЕТ:
const CLUB_LANDING_URL = "https://club.gorbova.by/";

const handleClick = () => {
  const isClub = product.slug === "<club_slug>"; // или product.id === "<club_id>"

  if (isClub) {
    // Клуб: полный переход на лендинг (не SPA-навигация, same-tab)
    window.location.assign(CLUB_LANDING_URL);
    return;
  }

  if (isExternal) {
    window.open(link, "_blank");
  } else {
    navigate(link);
  }
};


⸻

Техническое обоснование

Метод	Что делает	Подходит для клуба?
window.open(url, "_blank")	Новая вкладка, SPA остаётся SPA	❌ Нет
navigate() / <Link>	SPA-навигация внутри роутера	❌ Нет
window.location.assign(url)	Полный переход, сбрасывает SPA (same-tab)	✅ Да
<a href target="_self">	Полный переход	✅ Да


⸻

DoD (Верификация)
	1.	Гость в инкогнито:
	•	Открыть https://club.gorbova.by/products → редирект на / (лендинг)
	2.	Из кабинета (авторизованный):
	•	“Обучение → Все продукты” → “На сайт” у клуба → открывается https://club.gorbova.by/
	•	НЕ остаётся на /products
	•	НЕ открывается новая вкладка
	3.	Регрессия:
	•	Для остальных продуктов (“Ценный бухгалтер”, “Бухгалтерия как бизнес”) поведение не меняется (как было: external в _blank или как настроено сейчас)
	4.	Скриншоты/пруф:
	•	До: клик по “На сайт” → в адресной строке /products
	•	После: https://club.gorbova.by/ (лендинг)
	5.	Diff-summary:
	•	src/pages/Learning.tsx — добавлен isClub (детерминированно) + window.location.assign(CLUB_LANDING_URL)
	•	src/pages/Products.tsx — добавлен isClub (детерминированно) + window.location.assign(CLUB_LANDING_URL)
