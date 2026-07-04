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

  return (
    <ProtectedRoute>
      <div className="flex h-screen w-full bg-bg">
        <Sidebar
          active={section}
          onSelect={setSection}
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
