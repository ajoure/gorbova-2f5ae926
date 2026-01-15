import { GlassCard } from "@/components/ui/GlassCard";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { 
  Shield, Building2, FileText, 
  UserPlus, Megaphone, Camera, ExternalLink, Clock, Send
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Link } from "react-router-dom";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function Consent() {
  const accountCreationData = [
    "Фамилия, имя, отчество",
    "Пол",
    "Возраст",
    "Дата и год рождения",
    "Телефон",
    "Адрес электронной почты (e-mail)",
    "Адрес проживания",
    "Ссылка на аккаунты в социальных сетях",
    "Банковские реквизиты, заполняемые при оплате услуг",
    "Изображение Пользователя",
    "Видеозапись с изображением Пользователя"
  ];

  const advertisingData = [
    "Фамилия, имя, отчество",
    "Пол",
    "Возраст",
    "Дата и год рождения",
    "Телефон",
    "Адрес электронной почты (e-mail)",
    "Адрес проживания",
    "Ссылка на аккаунты в социальных сетях",
    "Банковские реквизиты, заполняемые при оплате услуг",
    "Данные документа, удостоверяющего личность"
  ];

  const websites = [
    { name: "gorbova.by", url: "https://gorbova.by" },
    { name: "gorbova.club", url: "https://gorbova.club" },
    { name: "gorbova.pro", url: "https://gorbova.pro" },
    { name: "gorbova.getcourse.ru", url: "https://gorbova.getcourse.ru" }
  ];

  return (
    <div className="min-h-screen bg-background">
      <LandingHeader />

      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            Согласие на обработку персональных данных
          </h1>
          <p className="text-muted-foreground">
            на сайте в сети Интернет
          </p>
        </div>

        {/* Основной текст согласия */}
        <GlassCard className="p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-primary/10 shrink-0">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <div className="w-full">
              <h2 className="text-xl font-semibold mb-4">Согласие на обработку персональных данных</h2>
              <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
                <p className="text-foreground">
                  Настоящим принимаю решение о предоставлении моих персональных данных и даю 
                  Оператору — <strong>ЗАО «АЖУР инкам»</strong>, в лице Директора управляющей организации 
                  <strong> Коврижкина Алексея Игоревича</strong>, действующего на основании Устава, 
                  в соответствии со статьей 5 Закона Республики Беларусь от 07.05.2021 № 99-З 
                  «О защите персональных данных», согласие на обработку следующих персональных данных:
                </p>

                <Separator className="my-6" />

                {/* 1. При создании учётной записи */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <UserPlus className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="font-semibold text-lg text-foreground">1. При создании учётной записи:</h3>
                  </div>
                  <div className="grid gap-2 ml-11">
                    {accountCreationData.map((item, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator className="my-6" />

                {/* 2. При осуществлении рекламной деятельности */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Megaphone className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="font-semibold text-lg text-foreground">2. При осуществлении рекламной деятельности:</h3>
                  </div>
                  <div className="grid gap-2 ml-11">
                    {advertisingData.map((item, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator className="my-6" />

                <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                  <p className="text-foreground font-medium text-center">
                    Согласие на обработку персональных данных является{" "}
                    <Badge variant="secondary" className="mx-1">конкретным</Badge>
                    <Badge variant="secondary" className="mx-1">предметным</Badge>
                    <Badge variant="secondary" className="mx-1">информированным</Badge>
                    <Badge variant="secondary" className="mx-1">сознательным</Badge>
                    и
                    <Badge variant="secondary" className="mx-1">однозначным</Badge>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Реквизиты оператора */}
        <GlassCard className="p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-primary/10 shrink-0">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold mb-4">Оператор персональных данных</h2>
              <div className="space-y-3 text-sm">
                <p className="font-medium text-base">
                  Закрытое акционерное общество «АЖУР инкам»
                </p>
                <div className="space-y-2 text-muted-foreground">
                  <p>
                    Почтовый адрес: 220052, Республика Беларусь, г. Минск, а/я 63
                  </p>
                  <p>Адреса в сети Интернет:</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {websites.map((site, index) => (
                      <a 
                        key={index}
                        href={site.url} 
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-sm"
                      >
                        {site.name}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Порядок выражения согласия */}
        <GlassCard className="p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-primary/10 shrink-0">
              <Send className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold mb-4">Порядок выражения согласия</h2>
              <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
                <p>
                  Я соглашаюсь с тем, что считаюсь давшим(-ей) согласие на обработку своих персональных данных, 
                  внесенных в поля формы, в момент проставления символа в чек-боксе (в поле для ввода) 
                  в сети Интернет по адресам:
                </p>
                <div className="flex flex-wrap gap-2">
                  {websites.map((site, index) => (
                    <a 
                      key={index}
                      href={site.url} 
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors text-sm"
                    >
                      {site.name}
                    </a>
                  ))}
                </div>
                <p>
                  <strong className="text-foreground">включая все домены, субдомены и страницы</strong>, их содержимое, 
                  а также интернет-сервисы и программное обеспечение, предлагаемые Оператором к использованию на этих Сайтах.
                </p>
                <p>
                  Согласие считается данным при проставлении отметки рядом с текстом: 
                  «Я даю согласие на обработку моих персональных данных в соответствии с условиями 
                  политики конфиденциальности» или иным аналогичным текстом.
                </p>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Таблица с категориями персональных данных для распространения */}
        <GlassCard className="p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-primary/10 shrink-0">
              <Camera className="h-6 w-6 text-primary" />
            </div>
            <div className="w-full">
              <h2 className="text-xl font-semibold mb-4">Согласие на распространение персональных данных</h2>
              <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
                <p>
                  Настоящим даю согласие на распространение следующих категорий персональных данных:
                </p>
                
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">№</TableHead>
                        <TableHead>Категория</TableHead>
                        <TableHead>Перечень персональных данных</TableHead>
                        <TableHead className="text-center">Разрешено</TableHead>
                        <TableHead>Условия и запреты</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">1</TableCell>
                        <TableCell>Общие</TableCell>
                        <TableCell>Изображение (в том числе фотографии) Пользователя</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="default" className="bg-green-500/20 text-green-700 dark:text-green-400">Да</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">Отсутствуют</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">2</TableCell>
                        <TableCell>Общие</TableCell>
                        <TableCell>Видеозапись с изображением Пользователя</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="default" className="bg-green-500/20 text-green-700 dark:text-green-400">Да</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">Отсутствуют</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Срок действия и отзыв согласия */}
        <GlassCard className="p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-primary/10 shrink-0">
              <Clock className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold mb-4">Срок действия и отзыв согласия</h2>
              <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
                <p>
                  Настоящее согласие действует со дня его предоставления Оператору до дня получения Оператором 
                  от Пользователя требования о прекращении обработки персональных данных.
                </p>
                <p>
                  Требование должно включать:
                </p>
                <ul className="space-y-2 ml-2">
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-2" />
                    <span>Фамилия, имя, отчество (при наличии)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-2" />
                    <span>Контактную информацию (номер телефона, адрес электронной почты или почтовый адрес)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-2" />
                    <span>Перечень персональных данных, обработка которых подлежит прекращению</span>
                  </li>
                </ul>
                <p>
                  Отзыв согласия направляется по адресу: <strong className="text-foreground">220052, Республика Беларусь, г. Минск, а/я 63</strong>, 
                  или по электронной почте: <a href="mailto:info@ajoure.by" className="text-primary hover:underline font-medium">info@ajoure.by</a>.
                </p>
                <p>
                  Действие согласия прекращается с момента поступления Оператору такого требования.
                </p>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Ссылка на политику конфиденциальности */}
        <GlassCard className="p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-primary/10 shrink-0">
              <ExternalLink className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold mb-4">Политика конфиденциальности</h2>
              <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
                <p>
                  Полный текст Положения о политике в отношении обработки персональных данных 
                  доступен по ссылке:
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link 
                    to="/privacy" 
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    <FileText className="h-4 w-4" />
                    Политика конфиденциальности
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </GlassCard>
      </main>

      <LandingFooter />
    </div>
  );
}
