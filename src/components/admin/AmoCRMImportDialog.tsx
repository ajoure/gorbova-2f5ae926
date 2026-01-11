import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  Upload, FileSpreadsheet, AlertCircle, CheckCircle2, 
  Loader2, X, User, Mail, Phone, AtSign, ArrowRight
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface AmoCRMImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface ParsedContact {
  amo_id: string;
  full_name: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  emails: string[];
  phone?: string;
  phones: string[];
  telegram_username?: string;
  created_at?: string;
  // Matching results
  matched_profile_id?: string;
  matched_profile_name?: string;
  matched_by?: 'email' | 'phone' | 'name' | 'telegram' | 'none';
  // Import status
  import_status?: 'pending' | 'exists' | 'created' | 'updated' | 'error';
  import_error?: string;
}

interface ImportStats {
  total: number;
  matched: number;
  unmatched: number;
  created: number;
  updated: number;
  errors: number;
}

// Normalize phone number for comparison
function normalizePhone(phone: string): string {
  if (!phone) return '';
  // Remove all non-digits except leading +
  let normalized = phone.replace(/[^\d+]/g, '');
  // Remove leading + and convert 8 -> 7 for Russian numbers
  if (normalized.startsWith('+')) normalized = normalized.slice(1);
  if (normalized.startsWith('8') && normalized.length === 11) {
    normalized = '7' + normalized.slice(1);
  }
  // Add 375 prefix for Belarus numbers without country code
  if (normalized.length === 9 && (normalized.startsWith('29') || normalized.startsWith('33') || normalized.startsWith('44') || normalized.startsWith('25'))) {
    normalized = '375' + normalized;
  }
  return normalized;
}

// Normalize email for comparison
function normalizeEmail(email: string): string {
  return email?.toLowerCase().trim() || '';
}

// Normalize name for fuzzy matching
function normalizeName(name: string): string {
  return name?.toLowerCase().replace(/[^\p{L}\s]/gu, '').trim() || '';
}

// Check if two names are similar (fuzzy match)
function namesMatch(name1: string, name2: string): boolean {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);
  if (!n1 || !n2) return false;
  
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

