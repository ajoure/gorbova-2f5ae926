import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { MessageCircle, Send, LifeBuoy, Inbox, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Import tab contents
import { SupportTabContent } from "@/components/admin/communication/SupportTabContent";
import { BroadcastsTabContent } from "@/components/admin/communication/BroadcastsTabContent";
import { InboxTabContent } from "@/components/admin/communication/InboxTabContent";
import { CommunicationSettingsTabContent } from "@/components/admin/communication/CommunicationSettingsTabContent";

// Import unread hooks
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import { useUnreadEmailCount } from "@/hooks/useEmailInbox";
import { useUnreadTicketsCount } from "@/hooks/useUnreadTicketsCount";

const tabs = [
  { id: "inbox", label: "Сообщения", icon: Inbox },
  { id: "support", label: "Техподдержка", icon: LifeBuoy },
  { id: "broadcasts", label: "Рассылки", icon: Send },
  { id: "settings", label: "Настройки", icon: Settings },
];

export default function AdminCommunication() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<string>(searchParams.get("tab") || "inbox");

  // Unread counts for badges
  const telegramUnread = useUnreadMessagesCount();
  const { data: emailUnread = 0 } = useUnreadEmailCount();
  const ticketsUnread = useUnreadTicketsCount();

  const inboxUnread = telegramUnread + emailUnread;

  // Sync tab with URL
  useEffect(() => {
    const tabFromUrl = searchParams.get("tab");
    if (tabFromUrl && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [searchParams]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const getUnreadCount = (tabId: string) => {
    switch (tabId) {
      case "inbox": return inboxUnread;
      case "support": return ticketsUnread;
      default: return 0;
    }
  };

  return (
    <AdminLayout>
      <div className="h-full min-h-0 flex flex-col overflow-hidden">
        {/* Glass Pill Tabs - directly after topbar */}
        <div className="px-4 md:px-6 pt-2 pb-2 shrink-0">
          {/* Glass Pill Tabs */}
          <div className="inline-flex p-1.5 rounded-full bg-background/60 backdrop-blur-xl border border-border/50 shadow-lg">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const unread = getUnreadCount(tab.id);
              const isActive = activeTab === tab.id;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={cn(
                    "relative flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all duration-300",
                    isActive 
                      ? "bg-card text-foreground shadow-md" 
                      : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  {unread > 0 && (
                    <Badge 
                      className={cn(
                        "h-5 min-w-5 px-1.5 text-xs font-semibold rounded-full",
                        tab.id === "support" 
                          ? "bg-orange-500 text-white" 
                          : "bg-primary text-primary-foreground"
                      )}
                    >
                      {unread > 99 ? "99+" : unread}
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {activeTab === "inbox" && <InboxTabContent />}
          {activeTab === "support" && <SupportTabContent />}
          {activeTab === "broadcasts" && <BroadcastsTabContent />}
          {activeTab === "settings" && <CommunicationSettingsTabContent />}
        </div>
      </div>
    </AdminLayout>
  );
}