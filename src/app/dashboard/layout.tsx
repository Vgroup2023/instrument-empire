import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { ToastProvider } from '@/components/ui/Toast';
import { ScrollReset } from '@/components/layout/ScrollReset';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      {/* A fixed-height app shell: the header and menu stay put and only <main>
          scrolls, so the page doesn't bounce or slide under the browser bar. */}
      <div className="flex h-dvh overflow-hidden bg-surface-muted">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main id="app-scroll" className="safe-bottom min-h-0 flex-1 overflow-y-auto overscroll-none px-4 py-6 lg:px-8 lg:py-8">
            <ScrollReset />
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
