import { Navigate, Outlet } from "react-router-dom";
import { SESSION_BEARER_KEY } from "../../../common/auth/sessionKeys";
import { canAccessMembersPage } from "../../../common/auth/roleUtils";

export default function MembersLayout() {
  const token = sessionStorage.getItem(SESSION_BEARER_KEY);
  if (!token) return <Navigate to="/signin" replace />;
  if (!canAccessMembersPage()) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
