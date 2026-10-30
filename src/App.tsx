import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/layout";
import { Spinner } from "@/components/ui";
import { LoginPage, RegisterPage } from "@/pages/Auth";
import { OverviewPage } from "@/pages/Overview";
import { ApiDetailPage, ExplorePage } from "@/pages/Explore";
import { MyApisPage } from "@/pages/MyApis";
import { PlaygroundPage } from "@/pages/Playground";
import { HistoryPage } from "@/pages/History";
import { ScansPage } from "@/pages/Scans";
import { SettingsPage } from "@/pages/Settings";
import { NotFoundPage } from "@/pages/NotFound";

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas">
        <div className="flex flex-col items-center gap-3">
          <Spinner className="h-5 w-5" />
          <p className="text-[12px] text-muted">Opening your workspace…</p>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Shell() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        element={
          <Protected>
            <Shell />
          </Protected>
        }
      >
        <Route index element={<OverviewPage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/explore/:slug" element={<ApiDetailPage />} />
        <Route path="/my-apis" element={<MyApisPage />} />
        <Route path="/playground" element={<PlaygroundPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/scans" element={<ScansPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
