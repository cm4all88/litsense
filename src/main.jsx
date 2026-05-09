import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
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

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "pk_test_dHJ1ZS1kaW5nby04OC5jbGVyay5hY2NvdW50cy5kZXYk"

// React.lazy defers App.jsx evaluation until after React is ready to render it.
// Without this, React 18 + ClerkProvider flushes the initial render synchronously
// inside root.render(), before App.jsx's module-level const declarations have
// finished evaluating — causing "Cannot access 'X' before initialization" TDZ errors.
const App = lazy(() => import('./App.jsx'))

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={publishableKey}>
      <Suspense fallback={null}>
        <App />
      </Suspense>
    </ClerkProvider>
  </React.StrictMode>,
)
