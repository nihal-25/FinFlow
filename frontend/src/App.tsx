import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import axios from "axios";
import { useAuthStore } from "./stores/auth.store.ts";
import LoginPage from "./pages/LoginPage.tsx";
import RegisterPage from "./pages/RegisterPage.tsx";
import DashboardLayout from "./pages/DashboardLayout.tsx";
import DashboardHome from "./pages/DashboardHome.tsx";
import AccountsPage from "./pages/AccountsPage.tsx";
import SendMoneyPage from "./pages/SendMoneyPage.tsx";
import TransactionsPage from "./pages/TransactionsPage.tsx";
import FraudAlertsPage from "./pages/FraudAlertsPage.tsx";
import SettingsPage from "./pages/SettingsPage.tsx";

interface RefreshResponse {
  success: boolean;
  data: {
    accessToken: string;
    user: { id: string; email: string; role: string; tenantId: string };
  };
}

function RequireAuth({ children }: { children: React.ReactNode }): React.ReactElement {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AuthInitializer({ children }: { children: React.ReactNode }): React.ReactElement {
  const [ready, setReady] = useState(false);
  const { setAccessToken, setUser, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated()) {
      setReady(true);
      return;
    }
    // Try to restore session from the httpOnly refresh token cookie
    const baseURL = (import.meta.env["VITE_API_URL"] as string | undefined) ?? "/api";
    axios
      .post<RefreshResponse>(`${baseURL}/auth/refresh`, {}, { withCredentials: true })
      .then(({ data }) => {
        if (data.success) {
          setAccessToken(data.data.accessToken);
          setUser(data.data.user);
        }
      })
      .catch(() => { /* no valid cookie — user will see login */ })
      .finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-3 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}

export default function App(): React.ReactElement {
  return (
    <BrowserRouter>
      <AuthInitializer>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <DashboardLayout />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardHome />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="send" element={<SendMoneyPage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="fraud-alerts" element={<FraudAlertsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </AuthInitializer>
    </BrowserRouter>
  );
}
