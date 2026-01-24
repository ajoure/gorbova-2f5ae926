import { AdminLayout } from "@/components/layout/AdminLayout";
import { PreregistrationsTabContent } from "@/components/admin/payments/PreregistrationsTabContent";

export default function AdminPreregistrations() {
  return (
    <AdminLayout>
      <div className="px-3 md:px-4 pb-4">
        <PreregistrationsTabContent />
      </div>
    </AdminLayout>
  );
}
