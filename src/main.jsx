import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'

// ── Sentry error monitoring ───────────────────────────────────────────────────
// Add VITE_SENTRY_DSN to Vercel env vars (get from sentry.io → project → DSN)
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    integrations: [Sentry.browserTracingIntegration()],
  });
}

// React.lazy defers App.jsx evaluation until after React is ready to render it.
// Without this, React 18 flushes the initial render synchronously inside
// root.render(), before App.jsx's module-level const declarations have finished
// evaluating — causing "Cannot access 'X' before initialization" TDZ errors.
const App            = lazy(() => import('./App.jsx'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard.jsx'))

// If the URL is /admin (or /admin/anything), show the admin dashboard.
// Otherwise show the normal app. No router library needed.
const isAdmin = window.location.pathname.startsWith('/admin')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Suspense fallback={null}>
      {isAdmin ? <AdminDashboard /> : <App />}
    </Suspense>
  </React.StrictMode>,
)
