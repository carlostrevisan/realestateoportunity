import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import Dashboard from "./pages/Dashboard.jsx";
import Operations from "./pages/Operations.jsx";
import Help from "./pages/Help.jsx";

export default function App() {
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === "light" ? "dark" : "light"));
  };

  const navClass = ({ isActive }) =>
    `px-3 md:px-4 py-2 md:py-1.5 text-[10px] md:text-xs font-mono font-medium uppercase tracking-widest transition-colors border-b-2 flex-1 md:flex-none text-center ${
      isActive
        ? "text-plt-green border-plt-green"
        : "text-plt-secondary border-transparent hover:text-plt-primary hover:border-plt-border"
    }`;

  return (
    <BrowserRouter>
      <div className="h-screen w-screen bg-plt-bg text-plt-primary flex flex-col overflow-hidden">
        {/* Nav */}
        <nav className="bg-plt-panel border-b border-plt-border px-4 md:px-6 flex flex-col md:flex-row items-center gap-2 md:gap-6 py-2 md:h-11">
          <div className="flex items-center gap-2 md:mr-6">
            <div className="w-2 h-2 rounded-full bg-plt-green status-dot-active" />
            <span className="text-plt-green font-mono font-bold text-xs md:text-sm tracking-wider">
              FL·OPP·ENGINE
            </span>
          </div>
          <div className="flex w-full md:w-auto items-center flex-1">
            <NavLink to="/" end className={navClass}>Map</NavLink>
            <NavLink to="/ops" className={navClass}>Operations</NavLink>
            <NavLink to="/help" className={navClass}>Docs</NavLink>
          </div>
          
          <button 
            onClick={toggleTheme}
            className="md:ml-auto p-1.5 text-plt-secondary hover:text-plt-primary transition-colors flex items-center gap-2"
            title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          >
            <span className="text-[10px] font-mono uppercase tracking-wider hidden md:inline">
              {theme === "light" ? "Dark" : "Light"} Mode
            </span>
            {theme === "light" ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 9H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            )}
          </button>
        </nav>

        <main className="flex-1 flex flex-col overflow-hidden">
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
