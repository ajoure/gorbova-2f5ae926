import { AdminLayout } from "@/components/layout/AdminLayout";
import { InstallmentsTabContent } from "@/components/admin/payments/InstallmentsTabContent";

export default function AdminInstallments() {
  return (
    <AdminLayout>
      <div className="px-3 md:px-4 pb-4">
        <InstallmentsTabContent />
      </div>
    </AdminLayout>
  );
}
