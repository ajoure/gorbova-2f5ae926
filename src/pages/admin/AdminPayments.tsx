import { AdminLayout } from "@/components/layout/AdminLayout";
import { PaymentsTabContent } from "@/components/admin/payments/PaymentsTabContent";

// Re-export PaymentFilters type for backwards compatibility
export type { PaymentFilters } from "@/components/admin/payments/PaymentsTabContent";

export default function AdminPayments() {
  return (
    <AdminLayout>
      <div className="px-3 md:px-4 pb-4">
        <PaymentsTabContent />
      </div>
    </AdminLayout>
  );
}
