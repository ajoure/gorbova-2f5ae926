import { ReactNode, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { saveLastRoute } from "@/hooks/useLastRoute";

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Сохраняем текущий маршрут при каждом изменении (если авторизован)
  useEffect(() => {
    if (user && !loading) {
      saveLastRoute(location.pathname, location.search);
    }
  }, [user, loading, location.pathname, location.search]);

  // Показываем loader пока AuthContext не завершит первичную проверку сессии
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted to-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    // Encode the full path including search params
    const redirectTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?redirectTo=${redirectTo}`} replace />;
  }

  return <>{children}</>;
}
