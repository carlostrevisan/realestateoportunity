import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import Dashboard from "./pages/Dashboard.jsx";
import Operations from "./pages/Operations.jsx";
import Help from "./pages/Help.jsx";

export default function App() {
  const navClass = ({ isActive }) =>
    `px-3 sm:px-4 py-2 text-xs font-semibold transition-all border-b-2 flex items-center justify-center whitespace-nowrap ${
      isActive
        ? "text-plt-accent border-plt-accent bg-plt-accent/5"
        : "text-plt-muted border-transparent hover:text-plt-secondary hover:bg-plt-hover/50"
    }`;

  return (
    <BrowserRouter>
      <div className="h-screen w-screen bg-plt-bg text-plt-primary flex flex-col overflow-hidden selection:bg-plt-accent selection:text-white">
        {/* Tactical Global Nav */}
        <nav className="bg-white/90 backdrop-blur-md border-b border-plt-border px-6 flex items-center h-12 flex-shrink-0 z-[2000]">
          <div className="flex items-center gap-2 mr-4 md:mr-10 flex-shrink-0">
            <div className="w-2.5 h-2.5 bg-plt-accent rounded-sm status-active shadow-[0_0_10px_var(--plt-accent)]" />
            <span className="font-semibold text-sm tracking-tight text-plt-primary whitespace-nowrap">
              RE <span className="text-plt-accent">Opportunity</span>
            </span>
          </div>

          <div className="flex h-full items-stretch">
            <NavLink to="/" end className={navClass}>Map</NavLink>
            <NavLink to="/ops" className={navClass}>Data Engine</NavLink>
            <NavLink to="/help" className={navClass}>Guide</NavLink>
          </div>
        </nav>

        <main className="flex-1 flex flex-col overflow-hidden relative">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/ops" element={<Operations />} />
            <Route path="/help" element={<Help />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
