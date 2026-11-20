import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useApp } from "../state/AppState";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: string[];
}

/**
 * Route protection guard.
 * 1. If user is unauthenticated, redirects to /login (preserving intended location).
 * 2. If allowedRoles specified and user's role is not included:
 *    - Participants attempting to access /admin routes are redirected to /portal.
 *    - Admins/Auditors attempting to access participant routes are allowed or directed appropriately.
 */
export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { activeUser, isAuthenticated } = useApp();
  const location = useLocation();

  if (!isAuthenticated || !activeUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(activeUser.role)) {
    // If auditor attempts to access participant-only routes, redirect to /admin
    if (activeUser.role === "AUDITOR") {
      return <Navigate to="/admin" replace />;
    }
    // Non-admin attempting to access Admin Tower routes
    if (activeUser.role !== "ADMIN") {
      return <Navigate to="/portal" replace />;
    }
  }

  return <>{children}</>;
}
