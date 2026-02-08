import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Login } from "./components/auth/Login";
import { Dashboard } from "./components/Dashboard";
import { HostSession } from "./components/session/HostSession";
import { ViewSession } from "./components/session/ViewSession";
import { ChatPage } from "./pages/ChatPage";
import { CalendarPage } from "./pages/CalendarPage";
import { getCurrentUser, logout, type UserInfo } from "./lib/auth";

interface User {
  id: string;
  email: string;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session on startup (via secure backend)
    getCurrentUser()
      .then((userInfo: UserInfo | null) => {
        if (userInfo) {
          setUser({ id: userInfo.id, email: userInfo.email });
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    await logout();
    setUser(null);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <Routes>
        <Route
          path="/login"
          element={
            user ? <Navigate to="/" replace /> : <Login onLogin={setUser} />
          }
        />
        <Route
          path="/"
          element={
            user ? (
              <Dashboard user={user} onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/host/:sessionId"
          element={user ? <HostSession /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/view/:sessionId"
          element={user ? <ViewSession /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/chat"
          element={user ? <ChatPage /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/chat/:conversationId"
          element={user ? <ChatPage /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/calendar"
          element={user ? <CalendarPage /> : <Navigate to="/login" replace />}
        />
      </Routes>
    </div>
  );
}

export default App;
