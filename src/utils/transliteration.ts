// Belarusian/Russian transliteration map from Latin to Cyrillic
export const TRANSLIT_MAP: Record<string, string> = {
  // Double letters first (order matters)
  'SHCH': 'Щ', 'shch': 'щ',
  'YA': 'Я', 'ya': 'я', 'IA': 'Я', 'ia': 'я',
  'YU': 'Ю', 'yu': 'ю', 'IU': 'Ю', 'iu': 'ю',
  'YE': 'Е', 'ye': 'е', 'IE': 'Е', 'ie': 'е',
  'YI': 'Ї', 'yi': 'ї',
  'ZH': 'Ж', 'zh': 'ж',
  'KH': 'Х', 'kh': 'х',
  'TS': 'Ц', 'ts': 'ц',
  'CH': 'Ч', 'ch': 'ч',
  'SH': 'Ш', 'sh': 'ш',
  'YO': 'Ё', 'yo': 'ё',
  // Single letters
  'A': 'А', 'a': 'а',
  'B': 'Б', 'b': 'б',
  'V': 'В', 'v': 'в',
  'W': 'В', 'w': 'в',
  'G': 'Г', 'g': 'г',
  'H': 'Г', 'h': 'г', // In Belarusian H often maps to Г
  'D': 'Д', 'd': 'д',
  'E': 'Е', 'e': 'е',
  'Z': 'З', 'z': 'з',
  'I': 'И', 'i': 'и',
  'Y': 'Й', 'y': 'й',
  'K': 'К', 'k': 'к',
  'L': 'Л', 'l': 'л',
  'M': 'М', 'm': 'м',
  'N': 'Н', 'n': 'н',
  'O': 'О', 'o': 'о',
  'P': 'П', 'p': 'п',
  'R': 'Р', 'r': 'р',
  'S': 'С', 's': 'с',
  'T': 'Т', 't': 'т',
  'U': 'У', 'u': 'у',
  'F': 'Ф', 'f': 'ф',
  'C': 'Ц', 'c': 'ц',
  "'": 'Ь', 
};

