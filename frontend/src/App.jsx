import { useState } from "react";

import ProtectedRoute from "./components/ProtectedRoute";
import Sidebar from "./components/Sidebar";

import ChatWindow from "./components/ChatWindow";

import ManualAnalysisPage from "./pages/ManualAnalysisPage";
import HistoryPage from "./pages/HistoryPage";
import ConnectedApps from "./pages/ConnectedApps";
import Watchlist from "./pages/Watchlist";

export default function App() {
  const [section, setSection] = useState("manual");

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    // Full reload so every in-memory query cache / open dashboard state
    // clears along with the token - the next account to log in on this
    // browser should never see a trace of the previous one's data.
    window.location.reload();
  };

  return (
    <ProtectedRoute>
      <div className="flex h-screen w-full bg-bg">
        <Sidebar
          active={section}
          onSelect={setSection}
          onLogout={handleLogout}
        />

        <div className="flex-1 overflow-hidden">

          {section === "manual" && (
            <ManualAnalysisPage
              onAskLiminal={() => setSection("chat")}
            />
          )}

          {section === "chat" && (
            <ChatWindow />
          )}

          {section === "history" && (
            <HistoryPage />
          )}

          {section === "connected-apps" && (
            <ConnectedApps />
          )}



          {section === "watchlist" && (
            <Watchlist />
          )}

          {section === "timeline" && (
            <div className="p-8">
              <h1 className="text-3xl font-bold">
                Timeline
              </h1>

              <p className="mt-3 text-gray-500">
                Coming next.
              </p>
            </div>
          )}

        </div>
      </div>
    </ProtectedRoute>
  );
}
