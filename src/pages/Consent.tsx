import { GlassCard } from "@/components/ui/GlassCard";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { 
  Shield, Building2, Mail, FileText, 
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

export default function Consent() {
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
                  <ul className="list-disc list-inside ml-2 space-y-1">
                    <li><a href="https://gorbova.by" className="text-primary hover:underline">gorbova.by</a></li>
                    <li><a href="https://gorbova.club" className="text-primary hover:underline">gorbova.club</a></li>
                    <li><a href="https://gorbova.pro" className="text-primary hover:underline">gorbova.pro</a></li>
                    <li><a href="https://gorbova.getcourse.ru" className="text-primary hover:underline">gorbova.getcourse.ru</a></li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Согласие на обработку персональных данных */}
        <GlassCard className="p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-primary/10 shrink-0">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <div className="w-full">
              <h2 className="text-xl font-semibold mb-4">Согласие на обработку персональных данных</h2>
              <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
                <p>
                  Настоящим принимаю решение о предоставлении моих персональных данных и даю 
                  Оператору — ЗАО «АЖУР инкам» в соответствии со статьей 5 Закона Республики Беларусь 
                  от 07.05.2021 № 99-З «О защите персональных данных» согласие на обработку 
                  следующих персональных данных:
                </p>

                <Separator className="my-4" />

                {/* 1. Для исполнения договора */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <UserPlus className="h-5 w-5 text-primary" />
                    <h3 className="font-medium text-foreground">1. Для заключения и исполнения договора:</h3>
                  </div>
                  <ul className="list-disc list-inside space-y-1 ml-7">
                    <li>Фамилия, имя, отчество</li>
                    <li>Паспортные данные (серия, номер, дата выдачи, орган выдачи)</li>
                    <li>Адрес регистрации и проживания</li>
                    <li>Номер телефона</li>
                    <li>Адрес электронной почты (e-mail)</li>
                    <li>Ссылка на аккаунт в Instagram</li>
                    <li>Ссылка на аккаунт в Telegram</li>
                  </ul>
                </div>

                <Separator className="my-4" />

                {/* 2. Для маркетинга и рассылок */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Megaphone className="h-5 w-5 text-primary" />
                    <h3 className="font-medium text-foreground">2. Для маркетинга и рассылок:</h3>
                  </div>
                  <ul className="list-disc list-inside space-y-1 ml-7">
                    <li>Фамилия, имя, отчество</li>
                    <li>Номер телефона</li>
                    <li>Адрес электронной почты (e-mail)</li>
                  </ul>
                </div>

                <Separator className="my-4" />

                <p>
                  Настоящее согласие является <strong className="text-foreground">конкретным, предметным, 
                  информированным, сознательным и однозначным</strong>.
                </p>
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
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><a href="https://gorbova.by" className="text-primary hover:underline">gorbova.by</a></li>
                  <li><a href="https://gorbova.club" className="text-primary hover:underline">gorbova.club</a></li>
                  <li><a href="https://gorbova.pro" className="text-primary hover:underline">gorbova.pro</a></li>
                  <li><a href="https://gorbova.getcourse.ru" className="text-primary hover:underline">gorbova.getcourse.ru</a></li>
                </ul>
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
                        <TableCell className="text-center text-primary font-medium">Да</TableCell>
                        <TableCell className="text-muted-foreground">Отсутствуют</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">2</TableCell>
                        <TableCell>Общие</TableCell>
                        <TableCell>Видеозапись с изображением Пользователя</TableCell>
                        <TableCell className="text-center text-primary font-medium">Да</TableCell>
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
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Фамилия, имя, отчество (при наличии)</li>
                  <li>Контактную информацию (номер телефона, адрес электронной почты или почтовый адрес)</li>
                  <li>Перечень персональных данных, обработка которых подлежит прекращению</li>
                </ul>
                <p>
                  Отзыв согласия направляется по адресу: 220052, Республика Беларусь, г. Минск, а/я 63, 
                  или по электронной почте: <a href="mailto:info@ajoure.by" className="text-primary hover:underline">info@ajoure.by</a>.
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
