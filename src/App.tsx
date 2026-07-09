import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { AppHeader } from '@/components/layout/AppHeader';
import { AppFooter } from '@/components/layout/AppFooter';
import { ShortcutsHelp } from '@/components/layout/ShortcutsHelp';
import { Toaster } from '@/components/ui/toast';
import { useShortcutsHelp } from '@/hooks/useShortcutsHelp';

/** Returns true when the event target is a text-entry field we shouldn't hijack. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

export function App() {
  const setShortcutsOpen = useShortcutsHelp((s) => s.setOpen);

  // Global `?` (Shift+/) listener: open the shortcuts help unless typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      setShortcutsOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setShortcutsOpen]);

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <AppFooter />
      <ShortcutsHelp />
      <Toaster />
    </div>
  );
}
