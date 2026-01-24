import { AdminLayout } from "@/components/layout/AdminLayout";
import { DiagnosticsTabContent } from "@/components/admin/payments/DiagnosticsTabContent";

export default function AdminPaymentDiagnostics() {
  return (
    <AdminLayout>
      <div className="px-3 md:px-4 pb-4">
        <DiagnosticsTabContent />
      </div>
    </AdminLayout>
  );
}
