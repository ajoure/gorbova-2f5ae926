
-- F12.1 Source A: backfill orders_v2.provider_payment_id from payments_v2 (fill-only)
WITH filled_a AS (
  UPDATE orders_v2 o
  SET provider_payment_id = sub.ppid,
      updated_at = now()
  FROM (
    SELECT DISTINCT ON (p.order_id) p.order_id, p.provider_payment_id as ppid
    FROM payments_v2 p
    JOIN orders_v2 o2 ON o2.id = p.order_id
    WHERE p.status = 'succeeded'
      AND p.provider_payment_id IS NOT NULL
      AND o2.status = 'paid'
      AND o2.provider_payment_id IS NULL
    ORDER BY p.order_id, p.paid_at DESC NULLS LAST
  ) sub
  WHERE o.id = sub.order_id
    AND o.provider_payment_id IS NULL
  RETURNING o.id, sub.ppid
)
INSERT INTO audit_logs (actor_type, actor_user_id, actor_label, action, meta)
SELECT 'system', NULL, 'F12.1_backfill',
       'order.fill_provider_payment_id_backfill',
       jsonb_build_object('order_id', id, 'provider_payment_id', ppid, 'source', 'payments_v2_join')
FROM filled_a;

-- F12.1 Source B: safe fill from meta.bepaid_uid for order 124fb467 (no conflict)
WITH filled_b AS (
  UPDATE orders_v2
  SET provider_payment_id = meta->>'bepaid_uid',
      updated_at = now()
  WHERE id = '124fb467-fe6e-4892-95a9-b7347d36b1dc'
    AND provider_payment_id IS NULL
    AND meta->>'bepaid_uid' IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM orders_v2 o2
      WHERE o2.provider_payment_id = (SELECT meta->>'bepaid_uid' FROM orders_v2 WHERE id = '124fb467-fe6e-4892-95a9-b7347d36b1dc')
        AND o2.id != '124fb467-fe6e-4892-95a9-b7347d36b1dc'
    )
  RETURNING id, provider_payment_id
)
INSERT INTO audit_logs (actor_type, actor_user_id, actor_label, action, meta)
SELECT 'system', NULL, 'F12.1_backfill',
       'order.fill_provider_payment_id_backfill',
       jsonb_build_object('order_id', id, 'provider_payment_id', provider_payment_id, 'source', 'meta_bepaid_uid')
FROM filled_b;

-- F12.1 Conflict log: ORD-26-MKDNM34Z (c0af8ad4) skipped due to ppid conflict
INSERT INTO audit_logs (actor_type, actor_user_id, actor_label, action, meta)
VALUES (
  'system', NULL, 'F12.1_backfill',
  'order.ppid_backfill_conflict',
  jsonb_build_object(
    'order_id', 'c0af8ad4-f308-42e2-9dab-3fbaa0dd3b8e',
    'order_number', 'ORD-26-MKDNM34Z',
    'bepaid_uid_from_meta', '6303b5a2-36b9-4c12-9bd3-8e1e0a21ae07',
    'conflict_reason', 'ppid already linked to another order (1ea274b1)',
    'action_taken', 'SKIP - queued for F13.ADD manual review'
  )
);
