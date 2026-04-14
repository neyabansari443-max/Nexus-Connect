import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import App from './App'

const PUBLISHABLE_KEY = (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '').trim()

if (!PUBLISHABLE_KEY) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY. Please set it in .env before build.')
}

const container = document.getElementById('root')
const root = createRoot(container!)

root.render(
  <StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <App />
    </ClerkProvider>
  </StrictMode>
)