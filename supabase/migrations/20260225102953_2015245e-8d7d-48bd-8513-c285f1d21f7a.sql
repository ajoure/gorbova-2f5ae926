-- Backfill card_profile_links.provider_token (stamp) from payment_reconcile_queue
-- Safe: only updates existing links where provider_token IS NULL
-- Conflict-safe: skips if stamp already belongs to a different profile

CREATE OR REPLACE FUNCTION public.backfill_card_stamps_from_queue()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int := 0;
  v_skipped int := 0;
  v_conflicts int := 0;
  rec record;
BEGIN
  FOR rec IN
    SELECT DISTINCT ON (stamp)
      q.raw_payload->'transaction'->'credit_card'->>'stamp' AS stamp,
      q.raw_payload->'transaction'->'credit_card'->>'last_4' AS last4,
      lower(q.raw_payload->'transaction'->'credit_card'->>'brand') AS brand,
      q.matched_profile_id AS profile_id
    FROM payment_reconcile_queue q
    WHERE q.raw_payload->'transaction'->'credit_card'->>'stamp' IS NOT NULL
      AND q.matched_profile_id IS NOT NULL
      AND length(q.raw_payload->'transaction'->'credit_card'->>'stamp') > 10
    ORDER BY stamp, q.created_at DESC
  LOOP
    -- Check if this stamp is already linked to a DIFFERENT profile
    IF EXISTS (
      SELECT 1 FROM card_profile_links
      WHERE provider = 'bepaid'
        AND provider_token = rec.stamp
        AND profile_id != rec.profile_id
    ) THEN
      v_conflicts := v_conflicts + 1;
      -- Log conflict in audit_logs
      INSERT INTO audit_logs (actor_type, actor_label, action, meta)
      VALUES ('system', 'backfill_stamps', 'stamp_conflict', jsonb_build_object(
        'stamp_prefix', left(rec.stamp, 8),
        'last4', rec.last4,
        'conflicting_profile_id', rec.profile_id
      ));
      CONTINUE;
    END IF;

    -- Update existing card_profile_links where provider_token IS NULL
    UPDATE card_profile_links
    SET provider_token = rec.stamp, updated_at = now()
    WHERE provider = 'bepaid'
      AND card_last4 = rec.last4
      AND card_brand = rec.brand
      AND profile_id = rec.profile_id
      AND provider_token IS NULL;

    IF FOUND THEN
      v_updated := v_updated + 1;
    ELSE
      -- Try upsert (create link if stamp not yet present)
      INSERT INTO card_profile_links (provider, provider_token, card_last4, card_brand, profile_id, source, linked_at)
      VALUES ('bepaid', rec.stamp, rec.last4, rec.brand, rec.profile_id, 'backfill_stamp', now())
      ON CONFLICT (provider, provider_token) WHERE provider_token IS NOT NULL
      DO NOTHING;

      IF FOUND THEN
        v_updated := v_updated + 1;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
    END IF;
  END LOOP;

  -- Audit summary
  INSERT INTO audit_logs (actor_type, actor_label, action, meta)
  VALUES ('system', 'backfill_stamps', 'backfill_completed', jsonb_build_object(
    'updated', v_updated,
    'skipped', v_skipped,
    'conflicts', v_conflicts
  ));

  RETURN jsonb_build_object('updated', v_updated, 'skipped', v_skipped, 'conflicts', v_conflicts);
END;
$$;