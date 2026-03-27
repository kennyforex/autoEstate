import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { AppShell } from "./components/layout";
import { Login } from "./pages/Login";
import { SetPassword } from "./pages/SetPassword";
import { Dashboard } from "./pages/Dashboard";
import { Inbox } from "./pages/Inbox";
import { AILogs } from "./pages/AILogs";
import { AssistantList, AssistantPlayground } from "./pages/AIAssistant";
import { ChannelList, WhatsAppConfig } from "./pages/Channels";
import { Contacts } from "./pages/Contacts";
import {
  SettingsLayout,
  ProfileSettings,
  TeamSettings,
  APIKeysSettings,
  RolesSettings,
  GeneralSettings,
  SMTPSettings,
  ConnectedAppsSettings,
} from "./pages/Settings";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />

          {/* Set password (pending users after first login) */}
          <Route path="/set-password" element={<SetPassword />} />

          {/* Protected routes */}
          <Route path="/" element={<AppShell />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="inbox" element={<Inbox />} />

            {/* AI Assistant routes */}
            <Route path="ai-assistant" element={<AssistantList />} />
            <Route path="ai-assistant/:id" element={<AssistantPlayground />} />

            {/* AI Logs route */}
            <Route path="ai-logs" element={<AILogs />} />

            {/* Channels routes */}
            <Route path="channels" element={<ChannelList />} />
            <Route path="channels/:id" element={<WhatsAppConfig />} />

            {/* Contacts route */}
            <Route path="contacts" element={<Contacts />} />

            {/* Settings routes */}
            <Route path="settings" element={<SettingsLayout />}>
              <Route
                index
                element={<Navigate to="/settings/profile" replace />}
              />
              <Route path="profile" element={<ProfileSettings />} />
              <Route
                path="security"
                element={<PlaceholderPage title="Security" />}
              />
              <Route
                path="notifications"
                element={<PlaceholderPage title="Notifications" />}
              />
              <Route path="general" element={<GeneralSettings />} />
              <Route path="team" element={<TeamSettings />} />
              <Route path="roles" element={<RolesSettings />} />
              <Route
                path="ai-behavior"
                element={<PlaceholderPage title="AI Behavior" />}
              />
              <Route
                path="knowledge-base"
                element={<PlaceholderPage title="Knowledge Base" />}
              />
              <Route
                path="training"
                element={<PlaceholderPage title="Training Data" />}
              />
              <Route
                path="apps"
                element={<ConnectedAppsSettings />}
              />
              <Route path="smtp" element={<SMTPSettings />} />
              <Route path="api-keys" element={<APIKeysSettings />} />
              <Route
                path="webhooks"
                element={<PlaceholderPage title="Webhooks" />}
              />
            </Route>
          </Route>

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

// Placeholder component for settings pages that aren't fully implemented
function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary">{title}</h1>
        <p className="text-text-secondary mt-1">
          This settings page is under development.
        </p>
      </div>
      <div className="card p-8 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">🚧</span>
        </div>
        <h3 className="text-lg font-medium text-text-primary mb-2">
          Coming Soon
        </h3>
        <p className="text-text-secondary">
          This feature is currently under development. Check back soon!
        </p>
      </div>
    </div>
  );
}

export default App;
