import { Navigate, useLocation } from "react-router-dom";

/**
 * Legacy redirect: /admin/subscriptions-v2 → /admin/payments/auto-renewals
 * The "Автопродления" tab in PaymentsHub is the canonical view for subscriptions.
 * Query params (e.g. ?filter=active_no_card) are preserved.
 */
export default function AdminSubscriptionsV2() {
  const location = useLocation();
  return (
    <Navigate
      to={`/admin/payments/auto-renewals${location.search}`}
      replace
    />
  );
}
