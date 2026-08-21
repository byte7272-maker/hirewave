import { Navigate } from "react-router-dom";
import { useAuth } from "./auth";

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-50">
        <i className="ri-loader-4-line text-2xl text-primary-500 animate-spin"></i>
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}
