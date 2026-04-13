import { useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { ClerkFailed, ClerkLoaded, ClerkLoading, SignedIn, SignedOut, UserButton, useSignIn } from '@clerk/clerk-react';
import { Crown, LayoutDashboard, Loader2, Megaphone, Settings, Activity, ShieldCheck } from 'lucide-react';
import { FaGithub } from 'react-icons/fa';
import { FcGoogle } from 'react-icons/fc';
import DashboardScreen from './screens/DashboardScreen';
import CampaignWizardScreen from './screens/CampaignWizardScreen';
import LiveTerminal from './components/LiveTerminal';
import { PlanProvider, usePlan } from './features/subscription/plan';
import SettingsScreen from './screens/SettingsScreen';
import TrackingScreen from './screens/TrackingScreen';
import { useCampaignStore } from './store/useCampaignStore';
import { useEffect } from 'react';
import nexusLogo from '../assets/logo-removebg-preview.png';

function MicrosoftLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="2" y="2" width="9" height="9" fill="#F25022" />
      <rect x="13" y="2" width="9" height="9" fill="#7FBA00" />
      <rect x="2" y="13" width="9" height="9" fill="#00A4EF" />
      <rect x="13" y="13" width="9" height="9" fill="#FFB900" />
    </svg>
  )
}

export default function App() {
  return (
    <Router>
      <ClerkLoading>
        <div className="h-screen w-screen bg-[#0a0a0b] text-zinc-300 flex items-center justify-center">
          <div className="text-sm tracking-wide">Loading Nexus Connect authentication...</div>
        </div>
      </ClerkLoading>

      <ClerkFailed>
        <div className="h-screen w-screen bg-gradient-to-br from-black via-zinc-950 to-zinc-900 text-zinc-100 flex items-center justify-center p-8">
          <div className="max-w-xl w-full rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6 shadow-2xl space-y-3">
            <h2 className="text-2xl font-semibold">Authentication failed to initialize</h2>
            <p className="text-zinc-400 text-sm leading-6">
              Clerk resources were blocked or the publishable key is invalid. Check your internet connection,
              Clerk dashboard domain settings, and CSP policy in renderer index.
            </p>
          </div>
        </div>
      </ClerkFailed>

      <ClerkLoaded>
        <SignedIn>
          <PlanProvider>
            <WorkspaceShell />
          </PlanProvider>
        </SignedIn>

        <SignedOut>
          <SignedOutView />
        </SignedOut>
      </ClerkLoaded>
    </Router>
  );
}