// Parse amoCRM contact row
function parseContactRow(row: Record<string, any>): ParsedContact | null {
  const id = String(row['ID'] || '');
  if (!id || id === '-') return null;
  
  const firstName = String(row['Имя'] || row['First name'] || '').trim();
  const lastName = String(row['Фамилия'] || row['Last name'] || '').trim();
  const fullName = String(row['Наименование'] || row['Name'] || `${firstName} ${lastName}`.trim() || '').trim();
  
  if (!fullName || fullName === '-') return null;
  
  // Collect all emails
  const emails: string[] = [];
  const emailFields = ['Рабочий email', 'Личный email', 'Другой email', 'Work email', 'Personal email', 'Other email'];
  for (const field of emailFields) {
    const email = String(row[field] || '').trim();
    if (email && email !== '-' && email.includes('@')) {
      emails.push(normalizeEmail(email));
    }
  }
  
  // Collect all phones
  const phones: string[] = [];
  const phoneFields = ['Рабочий телефон', 'Рабочий прямой телефон', 'Мобильный телефон', 'Домашний телефон', 'Другой телефон', 'Work phone', 'Mobile phone', 'Home phone', 'Other phone'];
  for (const field of phoneFields) {
    const phone = String(row[field] || '').trim().replace(/'/g, '');
    if (phone && phone !== '-') {
      const normalized = normalizePhone(phone);
      if (normalized.length >= 9) {
        phones.push(normalized);
      }
    }
  }
  
  // Telegram username
  const telegramRaw = String(row['Телеграм (контакт)'] || row['Никнейм Телеграм (контакт)'] || row['Telegram'] || '').trim();
  const telegram_username = telegramRaw && telegramRaw !== '-' ? telegramRaw.replace('@', '') : undefined;
  
  return {
    amo_id: id,
    full_name: fullName,
    first_name: firstName || undefined,
    last_name: lastName || undefined,
    email: emails[0],
    emails,
    phone: phones[0],
    phones,
    telegram_username,
    created_at: row['Дата создания'] || undefined,
    matched_by: 'none',
    import_status: 'pending',
  };
}

export default function AmoCRMImportDialog({ open, onOpenChange, onSuccess }: AmoCRMImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [contacts, setContacts] = useState<ParsedContact[]>([]);
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [autoMatch, setAutoMatch] = useState(true);
  const queryClient = useQueryClient();

  const handleFileDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFile(droppedFile);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) handleFile(selectedFile);
  };

  const handleFile = async (selectedFile: File) => {
    const isXLSX = selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls');
    
    if (!isXLSX) {
      toast.error("Поддерживаются только Excel файлы (.xlsx, .xls)");
      return;
    }

    setFile(selectedFile);
    setIsParsing(true);

    try {
      const buffer = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

      console.log("amoCRM Excel parsed:", { sheetName, rowCount: rows.length, columns: rows[0] ? Object.keys(rows[0]) : [] });

      // Parse contacts
      const parsed: ParsedContact[] = [];
      for (const row of rows) {
        const contact = parseContactRow(row);
        if (contact) parsed.push(contact);
      }

      if (parsed.length === 0) {
        throw new Error("Не удалось распознать контакты. Проверьте формат файла.");
      }

      // Auto-match contacts if enabled
      if (autoMatch) {
        await matchContacts(parsed);
      }

      setContacts(parsed);
      calculateStats(parsed);
      toast.success(`Загружено ${parsed.length} контактов`);
    } catch (err: any) {
      toast.error("Ошибка парсинга: " + err.message);
      setFile(null);
    } finally {
      setIsParsing(false);
    }
  };

  const matchContacts = async (contactsList: ParsedContact[]) => {
    // Collect all unique emails and phones for batch lookup
    const allEmails = [...new Set(contactsList.flatMap(c => c.emails))];
    const allPhones = [...new Set(contactsList.flatMap(c => c.phones))];

    // Fetch profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email, emails, phone, phones, telegram_username')
      .or(`email.in.(${allEmails.join(',')}),phone.in.(${allPhones.join(',')})`);
    
    // Also fetch all profiles for name matching
    const { data: allProfiles } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, telegram_username');

    // Build lookup maps
    const emailMap = new Map<string, { id: string; name: string }>();
    const phoneMap = new Map<string, { id: string; name: string }>();
    const nameMap = new Map<string, { id: string; name: string }>();
    const telegramMap = new Map<string, { id: string; name: string }>();
    
    allProfiles?.forEach(p => {
      if (p.email) emailMap.set(normalizeEmail(p.email), { id: p.id, name: p.full_name || '' });
      if (p.phone) phoneMap.set(normalizePhone(p.phone), { id: p.id, name: p.full_name || '' });
      if (p.full_name) nameMap.set(normalizeName(p.full_name), { id: p.id, name: p.full_name });
      if (p.telegram_username) telegramMap.set(p.telegram_username.toLowerCase(), { id: p.id, name: p.full_name || '' });
      
      // Also index additional emails/phones from jsonb arrays
      const profileEmails = (p as any).emails as string[] | null;
      const profilePhones = (p as any).phones as string[] | null;
      if (profileEmails) {
        profileEmails.forEach(e => emailMap.set(normalizeEmail(e), { id: p.id, name: p.full_name || '' }));
      }
      if (profilePhones) {
        profilePhones.forEach(ph => phoneMap.set(normalizePhone(ph), { id: p.id, name: p.full_name || '' }));
      }
    });

    // Match each contact
    for (const contact of contactsList) {
      // Try email match first (highest priority)
      for (const email of contact.emails) {
        const match = emailMap.get(email);
        if (match) {
          contact.matched_profile_id = match.id;
          contact.matched_profile_name = match.name;
          contact.matched_by = 'email';
          break;
        }
      }
      if (contact.matched_by !== 'none') continue;

      // Try phone match
      for (const phone of contact.phones) {
        const match = phoneMap.get(phone);
        if (match) {
          contact.matched_profile_id = match.id;
          contact.matched_profile_name = match.name;
          contact.matched_by = 'phone';
          break;
        }
      }
      if (contact.matched_by !== 'none') continue;

      // Try telegram match
      if (contact.telegram_username) {
        const match = telegramMap.get(contact.telegram_username.toLowerCase());
        if (match) {
          contact.matched_profile_id = match.id;
          contact.matched_profile_name = match.name;
          contact.matched_by = 'telegram';
          continue;
        }
      }

      // Try name match (fuzzy)
      const normalizedName = normalizeName(contact.full_name);
      const match = nameMap.get(normalizedName);
      if (match) {
        contact.matched_profile_id = match.id;
        contact.matched_profile_name = match.name;
        contact.matched_by = 'name';
        continue;
      }
      
      // Try fuzzy name matching
      for (const [profileName, profile] of nameMap) {
        if (namesMatch(contact.full_name, profile.name)) {
          contact.matched_profile_id = profile.id;
          contact.matched_profile_name = profile.name;
          contact.matched_by = 'name';
          break;
        }
      }
    }
  };

  const calculateStats = (contactsList: ParsedContact[]) => {
    setStats({
      total: contactsList.length,
      matched: contactsList.filter(c => c.matched_by !== 'none').length,
      unmatched: contactsList.filter(c => c.matched_by === 'none').length,
      created: 0,
      updated: 0,
      errors: 0,
    });
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      let created = 0;
      let updated = 0;
      let errors = 0;
      
      for (const contact of contacts) {
        try {
          if (contact.matched_profile_id && updateExisting) {
            // Update existing profile
            const updateData: any = {};
            
            // Only update fields that are not already set or add to arrays
            if (contact.email) updateData.email = contact.email;
            if (contact.phone) updateData.phone = contact.phone;
            if (contact.telegram_username) updateData.telegram_username = contact.telegram_username;
            if (contact.emails.length > 0) updateData.emails = contact.emails;
            if (contact.phones.length > 0) updateData.phones = contact.phones.map(p => '+' + p);
            updateData.external_id_amo = contact.amo_id;
            
            const { error } = await supabase
              .from('profiles')
              .update(updateData)
              .eq('id', contact.matched_profile_id);
            
            if (error) {
              contact.import_status = 'error';
              contact.import_error = error.message;
              errors++;
            } else {
              contact.import_status = 'updated';
              updated++;
            }
          } else if (!contact.matched_profile_id) {
            // Create new profile
            const { error } = await supabase
              .from('profiles')
              .insert({
                full_name: contact.full_name,
                first_name: contact.first_name,
                last_name: contact.last_name,
                email: contact.email,
                emails: contact.emails,
                phone: contact.phone ? '+' + contact.phone : undefined,
                phones: contact.phones.map(p => '+' + p),
                telegram_username: contact.telegram_username,
                external_id_amo: contact.amo_id,
                status: 'ghost',
                source: 'amocrm_import',
              });
            
            if (error) {
              contact.import_status = 'error';
              contact.import_error = error.message;
              errors++;
            } else {
              contact.import_status = 'created';
              created++;
            }
          } else {
            contact.import_status = 'exists';
          }
        } catch (err: any) {
          contact.import_status = 'error';
          contact.import_error = err.message;
          errors++;
        }
      }
      
      return { created, updated, errors };
    },
    onSuccess: ({ created, updated, errors }) => {
      setStats(prev => prev ? { ...prev, created, updated, errors } : null);
      queryClient.invalidateQueries({ queryKey: ['admin-contacts'] });
      toast.success(`Импорт завершён: ${created} создано, ${updated} обновлено, ${errors} ошибок`);
      onSuccess?.();
    },
    onError: (error) => {
      toast.error("Ошибка импорта: " + error.message);
    },
  });

  const handleReset = () => {
    setFile(null);
    setContacts([]);
    setStats(null);
  };

  const getMatchBadge = (matchedBy: ParsedContact['matched_by']) => {
    switch (matchedBy) {
      case 'email':
        return <Badge variant="default" className="bg-blue-500/20 text-blue-600 border-blue-500/30"><Mail className="w-3 h-3 mr-1" />Email</Badge>;
      case 'phone':
        return <Badge variant="default" className="bg-green-500/20 text-green-600 border-green-500/30"><Phone className="w-3 h-3 mr-1" />Телефон</Badge>;
      case 'name':
        return <Badge variant="default" className="bg-purple-500/20 text-purple-600 border-purple-500/30"><User className="w-3 h-3 mr-1" />Имя</Badge>;
      case 'telegram':
        return <Badge variant="default" className="bg-cyan-500/20 text-cyan-600 border-cyan-500/30"><AtSign className="w-3 h-3 mr-1" />Telegram</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground">Не найден</Badge>;
    }
  };

  const getStatusBadge = (status: ParsedContact['import_status']) => {
    switch (status) {
      case 'created':
        return <Badge variant="default" className="bg-green-500/20 text-green-600 border-green-500/30"><CheckCircle2 className="w-3 h-3 mr-1" />Создан</Badge>;
      case 'updated':
        return <Badge variant="default" className="bg-blue-500/20 text-blue-600 border-blue-500/30"><CheckCircle2 className="w-3 h-3 mr-1" />Обновлён</Badge>;
      case 'exists':
        return <Badge variant="outline">Существует</Badge>;
      case 'error':
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Ошибка</Badge>;
      default:
        return <Badge variant="outline">Ожидает</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Импорт контактов из amoCRM
          </DialogTitle>
          <DialogDescription>
            Загрузите XLSX экспорт из amoCRM для добавления/обновления контактов
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {!file ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => document.getElementById('amocrm-file-input')?.click()}
            >
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-2">Перетащите файл сюда</p>
              <p className="text-sm text-muted-foreground mb-4">или нажмите для выбора</p>
              <p className="text-xs text-muted-foreground">Поддерживаются файлы .xlsx, .xls</p>
              <input
                id="amocrm-file-input"
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          ) : isParsing ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Обработка файла...</p>
            </div>
          ) : (
            <>
              {/* File info and stats */}
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="h-8 w-8 text-primary" />
                  <div>
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {stats?.total} контактов • {stats?.matched} совпадений • {stats?.unmatched} новых
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={handleReset}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Options */}
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    id="update-existing"
                    checked={updateExisting}
                    onCheckedChange={setUpdateExisting}
                  />
                  <Label htmlFor="update-existing" className="text-sm">Обновлять существующие</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="auto-match"
                    checked={autoMatch}
                    onCheckedChange={setAutoMatch}
                  />
                  <Label htmlFor="auto-match" className="text-sm">Автосопоставление</Label>
                </div>
              </div>

              {/* Stats cards */}
              {stats && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 bg-muted/50 rounded-lg text-center">
                    <p className="text-2xl font-bold text-green-600">{stats.matched}</p>
                    <p className="text-sm text-muted-foreground">Совпадений</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg text-center">
                    <p className="text-2xl font-bold text-blue-600">{stats.unmatched}</p>
                    <p className="text-sm text-muted-foreground">Новых</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg text-center">
                    <p className="text-2xl font-bold">{stats.total}</p>
                    <p className="text-sm text-muted-foreground">Всего</p>
                  </div>
                </div>
              )}

              {/* Contacts table */}
              <ScrollArea className="flex-1 border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">ID</TableHead>
                      <TableHead>Имя</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Телефон</TableHead>
                      <TableHead>Совпадение</TableHead>
                      <TableHead>Статус</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contacts.slice(0, 100).map((contact, idx) => (
                      <TableRow key={idx} className={contact.import_status === 'error' ? 'bg-destructive/10' : ''}>
                        <TableCell className="font-mono text-xs">{contact.amo_id}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{contact.full_name}</span>
                            {contact.telegram_username && (
                              <span className="text-xs text-muted-foreground">@{contact.telegram_username}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{contact.email || '—'}</TableCell>
                        <TableCell className="text-sm font-mono">{contact.phone || '—'}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {getMatchBadge(contact.matched_by)}
                            {contact.matched_profile_name && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <ArrowRight className="h-3 w-3" />
                                {contact.matched_profile_name}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(contact.import_status)}
                          {contact.import_error && (
                            <p className="text-xs text-destructive mt-1">{contact.import_error}</p>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {contacts.length > 100 && (
                  <div className="p-3 text-center text-sm text-muted-foreground">
                    Показаны первые 100 из {contacts.length} контактов
                  </div>
                )}
              </ScrollArea>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
          {file && contacts.length > 0 && (
            <Button 
              onClick={() => importMutation.mutate()} 
              disabled={importMutation.isPending}
            >
              {importMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Импорт...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Импортировать {contacts.length} контактов
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
