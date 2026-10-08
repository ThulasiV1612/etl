import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { CashFlowMappingPage } from './pages/CashFlowMappingPage'
import { ClassesMappingPage } from './pages/ClassesMappingPage'
import { DistributionsMappingPage } from './pages/DistributionsMappingPage'
import { DashboardPage } from './pages/DashboardPage'
import { EtlPageInfoPage } from './pages/EtlPageInfoPage'
import { EtlUploadPage } from './pages/EtlUploadPage'
import { JobDetailsPage } from './pages/JobDetailsPage'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="etl-upload" element={<EtlUploadPage />} />
        <Route path="etl/cash-flow" element={<CashFlowMappingPage />} />
        <Route path="etl/classes" element={<ClassesMappingPage />} />
        <Route path="etl/distributions" element={<DistributionsMappingPage />} />
        <Route path="etl/page-info" element={<EtlPageInfoPage />} />
        <Route path="jobs/:jobId" element={<JobDetailsPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}
