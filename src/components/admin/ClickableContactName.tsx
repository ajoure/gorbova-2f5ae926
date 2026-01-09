import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface ClickableContactNameProps {
  userId?: string | null;
  profileId?: string | null;
  name: string | null;
  email?: string | null;
  className?: string;
  fromPage?: string;
  showEmail?: boolean;
}

/**
 * Clickable contact name that navigates to the contact card in AdminContacts.
 * Uses user_id or profile_id (via search by email) for navigation.
 */
export function ClickableContactName({
  userId,
  profileId,
  name,
  email,
  className,
  fromPage = "admin",
  showEmail = false,
}: ClickableContactNameProps) {
  const navigate = useNavigate();
  
  const displayName = name || "—";
  const hasLink = !!userId || !!profileId;
  
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (userId) {
      navigate(`/admin/contacts?contact=${userId}&from=${fromPage}`);
    } else if (profileId) {
      navigate(`/admin/contacts?contact=${profileId}&from=${fromPage}`);
    }
  };
  
  if (!hasLink) {
    return (
      <div className={className}>
        <div className="font-medium">{displayName}</div>
        {showEmail && email && (
          <div className="text-sm text-muted-foreground">{email}</div>
        )}
      </div>
    );
  }
  
  return (
    <div className={className}>
      <button
        onClick={handleClick}
        className={cn(
          "font-medium text-left hover:text-primary hover:underline transition-colors cursor-pointer",
          "focus:outline-none focus:text-primary"
        )}
      >
        {displayName}
      </button>
      {showEmail && email && (
        <div className="text-sm text-muted-foreground">{email}</div>
      )}
    </div>
  );
}