// Extended Belarusian names dictionary (Latin -> Cyrillic)
// Collected from bePaid card holder names and amoCRM exports
export const NAME_CORRECTIONS: Record<string, string> = {
  // === FIRST NAMES (ИМЕНА) ===
  // Female names
  'AKSANA': 'Оксана',
  'ALENA': 'Алёна',
  'ALIAKSANDRA': 'Александра',
  'ANASTASIA': 'Анастасия',
  'ANASTASIIA': 'Анастасия',
  'ANASTASIYA': 'Анастасия',
  'ANHELINA': 'Ангелина',
  'ANNA': 'Анна',
  'ANTANINA': 'Антонина',
  'DARIA': 'Дарья',
  'DARYA': 'Дарья',
  'DZIYANA': 'Диана',
  'EKATERINA': 'Екатерина',
  'ELENA': 'Елена',
  'HANNA': 'Анна',
  'INNA': 'Инна',
  'IRINA': 'Ирина',
  'IRYNA': 'Ирина',
  'KATSIARYNA': 'Екатерина',
  'KRISTINA': 'Кристина',
  'KRYSTYNA': 'Кристина',
  'LARYSA': 'Лариса',
  'LENA': 'Лена',
  'LIUDMILA': 'Людмила',
  'LIUDMILLA': 'Людмила',
  'LUDMILA': 'Людмила',
  'MARGARITA': 'Маргарита',
  'MARHARYTA': 'Маргарита',
  'MARIA': 'Мария',
  'MARINA': 'Марина',
  'MARYIA': 'Мария',
  'MARYNA': 'Марина',
  'NADEZHDA': 'Надежда',
  'NATALLIA': 'Наталья',
  'NATALIA': 'Наталья',
  'NINA': 'Нина',
  'OLGA': 'Ольга',
  'PALINA': 'Полина',
  'POLINA': 'Полина',
  'SVIATLANA': 'Светлана',
  'SVETLANA': 'Светлана',
  'TATSIANA': 'Татьяна',
  'TATIANA': 'Татьяна',
  'VALERIA': 'Валерия',
  'VALERYIA': 'Валерия',
  'VALIANTSINA': 'Валентина',
  'VALIANTSYNA': 'Валентина',
  'VALENTINA': 'Валентина',
  'VERANIIKA': 'Вероника',
  'VERONIKA': 'Вероника',
  'VIKTORIA': 'Виктория',
  'VIKTORYIA': 'Виктория',
  'VOLHA': 'Ольга',
  'YELENA': 'Елена',
  'YELIZAVETA': 'Елизавета',
  'YULIYA': 'Юлия',
  'YULIA': 'Юлия',
  'YULIIA': 'Юлия',
  'ZHANNA': 'Жанна',
  
  // Male names
  'ALIAKSANDR': 'Александр',
  'ALIAKSEI': 'Алексей',
  'ALIAKSEJ': 'Алексей',
  'ANDREI': 'Андрей',
  'ANDREY': 'Андрей',
  'ANTON': 'Антон',
  'ARTEM': 'Артём',
  'ARTSIOM': 'Артём',
  'DZMITRY': 'Дмитрий',
  'DMITRY': 'Дмитрий',
  'HENADZ': 'Геннадий',
  'HENADZI': 'Геннадий',
  'IVAN': 'Иван',
  'KANSTANTSIN': 'Константин',
  'KIRYL': 'Кирилл',
  'KIRILL': 'Кирилл',
  'MAKSIM': 'Максим',
  'MAXIM': 'Максим',
  'MIKALAI': 'Николай',
  'MIKHAIL': 'Михаил',
  'MIKITA': 'Никита',
  'NIKITA': 'Никита',
  'PAVEL': 'Павел',
  'PAVIEL': 'Павел',
  'SERGEI': 'Сергей',
  'SERGEY': 'Сергей',
  'SIARHEI': 'Сергей',
  'SIARHEY': 'Сергей',
  'ULADZIMIR': 'Владимир',
  'ULADZISLAU': 'Владислав',
  'VADIM': 'Вадим',
  'VIKTAR': 'Виктор',
  'YAUHENI': 'Евгений',
  'YAUHENIA': 'Евгения',
  'YAUHEN': 'Евгений',
  
  // === LAST NAMES (ФАМИЛИИ) ===
  'ANDREYEVA': 'Андреева',
  'APANASENKO': 'Апанасенко',
  'ASIPIK': 'Асипик',
  'BAHATKA': 'Богатка',
  'BAHDANAITS': 'Богданец',
  'BANCHAK': 'Банчак',
  'BARYSENKA': 'Борисенко',
  'BURMISTRONAK': 'Бурмистронок',
  'DABRAVOLSKAYA': 'Добровольская',
  'DAMANOUSKAYA': 'Домановская',
  'DOLMAT': 'Долмат',
  'DRACHOVA': 'Драчева',
  'DZIYANAVA': 'Дьянова',
  'DZERHIALIOVA': 'Дергилёва',
  'FEDORCHUK': 'Федорчук',
  'FIADZKOVA': 'Федькова',
  'HANCHARONAK': 'Гончаренок',
  'HANCHARUK': 'Гончарук',
  'HRYHORYEVA': 'Григорьева',
  'HRUSHEUSKAYA': 'Грушевская',
  'HUBSKAYA': 'Губская',
  'HUZAVA': 'Гузева',
  'KACHALAVA': 'Качалова',
  'KAPTSEVICH': 'Капцевич',
  'KARATSENKA': 'Каратенко',
  'KAROL': 'Кароль',
  'KARZHENKA': 'Корженко',
  'KASTSIANIEVICH': 'Кастяневич',
  'KASTSIUKOVICH': 'Костюкович',
  'KASTRAMA': 'Кострома',
  'KATSAPAU': 'Кацапов',
  'KATSIUK': 'Коцюк',
  'KAZACHOK': 'Козачок',
  'KHLYSTSIKAVA': 'Хлыстикова',
  'KIRICHKO': 'Киричко',
  'KLIMENKA': 'Клименко',
  'KRYVETSKAYA': 'Криветская',
  'KUDZKO': 'Кудько',
  'KUZNIATSOVA': 'Кузнецова',
  'LABKO': 'Лабко',
  'LAPTSIONAK': 'Лапционок',
  'LARYONETS': 'Ларионец',
  'MAKIENKO': 'Макиенко',
  'MALASHKEVICH': 'Малашкевич',
  'MIKHNEVICH': 'Михневич',
  'MILYUTCHYK': 'Милютчик',
  'MONICH': 'Монич',
  'MAROZAVA': 'Морозова',
  'NASIMAVA': 'Насимова',
  'NASTASCHUK': 'Настащук',
  'NOVIK': 'Новик',
  'NOVIKAVA': 'Новикова',
  'PADLUZHNY': 'Подлужный',
  'PALCHYK': 'Пальчик',
  'PAPLAUSKAYA': 'Поплавская',
  'PASHKEVICH': 'Пашкевич',
  'PAULIUKEVICH': 'Павлюкевич',
  'PIHASHAVA': 'Пигашева',
  'PIVAVAR': 'Пивовар',
  'ROMANOVSKAYA': 'Романовская',
  'RUBEL': 'Рубель',
  'RUDENKA': 'Руденко',
  'SAKHARAVA': 'Сахарова',
  'SAMETS': 'Самец',
  'SHAUCHENKA': 'Шовченко',
  'SHEKH': 'Шех',
  'SHIRSHOVA': 'Ширшова',
  'SIARHEICHYK': 'Сергейчик',
  'SINITSKAYA': 'Синицкая',
  'STASIUKEVICH': 'Стасюкевич',
  'STSIAZHKO': 'Стежко',
  'STRELNIKOVA': 'Стрельникова',
  'TRUBNIKAVA': 'Трубникова',
  'TSARENIA': 'Царенко',
  'TSIMAFEYENKA': 'Тимофеенко',
  'URBAN': 'Урбан',
  'VARABEI': 'Воробей',
  'VATSLAVAVA': 'Вацлавова',
  'VYSOTSKAYA': 'Высоцкая',
  'YERASTAVA': 'Ерастова',
  'YEFIMCHIK': 'Ефимчик',
  'YERMAKOVA': 'Ермакова',
  'ZALEUSKAYA': 'Залевская',
  'ZHOLUDZ': 'Жолудь',
  'ZIALIONENKAYA': 'Зелененькая',
  'AKSIANIUK': 'Аксенюк',
};

