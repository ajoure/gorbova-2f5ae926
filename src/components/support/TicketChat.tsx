import { useState, useEffect, useRef, useMemo } from "react";
import { Send, Loader2, Plus, Image as ImageIcon, Video, Music, Circle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { TicketMessage } from "./TicketMessage";
import { useTicketMessages, useSendMessage, useMarkTicketRead } from "@/hooks/useTickets";
import type { TicketAttachment } from "@/hooks/useTickets";
import { useTicketReactions, useToggleReaction } from "@/hooks/useTicketReactions";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { OutboundMediaPreview } from "@/components/admin/chat/OutboundMediaPreview";
import { VideoNoteRecorder } from "@/components/admin/VideoNoteRecorder";

type MediaFileType = "photo" | "video" | "audio" | "video_note" | "document";

interface TicketChatProps {
  ticketId: string;
  isAdmin?: boolean;
  isClosed?: boolean;
  telegramUserId?: number | null;
  telegramBridgeEnabled?: boolean;
  onBridgeMessage?: (ticketMessageId: string) => void;
}

// match storage bucket limit for ticket-attachments
const MAX_TICKET_ATTACHMENT_BYTES = 50 * 1024 * 1024;

export function TicketChat({ ticketId, isAdmin, isClosed, telegramUserId, telegramBridgeEnabled, onBridgeMessage }: TicketChatProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [sendToTelegram, setSendToTelegram] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [selectedFileType, setSelectedFileType] = useState<MediaFileType | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showVideoNoteRecorder, setShowVideoNoteRecorder] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: messages, isLoading } = useTicketMessages(ticketId, isAdmin);

  // Defense-in-depth: redundant render-level filter for non-admin views
  const visibleMessages = isAdmin ? messages : messages?.filter(m => !m.is_internal);
  
  // Reactions
  const messageIds = useMemo(
    () => visibleMessages?.map((m) => m.id) || [],
    [visibleMessages]
  );
  const { data: reactionsMap } = useTicketReactions(ticketId, messageIds);
  const toggleReaction = useToggleReaction(ticketId);

  const sendMessageMutation = useSendMessage();
  const markRead = useMarkTicketRead();

  // Mark ticket as read when opened
  useEffect(() => {
    if (ticketId) {
      markRead.mutate({ ticketId, isAdmin: !!isAdmin });
    }
  }, [ticketId, isAdmin]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current;
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [messages]);

  // Show TG checkbox only for admin when user has telegram and bridge is on
  const canBridgeToTelegram = isAdmin && telegramBridgeEnabled && telegramUserId;

  // Auto-enable sendToTelegram when bridge is available
  useEffect(() => {
    if (canBridgeToTelegram) {
      setSendToTelegram(true);
    }
  }, [canBridgeToTelegram]);

  const handleMediaMenuSelect = (type: MediaFileType) => {
    if (type === "video_note") {
      setShowVideoNoteRecorder(true);
      return;
    }

    // Set accept dynamically based on type
    if (fileInputRef.current) {
      switch (type) {
        case "photo":
          fileInputRef.current.accept = "image/*";
          break;
        case "video":
          fileInputRef.current.accept = "video/*";
          break;
        case "audio":
          fileInputRef.current.accept = "audio/*";
          break;
        case "document":
          fileInputRef.current.accept = "*/*";
          break;
      }
      setSelectedFileType(type);
      fileInputRef.current.click();
    }
  };

  const detectFileType = (file: File): MediaFileType => {
    if (file.type.startsWith("image/")) return "photo";
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("audio/")) return "audio";
    return "document";
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_TICKET_ATTACHMENT_BYTES) {
      toast({
        title: "Файл слишком большой",
        description: `Максимальный размер: ${MAX_TICKET_ATTACHMENT_BYTES / 1024 / 1024} МБ`,
        variant: "destructive",
      });
      return;
    }
    setAttachedFile(file);
    // Auto-detect type if not explicitly set (fallback)
    if (!selectedFileType) {
      setSelectedFileType(detectFileType(file));
    }
    // Reset input so same file can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.accept = "*/*"; // Reset accept
    }
  };

  const handleVideoNoteRecorded = (file: File) => {
    setAttachedFile(file);
    setSelectedFileType("video_note");
    setShowVideoNoteRecorder(false);
  };

  const handleRemoveFile = () => {
    setAttachedFile(null);
    setSelectedFileType(null);
  };

  const handleSend = async () => {
    if (!message.trim() && !attachedFile) return;

    let attachments: TicketAttachment[] = [];

    // Upload file if attached
    if (attachedFile) {
      setIsUploading(true);
      try {
        const sanitizedName = attachedFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${ticketId}/${crypto.randomUUID()}-${sanitizedName}`;
        const { error: uploadError } = await supabase.storage
          .from("ticket-attachments")
          .upload(path, attachedFile);

        if (uploadError) throw uploadError;

        attachments = [{
          bucket: "ticket-attachments",
          path,
          file_name: attachedFile.name,
          size: attachedFile.size,
          mime: attachedFile.type || "application/octet-stream",
          kind: selectedFileType || detectFileType(attachedFile),
        }];
      } catch (err: any) {
        toast({
          title: "Ошибка загрузки файла",
          description: err?.message || "Не удалось загрузить файл",
          variant: "destructive",
        });
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
    }

    const result = await sendMessageMutation.mutateAsync({
      ticket_id: ticketId,
      message: message.trim(),
      author_type: isAdmin ? "support" : "user",
      is_internal: isAdmin ? isInternal : false,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    // Bridge to Telegram if checkbox checked & not internal
    if (canBridgeToTelegram && sendToTelegram && !isInternal && result?.id && onBridgeMessage) {
      onBridgeMessage(result.id);
    }

    setMessage("");
    setAttachedFile(null);
    setSelectedFileType(null);
    setIsInternal(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea ref={scrollRef} className="flex-1 p-4">
        {visibleMessages?.map((msg) => (
          <TicketMessage
            key={msg.id}
            message={msg}
            isCurrentUser={msg.author_id === user?.id && !isAdmin}
            reactions={reactionsMap?.[msg.id]}
            onToggleReaction={(emoji) =>
              toggleReaction.mutate({ messageId: msg.id, emoji })
            }
          />
        ))}
        {visibleMessages?.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-8">
            Пока нет сообщений
          </p>
        )}
      </ScrollArea>

      {!isClosed && (
        <div className="border-t p-4">
          {isAdmin && (
            <div className="flex items-center gap-4 mb-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="internal"
                  checked={isInternal}
                  onCheckedChange={(checked) => {
                    setIsInternal(checked as boolean);
                    if (checked) setSendToTelegram(false);
                  }}
                />
                <Label htmlFor="internal" className="text-sm text-muted-foreground">
                  Внутренняя заметка
                </Label>
              </div>
              {canBridgeToTelegram && !isInternal && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="send-telegram"
                    checked={sendToTelegram}
                    onCheckedChange={(checked) => setSendToTelegram(checked as boolean)}
                  />
                  <Label htmlFor="send-telegram" className="text-sm text-muted-foreground">
                    Отправить в Telegram
                  </Label>
                </div>
              )}
            </div>
          )}

          {/* Attached file preview via OutboundMediaPreview */}
          {attachedFile && (
            <OutboundMediaPreview
              file={attachedFile}
              fileType={selectedFileType}
              isUploading={isUploading}
              onRemove={handleRemoveFile}
            />
          )}

          <div className="flex gap-2 items-end">
            {/* Media menu (like contact center) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 flex-shrink-0"
                  type="button"
                  disabled={!!attachedFile || isUploading}
                >
                  <Plus className="h-5 w-5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top">
                <DropdownMenuItem onClick={() => handleMediaMenuSelect("photo")}>
                  <ImageIcon className="h-4 w-4 mr-2" />
                  Фото
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleMediaMenuSelect("video")}>
                  <Video className="h-4 w-4 mr-2" />
                  Видео
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleMediaMenuSelect("video_note")}>
                  <Circle className="h-4 w-4 mr-2" />
                  Записать кружок
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleMediaMenuSelect("audio")}>
                  <Music className="h-4 w-4 mr-2" />
                  Аудио
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleMediaMenuSelect("document")}>
                  <FileText className="h-4 w-4 mr-2" />
                  Документ
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="*/*"
              onChange={handleFileSelect}
            />

            <div className="flex-1">
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isInternal ? "Внутренняя заметка..." : "Введите сообщение..."}
                className="min-h-[80px] resize-none"
              />
            </div>

            <Button
              onClick={handleSend}
              disabled={(!message.trim() && !attachedFile) || sendMessageMutation.isPending || isUploading}
              size="icon"
              className="h-[80px] w-12 flex-shrink-0"
            >
              {(sendMessageMutation.isPending || isUploading) ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      )}

      {isClosed && (
        <div className="border-t p-4 bg-muted">
          <p className="text-center text-sm text-muted-foreground">
            Обращение закрыто. Создайте новое обращение, если у вас есть вопросы.
          </p>
        </div>
      )}

      {/* Video Note Recorder */}
      <VideoNoteRecorder
        open={showVideoNoteRecorder}
        onOpenChange={setShowVideoNoteRecorder}
        onRecorded={handleVideoNoteRecorded}
      />
    </div>
  );
}
