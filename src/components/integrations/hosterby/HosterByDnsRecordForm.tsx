import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface HosterByDnsRecordFormProps {
  instanceId: string;
  orderId: string;
  onAdded: () => void;
}

export function HosterByDnsRecordForm({ instanceId, orderId, onAdded }: HosterByDnsRecordFormProps) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [ttl, setTtl] = useState("3600");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !content) {
      toast.error("Имя и IP-адрес обязательны");
      return;
    }
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(content)) {
      toast.error("Введите валидный IPv4 адрес");
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("hosterby-api", {
        body: {
          action: "add_dns_a_record",
          instance_id: instanceId,
          payload: { order_id: orderId, name, content, ttl: parseInt(ttl) || 3600 },
        },
      });
      if (error || !data?.success) {
        toast.error("Ошибка добавления записи: " + (data?.error || error?.message));
      } else {
        toast.success(`A-запись ${name} → ${content} добавлена`);
        setName("");
        setContent("");
        onAdded();
      }
    } catch {
      toast.error("Ошибка добавления записи");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border rounded-lg p-3 space-y-3">
      <p className="text-sm font-medium">Добавить A-запись</p>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-xs">Имя</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="sub.domain.by" className="h-8 text-xs" />
        </div>
        <div>
          <Label className="text-xs">IP-адрес</Label>
          <Input value={content} onChange={(e) => setContent(e.target.value)} placeholder="1.2.3.4" className="h-8 text-xs" />
        </div>
        <div>
          <Label className="text-xs">TTL</Label>
          <Input value={ttl} onChange={(e) => setTtl(e.target.value)} placeholder="3600" className="h-8 text-xs" />
        </div>
      </div>
      <Button type="submit" size="sm" disabled={saving}>
        <Plus className="h-3.5 w-3.5 mr-1" />
        {saving ? "Сохранение..." : "Добавить"}
      </Button>
    </form>
  );
}