/**
 * Transliterate Latin name to Cyrillic using dictionary and fallback transliteration
 */
export function transliterateToCyrillic(latinName: string): string {
  if (!latinName) return '';
  
  // First check for known names word by word
  const words = latinName.split(' ');
  const translitWords: string[] = [];
  
  for (const word of words) {
    const upperWord = word.toUpperCase();
    if (NAME_CORRECTIONS[upperWord]) {
      translitWords.push(NAME_CORRECTIONS[upperWord]);
    } else {
      // Fallback to character-by-character transliteration
      let result = word;
      // Sort keys by length descending to match longer patterns first
      const sortedKeys = Object.keys(TRANSLIT_MAP).sort((a, b) => b.length - a.length);
      for (const key of sortedKeys) {
        const regex = new RegExp(key, 'g');
        result = result.replace(regex, TRANSLIT_MAP[key]);
      }
      // Capitalize first letter
      result = result.charAt(0).toUpperCase() + result.slice(1).toLowerCase();
      translitWords.push(result);
    }
  }
  
  return translitWords.join(' ');
}

/**
 * Transliterate Cyrillic name to Latin (reverse transliteration)
 */
export function transliterateToLatin(cyrillicName: string): string {
  if (!cyrillicName) return '';
  
  // Build reverse map
  const reverseMap: Record<string, string> = {};
  for (const [latin, cyrillic] of Object.entries(TRANSLIT_MAP)) {
    // Only use lowercase mappings to avoid duplicates
    if (latin === latin.toLowerCase() && !reverseMap[cyrillic]) {
      reverseMap[cyrillic] = latin;
    }
  }
  
  // Also add uppercase mappings
  reverseMap['А'] = 'A'; reverseMap['Б'] = 'B'; reverseMap['В'] = 'V';
  reverseMap['Г'] = 'G'; reverseMap['Д'] = 'D'; reverseMap['Е'] = 'E';
  reverseMap['Ё'] = 'YO'; reverseMap['Ж'] = 'ZH'; reverseMap['З'] = 'Z';
  reverseMap['И'] = 'I'; reverseMap['Й'] = 'Y'; reverseMap['К'] = 'K';
  reverseMap['Л'] = 'L'; reverseMap['М'] = 'M'; reverseMap['Н'] = 'N';
  reverseMap['О'] = 'O'; reverseMap['П'] = 'P'; reverseMap['Р'] = 'R';
  reverseMap['С'] = 'S'; reverseMap['Т'] = 'T'; reverseMap['У'] = 'U';
  reverseMap['Ф'] = 'F'; reverseMap['Х'] = 'KH'; reverseMap['Ц'] = 'TS';
  reverseMap['Ч'] = 'CH'; reverseMap['Ш'] = 'SH'; reverseMap['Щ'] = 'SHCH';
  reverseMap['Ы'] = 'Y'; reverseMap['Ь'] = "'"; reverseMap['Э'] = 'E';
  reverseMap['Ю'] = 'YU'; reverseMap['Я'] = 'YA';
  
  let result = '';
  for (const char of cyrillicName) {
    result += reverseMap[char] || char;
  }
  
  return result;
}

/**
 * Check if two names are similar (fuzzy match)
 * Compares both original and transliterated versions
 */
export function namesMatch(name1: string, name2: string, threshold = 0.8): boolean {
  if (!name1 || !name2) return false;
  
  const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\s]/gu, '').trim();
  
  const n1 = normalize(name1);
  const n2 = normalize(name2);
  
  // Exact match
  if (n1 === n2) return true;
  
  // Check if all words from shorter name are in longer name
  const words1 = n1.split(/\s+/).filter(w => w.length > 2);
  const words2 = n2.split(/\s+/).filter(w => w.length > 2);
  
  if (words1.length < 2 || words2.length < 2) return false;
  
  const shorter = words1.length <= words2.length ? words1 : words2;
  const longer = words1.length <= words2.length ? words2 : words1;
  
  // At least 2 words must match
  const matchCount = shorter.filter(w => longer.some(lw => lw.includes(w) || w.includes(lw))).length;
  return matchCount >= 2;
}

/**
 * Try to match a Latin name (from card) to Cyrillic name (from profile)
 */
export function matchCardNameToProfile(cardName: string, profileName: string): boolean {
  if (!cardName || !profileName) return false;
  
  // Try direct transliteration match
  const transliterated = transliterateToCyrillic(cardName);
  if (namesMatch(transliterated, profileName)) {
    return true;
  }
  
  // Try reverse transliteration match
  const latinProfile = transliterateToLatin(profileName);
  if (namesMatch(cardName.toUpperCase(), latinProfile.toUpperCase())) {
    return true;
  }
  
  return false;
}
