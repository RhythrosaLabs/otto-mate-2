import { Sidebar } from "@/components/sidebar";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { PersistentLayout } from "@/components/persistent-layout";
import { BackgroundStatus } from "@/components/background-status";

export default function ComputerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-pplx-bg">
      <Sidebar />
      <main className="flex-1 overflow-hidden relative">
        <div className="md:hidden h-14" />
        <KeyboardShortcuts>
          <PersistentLayout>
            {children}
          </PersistentLayout>
        </KeyboardShortcuts>
      </main>
      <BackgroundStatus />
    </div>
  );
}
