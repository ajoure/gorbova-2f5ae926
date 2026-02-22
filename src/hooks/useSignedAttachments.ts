import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TicketAttachment } from "@/hooks/useTickets";

export interface SignedAttachmentInfo {
  url: string;
  fileName: string;
  mime: string;
}

/**
 * Hook to cache signed URLs for ticket attachments.
 * Cache is keyed by `bucket:path` and only grows (never cleared on refetch).
 * Signed URLs are valid for 1 hour.
 */
export function useSignedAttachments(
  attachments: (string | TicketAttachment)[] | null | undefined
) {
  const cacheRef = useRef<Map<string, SignedAttachmentInfo>>(new Map());
  const [result, setResult] = useState<Map<string, SignedAttachmentInfo>>(new Map());

  useEffect(() => {
    if (!attachments || attachments.length === 0) return;

    const objectAttachments = attachments.filter(
      (a): a is TicketAttachment => typeof a !== "string" && !!a?.bucket && !!a?.path
    );

    if (objectAttachments.length === 0) return;

    // Find attachments not yet in cache
    const missing = objectAttachments.filter(
      (a) => !cacheRef.current.has(`${a.bucket}:${a.path}`)
    );

    if (missing.length === 0) {
      // All cached, just ensure state is up to date
      setResult(new Map(cacheRef.current));
      return;
    }

    let cancelled = false;

    async function fetchUrls() {
      const promises = missing.map(async (att) => {
        const key = `${att.bucket}:${att.path}`;
        try {
          const { data, error } = await supabase.storage
            .from(att.bucket)
            .createSignedUrl(att.path, 3600);

          if (!error && data?.signedUrl) {
            return { key, info: { url: data.signedUrl, fileName: att.file_name, mime: att.mime } };
          }
        } catch {
          // silently skip failed URLs
        }
        return null;
      });

      const results = await Promise.all(promises);

      if (cancelled) return;

      let updated = false;
      for (const r of results) {
        if (r) {
          cacheRef.current.set(r.key, r.info);
          updated = true;
        }
      }

      if (updated) {
        setResult(new Map(cacheRef.current));
      }
    }

    fetchUrls();

    return () => {
      cancelled = true;
    };
  }, [attachments]);

  return { signedUrls: result, getKey: (att: TicketAttachment) => `${att.bucket}:${att.path}` };
}