function SignedOutView() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const [activeProvider, setActiveProvider] = useState<'google' | 'microsoft' | 'github' | null>(null);
  const [authStatus, setAuthStatus] = useState<string>('');

  type ProviderConfig = {
    id: 'google' | 'microsoft' | 'github';
    label: string;
    strategy: 'oauth_google' | 'oauth_microsoft' | 'oauth_github';
    Icon: ComponentType<{ className?: string }>;
    oidcPrompt?: 'select_account';
  };

  const providers: ProviderConfig[] = [
    {
      id: 'google',
      label: 'Continue with Google',
      strategy: 'oauth_google',
      Icon: ({ className }) => <FcGoogle className={className} />,
      oidcPrompt: 'select_account'
    },
    {
      id: 'microsoft',
      label: 'Continue with Microsoft',
      strategy: 'oauth_microsoft',
      Icon: MicrosoftLogo,
      oidcPrompt: 'select_account'
    },
    {
      id: 'github',
      label: 'Continue with GitHub',
      strategy: 'oauth_github',
      Icon: ({ className }) => <FaGithub className={`${className ?? ''} text-zinc-200`.trim()} />
    }
  ];

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const continueProviderInBrowser = async (provider: ProviderConfig) => {
    if (!isLoaded || !signIn || !setActive || activeProvider) {
      return;
    }

    setActiveProvider(provider.id);
    setAuthStatus(`Opening ${provider.label.replace('Continue with ', '')} in Chrome...`);

    try {
      if (typeof window.api?.openAuthUrl !== 'function') {
        throw new Error('Desktop bridge unavailable for external browser auth.');
      }

      const callbackUrl = `${window.location.origin}/oauth-callback`;

      const signInAttempt = await signIn.create({
        strategy: provider.strategy,
        redirectUrl: callbackUrl,
        actionCompleteRedirectUrl: callbackUrl,
        ...(provider.oidcPrompt ? { oidcPrompt: provider.oidcPrompt } : {})
      });

      const externalUrl = signInAttempt.firstFactorVerification.externalVerificationRedirectURL?.toString();

      if (!externalUrl) {
        throw new Error('Could not generate Google auth URL from Clerk.');
      }

      await window.api.openAuthUrl(externalUrl);
      setAuthStatus('Chrome opened. Complete login there, app will auto-detect.');

      let latestAttempt = signInAttempt;

      for (let i = 0; i < 90; i += 1) {
        await wait(2000);
        latestAttempt = await latestAttempt.reload();

        if (latestAttempt.status === 'complete' && latestAttempt.createdSessionId) {
          await setActive({ session: latestAttempt.createdSessionId });

          if (typeof window.api?.focusMainWindow === 'function') {
            await window.api.focusMainWindow();
          }

          setAuthStatus('Login successful. Redirecting...');
          return;
        }
      }

      setAuthStatus('Login not detected yet. Complete login in browser and try again.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Browser login failed.';
      setAuthStatus(message);
    } finally {
      setActiveProvider(null);
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-gradient-to-br from-black to-[#1a1a2e]">
      <div className="text-center space-y-5 shadow-2xl bg-zinc-900 border border-zinc-700/50 p-8 rounded-2xl w-full max-w-md">
        <h2 className="text-2xl font-bold tracking-tight">Access Nexus Connect</h2>
        <div className="space-y-3">
          {providers.map((provider) => (
            <button
              key={provider.id}
              onClick={() => void continueProviderInBrowser(provider)}
              disabled={!!activeProvider}
              className="w-full inline-flex items-center justify-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-100 px-4 py-3 font-semibold hover:border-zinc-500 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {activeProvider === provider.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <provider.Icon className="h-4 w-4" />
              )}
              {activeProvider === provider.id ? 'Waiting for browser login...' : provider.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          All three options authenticate through the same Clerk project.
          You can choose any Google, Microsoft, or GitHub account from Chrome.
        </p>

        <div className="mx-auto w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 flex items-center justify-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-300" />
          <p className="text-sm text-muted-foreground text-zinc-400 leading-snug">
            Local-First Architecture. Your leads and campaigns never leave this device.
          </p>
        </div>

        {authStatus ? <p className="text-xs text-zinc-300 leading-relaxed">{authStatus}</p> : null}
      </div>
    </div>
  );
}

function WorkspaceShell() {
  const setEngineRunning = useCampaignStore((state) => state.setEngineRunning);

  useEffect(() => {
    if (window.api && window.api.onEngineStatus) {
      const unsub = window.api.onEngineStatus((_, status) => {
        setEngineRunning(status);
      });
      return unsub;
    }
  }, [setEngineRunning]);

  return (
    <div className="flex h-screen w-screen bg-[#0a0a0b] text-white font-sans overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 pl-64">
        <main className="flex-1 p-8 pb-8 overflow-y-auto">
          <Routes>
            <Route
              path="/"
              element={
                <ProFeatureGate feature="dashboard">
                  <DashboardScreen />
                </ProFeatureGate>
              }
            />
            <Route
              path="/campaigns"
              element={
                <ProFeatureGate feature="campaigns">
                  <CampaignWizardScreen />
                </ProFeatureGate>
              }
            />
            <Route path="/tracking" element={<TrackingScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
          </Routes>
        </main>
        <LiveTerminal />
      </div>
    </div>
  );
}

function ProFeatureGate({ feature, children }: { feature: 'dashboard' | 'campaigns'; children: ReactNode }) {
  const { isLoading, canAccess } = usePlan();

  if (isLoading) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-[#121214] p-8 text-zinc-300">
        Checking your subscription plan...
      </div>
    );
  }

  if (!canAccess(feature)) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-8 space-y-4 max-w-2xl">
        <h2 className="text-2xl font-semibold text-amber-100">Pro plan required</h2>
        <p className="text-sm text-amber-200/90 leading-6">
          This section is currently available only for Pro users. Open Settings to upgrade and unlock the full app.
        </p>
        <Link
          to="/settings"
          className="inline-flex items-center rounded-lg bg-white text-black px-4 py-2.5 text-sm font-semibold hover:bg-zinc-200 transition"
        >
          Get Pro
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}

function Sidebar() {
  const location = useLocation();
  const { isLoading, isPro } = usePlan();
  const navItems = [
    { name: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/' },
    { name: 'Campaigns', icon: <Megaphone size={20} />, path: '/campaigns' },
    { name: 'Tracking', icon: <Activity size={20} />, path: '/tracking' },
    { name: 'Settings', icon: <Settings size={20} />, path: '/settings' },
  ];

  const isEngineRunning = useCampaignStore((state) => state.isEngineRunning);

  return (
    <aside className="w-64 fixed inset-y-0 left-0 bg-[#121214] border-r border-[#27272a] p-4 flex flex-col justify-between z-10">
      <div>
        <div className="flex items-center space-x-2 text-xl font-bold tracking-tighter mb-8 px-2 mt-4 text-purple-400">
          <img src={nexusLogo} alt="Nexus Connect logo" className="h-8 w-8 object-contain" />
          <span>Nexus Connect</span>
        </div>
        
        <nav className="flex flex-col space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.name}
              to={item.path}
              className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === item.path 
                ? 'bg-zinc-800 text-white shadow-sm' 
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
              }`}
            >
              {item.icon}
              <span>{item.name}</span>
            </Link>
          ))}
        </nav>

        {isEngineRunning && (
          <div className="mt-8 px-2">
            <button
              onClick={() => window.api?.stopSending()}
              className="w-full flex items-center justify-center gap-2 bg-rose-600/10 border border-rose-600/30 text-rose-500 hover:bg-rose-600 hover:text-white px-4 py-3 rounded-lg font-bold transition duration-200 animate-pulse shadow-[0_0_15px_rgba(225,29,72,0.3)]"
            >
              <div className="w-2 h-2 rounded-full bg-rose-500" />
              Stop Engine
            </button>
          </div>
        )}
      </div>
      
      <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <UserButton afterSignOutUrl="/" appearance={{ elements: { userButtonAvatarBox: "w-8 h-8" } }} />
          <div className="text-xs">
            <span className="block font-medium text-white">Profile</span>
            {isLoading ? (
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Checking plan...</span>
            ) : isPro ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-300 uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-indigo-500/20 border border-indigo-400/30">
                <Crown className="w-3 h-3" />
                Pro
              </span>
            ) : (
              <Link
                to="/settings"
                className="inline-flex text-[10px] font-bold text-amber-300 uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-amber-500/15 border border-amber-400/30 hover:bg-amber-500/25 transition"
              >
                Get Pro
              </Link>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}