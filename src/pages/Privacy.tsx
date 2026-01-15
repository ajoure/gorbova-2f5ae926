import { GlassCard } from "@/components/ui/GlassCard";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { PolicyVersionHistory } from "@/components/privacy/PolicyVersionHistory";
import { usePolicyVersions } from "@/hooks/usePolicyVersions";
import { downloadPolicyPdf } from "@/utils/policyPdfExport";
import { Button } from "@/components/ui/button";
import { 
  Shield, Building2, Mail, FileText, Database, 
  Eye, Lock, UserCheck, Clock, AlertCircle, Download, Globe,
  Scale, Send, Users, Trash2
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

export default function Privacy() {
  const { data: policyVersions, isLoading: isLoadingVersions } = usePolicyVersions();

  return (
    <div className="min-h-screen bg-background">
      <LandingHeader />

      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            Положение о политике в отношении обработки персональных данных
          </h1>
          <p className="text-muted-foreground mb-2">
            Утверждено Директором ЗАО «АЖУР инкам» Коврижкиным А.И.
          </p>
          <p className="text-muted-foreground mb-4">
            1 января 2026 года
          </p>
          <Button variant="outline" onClick={downloadPolicyPdf}>
            <Download className="h-4 w-4 mr-2" />
            Скачать PDF
          </Button>
        </div>

        {/* 1. Общие положения */}
        <GlassCard className="p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-primary/10 shrink-0">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold mb-4">1. Общие положения</h2>
              <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
                <p>
                  <strong className="text-foreground">1.1.</strong> Закрытое акционерное общество «АЖУР инкам» (далее – ЗАО «АЖУР инкам») 
                  уделяет особое внимание защите персональных данных при их обработке и с уважением 
                  относится к соблюдению прав субъектов персональных данных.
                </p>
                <p>
                  Утверждение Положения о политике в отношении обработки персональных данных (далее – Политика) 
                  является одной из принимаемых ЗАО «АЖУР инкам» мер по защите персональных данных, 
                  предусмотренных статьей 17 Закона Республики Беларусь от 7 мая 2021 г. № 99-З 
                  «О защите персональных данных» (далее – Закон).
                </p>
                <p>
                  <strong className="text-foreground">1.2.</strong> Политика разъясняет субъектам персональных данных, 
                  как и для каких целей их персональные данные собираются, используются или иным образом обрабатываются, 
                  а также отражает имеющиеся в связи с этим у субъектов персональных данных права и механизм их реализации.
                </p>
                <p>
                  Политика не применяется к обработке персональных данных в процессе трудовой деятельности 
                  и при осуществлении административных процедур (в отношении работников и бывших работников), 
                  а также при обработке cookie-файлов на интернет-сайте ЗАО «АЖУР инкам».
                </p>
                <p>
                  <strong className="text-foreground">1.3.</strong> Почтовый адрес ЗАО «АЖУР инкам»: 
                  220052, Республика Беларусь, г. Минск, а/я 63
                </p>
                <p>Адреса в сети Интернет:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><a href="https://gorbova.by" className="text-primary hover:underline">gorbova.by</a></li>
                  <li><a href="https://gorbova.club" className="text-primary hover:underline">gorbova.club</a></li>
                  <li><a href="https://gorbova.pro" className="text-primary hover:underline">gorbova.pro</a></li>
                  <li><a href="https://gorbova.getcourse.ru" className="text-primary hover:underline">gorbova.getcourse.ru</a></li>
                </ul>
                <p>
                  <strong className="text-foreground">1.4.</strong> В настоящей Политике используются термины 
                  и их определения в значении, определенном Законом.
                </p>
                <p>
                  <strong className="text-foreground">1.5.</strong> ЗАО «АЖУР инкам» осуществляет обработку 
                  только тех персональных данных, которые необходимы для выполнения заявленных целей, 
                  и не допускает их избыточной обработки.
                </p>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* 2. Цели, категории, перечень данных */}
        <GlassCard className="p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-primary/10 shrink-0">
              <Database className="h-6 w-6 text-primary" />
            </div>
            <div className="w-full">
              <h2 className="text-xl font-semibold mb-4">
                2. Цели, категории субъектов, перечень данных, правовые основания и сроки обработки
              </h2>
              <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
                <p>
                  ЗАО «АЖУР инкам» осуществляет обработку персональных данных субъектов персональных данных 
                  в целях, объеме, на правовых основаниях и в сроки согласно Приложению 1 к настоящей Политике.
                </p>
                
                <Separator className="my-4" />
                
                <h3 className="font-semibold text-foreground">Приложение 1. Цели и условия обработки персональных данных</h3>
                
                <div className="overflow-x-auto mt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">№</TableHead>
                        <TableHead>Цель обработки</TableHead>
                        <TableHead>Категории субъектов</TableHead>
                        <TableHead>Перечень персональных данных</TableHead>
                        <TableHead>Правовое основание</TableHead>
                        <TableHead>Срок обработки</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">1</TableCell>
                        <TableCell>Заключение и исполнение договоров</TableCell>
                        <TableCell>Клиенты и контрагенты</TableCell>
                        <TableCell className="text-xs">
                          ФИО, паспортные данные, адрес регистрации/проживания, номер телефона, 
                          e-mail, ссылка на Instagram/Telegram
                        </TableCell>
                        <TableCell>Договор (абз. 3 ст. 6 Закона)</TableCell>
                        <TableCell>10 лет с даты окончания договора</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">2</TableCell>
                        <TableCell>Маркетинг, рассылки, рекламные акции</TableCell>
                        <TableCell>Потенциальные и действующие клиенты</TableCell>
                        <TableCell className="text-xs">
                          ФИО, номер телефона, e-mail
                        </TableCell>
                        <TableCell>Согласие субъекта (ст. 5 Закона)</TableCell>
                        <TableCell>5 лет или до отзыва согласия</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">3</TableCell>
                        <TableCell>Рассмотрение обращений граждан и жалоб</TableCell>
                        <TableCell>Заявители</TableCell>
                        <TableCell className="text-xs">
                          ФИО, адрес проживания, номер телефона, e-mail, содержание обращения
                        </TableCell>
                        <TableCell>Законодательство об обращениях граждан</TableCell>
                        <TableCell>5 лет</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* 3. Трансграничная передача */}
        <GlassCard className="p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-primary/10 shrink-0">
              <Globe className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold mb-4">3. Трансграничная передача персональных данных</h2>
              <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
                <p>
                  Трансграничная передача персональных данных осуществляется посредством социальных сетей 
                  и мессенджеров, в частности Instagram, Telegram.
                </p>
                <p>
                  При передаче персональных данных за пределы Республики Беларусь ЗАО «АЖУР инкам» 
                  обеспечивает соблюдение требований законодательства о защите персональных данных.
                </p>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* 4. Права субъектов персональных данных */}
        <GlassCard className="p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-primary/10 shrink-0">
              <UserCheck className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold mb-4">4. Права субъектов персональных данных</h2>
              <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
                <p>
                  <strong className="text-foreground">4.1.</strong> Субъект персональных данных имеет право:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-2">
                  <li>
                    <strong>Отозвать согласие</strong> на обработку персональных данных в любое время
                  </li>
                  <li>
                    <strong>Получить информацию</strong> о том, какие данные обрабатываются, 
                    кому и с какой целью они были предоставлены
                  </li>
                  <li>
                    <strong>Требовать изменения</strong> неполных, устаревших или недостоверных данных
                  </li>
                  <li>
                    <strong>Требовать удаления</strong> персональных данных (при отсутствии правовых оснований 
                    для их дальнейшей обработки)
                  </li>
                  <li>
                    <strong>Обжаловать действия</strong> ЗАО «АЖУР инкам» в уполномоченный орган 
                    или в судебном порядке
                  </li>
                </ul>
                <p>
                  <strong className="text-foreground">4.2.</strong> Для реализации своих прав субъект персональных данных 
                  может обратиться по адресу: 220052, Республика Беларусь, г. Минск, а/я 63, 
                  или по электронной почте: <a href="mailto:info@ajoure.by" className="text-primary hover:underline">info@ajoure.by</a>.
                </p>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* 5. Меры по защите данных */}
        <GlassCard className="p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-primary/10 shrink-0">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold mb-4">5. Меры по обеспечению защиты персональных данных</h2>
              <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
                <p>
                  ЗАО «АЖУР инкам» принимает организационные и технические меры для защиты персональных данных 
                  от несанкционированного доступа, уничтожения, изменения, блокирования, копирования, 
                  распространения и иных неправомерных действий, в том числе:
                </p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Назначение ответственного за организацию обработки персональных данных</li>
                  <li>Издание локальных правовых актов по вопросам обработки персональных данных</li>
                  <li>Ознакомление работников с требованиями законодательства и локальными актами</li>
                  <li>Применение технических средств защиты информации</li>
                  <li>Контроль за соблюдением требований к защите персональных данных</li>
                </ul>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* 6. Заключительные положения */}
        <GlassCard className="p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-primary/10 shrink-0">
              <Scale className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold mb-4">6. Заключительные положения</h2>
              <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
                <p>
                  <strong className="text-foreground">6.1.</strong> Настоящая Политика размещается в открытом доступе 
                  на интернет-сайтах ЗАО «АЖУР инкам» и доводится до сведения субъектов персональных данных 
                  иным доступным способом.
                </p>
                <p>
                  <strong className="text-foreground">6.2.</strong> ЗАО «АЖУР инкам» вправе вносить изменения 
                  в настоящую Политику. При внесении изменений актуальная редакция размещается на интернет-сайте.
                </p>
                <p>
                  <strong className="text-foreground">6.3.</strong> Правовое основание обработки персональных данных — 
                  Закон Республики Беларусь от 7 мая 2021 г. № 99-З «О защите персональных данных».
                </p>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Ссылка на согласие */}
        <GlassCard className="p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-primary/10 shrink-0">
              <Send className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold mb-4">Согласие на обработку персональных данных</h2>
              <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
                <p>
                  Для ознакомления с текстом согласия на обработку персональных данных перейдите по ссылке:
                </p>
                <Link 
                  to="/consent" 
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                  <FileText className="h-4 w-4" />
                  Согласие на обработку персональных данных
                </Link>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* История версий */}
        <div className="mt-8">
          <PolicyVersionHistory 
            versions={policyVersions || []} 
            isLoading={isLoadingVersions} 
          />
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
