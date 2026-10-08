import { Navigate } from "react-router-dom"

export default function Opportunities() {
  return <Navigate to="/dashboard?dealsTab=coming_soon" replace />
}
