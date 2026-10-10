import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { Building2, FileSignature, Handshake, KeyRound, LayoutDashboard, Users, Wallet } from 'lucide-react';
import logo from '@/assets/brand/amwaj-logo.jpeg';
import { salesApi } from '@/api/salesApi';
import { DemoContext, readDemoPreference, writeDemoPreference } from '@/components/app/DemoContext';
import { DemoToggle } from '@/components/app/DemoToggle';
import { MeContext } from '@/components/app/MeContext';
import { ErrorState, LoadingBlock } from '@/components/app/Primitives';
import { Toaster } from '@/components/ui/sonner';
import { useApi } from '@/hooks/useApi';
import { initials, setDisplayTimeZone } from '@/lib/format';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/leads', label: 'My leads', icon: Users },
  { to: '/customers', label: 'Customers', icon: Handshake },
  { to: '/units', label: 'Units', icon: Building2 },
  { to: '/eois', label: 'EOIs & holds', icon: FileSignature },
  { to: '/reservations', label: 'Reservations', icon: KeyRound },
  { to: '/commission', label: 'My commission', icon: Wallet },
];

export default function AppLayout() {
  const me = useApi(async () => {
    const result = await salesApi.me();
    setDisplayTimeZone(result.timeZone);
    return result;
  }, []);
  const location = useLocation();
  const [demo, setDemoState] = useState(readDemoPreference);
  const demoMode = useMemo(
    () => ({
      demo,
      setDemo: (on: boolean) => {
        writeDemoPreference(on);
        setDemoState(on);
      },
    }),
    [demo]
  );
  const mainRef = useRef<HTMLElement>(null);
  const previousPath = useRef<string | null>(null);

  // Move focus to the new page heading after navigation, for keyboard and screen-reader users.
  useEffect(() => {
    if (previousPath.current !== null && previousPath.current !== location.pathname) {
      const heading = mainRef.current?.querySelector<HTMLElement>('h1');
      (heading ?? mainRef.current)?.focus();
    }
    previousPath.current = location.pathname;
  }, [location.pathname]);

  return (
    <DemoContext.Provider value={demoMode}>
      <div className="min-h-screen bg-background">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-brand-navy focus:shadow focus:ring-2 focus:ring-ring"
        >
          Skip to main content
        </a>
        <header className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <NavLink to="/" className="flex items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <img src={logo} alt="Amwaj International" className="h-8 w-auto sm:h-9" />
              <span className="hidden border-l border-border pl-3 text-xs font-semibold uppercase tracking-[0.18em] text-brand-steel sm:inline">
                Sales workspace
              </span>
            </NavLink>
            {me.data && (
              <div className="flex items-center gap-2.5">
                <DemoToggle />
                <div className="hidden text-right leading-tight sm:block">
                  <div className="text-sm font-medium text-brand-navy">{me.data.name}</div>
                  <div className="text-xs text-muted-foreground">Signed in with Salesforce</div>
                </div>
                <span
                  className="flex size-9 items-center justify-center rounded-full bg-brand-navy text-sm font-semibold text-white"
                  aria-label={`Signed in as ${me.data.name}`}
                  role="img"
                >
                  {initials(me.data.name)}
                </span>
              </div>
            )}
          </div>
          <nav aria-label="Main" className="mx-auto max-w-7xl px-2 sm:px-4 lg:px-6">
            <ul className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none]">
              {NAV.map(item => (
                <li key={item.to} className="shrink-0">
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        'flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-t-md',
                        isActive
                          ? 'border-brand-navy text-brand-navy'
                          : 'border-transparent text-muted-foreground hover:border-border hover:text-brand-navy'
                      )
                    }
                  >
                    <item.icon className="size-4" aria-hidden="true" />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </header>

        <main id="main-content" ref={mainRef} tabIndex={-1} className="mx-auto max-w-7xl px-4 py-6 outline-none sm:px-6 sm:py-8 lg:px-8">
          {me.loading && !me.data ? (
            <LoadingBlock rows={4} label="Connecting to Salesforce" />
          ) : me.error && !me.data ? (
            <ErrorState
              message={
                me.errorInfo?.status === 403
                  ? 'Your Salesforce user cannot open the sales workspace yet. It needs the "SalesUI Access" permission set.'
                  : me.error
              }
              status={me.errorInfo?.status}
              detail={me.errorInfo?.detail}
              onRetry={me.reload}
            />
          ) : (
            <MeContext.Provider value={me.data}>
              <Outlet />
            </MeContext.Provider>
          )}
        </main>
        <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs text-muted-foreground sm:px-6 lg:px-8">
          Amwaj International ·{' '}
          {demo
            ? 'Demo data: customers, payments and commission on Customers and My commission are samples, not Salesforce records'
            : 'Records, prices and commission come from Salesforce'}
          {me.data ? ` · Amounts in ${me.data.currencyCode}` : ''}
        </footer>
        <Toaster />
      </div>
    </DemoContext.Provider>
  );
}
