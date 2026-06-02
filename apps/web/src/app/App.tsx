import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { ProtectedRoute } from '../features/auth/ProtectedRoute';
import { CopilotPage } from '../pages/CopilotPage';
import { HistoryPage } from '../pages/HistoryPage';
import { LoginPage } from '../pages/LoginPage';
import { SettingsPage } from '../pages/SettingsPage';
import { SignupPage } from '../pages/SignupPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/copilot" replace />} />
        <Route path="/copilot" element={<CopilotPage />} />
        <Route path="/history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/copilot" replace />} />
      </Route>
    </Routes>
  );
}
