import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { installPortalFetchInterceptor } from './common/auth/portalFetch'
import { initPortalThemeOnDocument } from './common/theme/portalTheme'
import './index.css'
import App from './App.tsx'
import ToastHost from './common/components/Toast/ToastHost'

initPortalThemeOnDocument()
installPortalFetchInterceptor()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <>
      <App />
      <ToastHost />
    </>
  </StrictMode>,
)
