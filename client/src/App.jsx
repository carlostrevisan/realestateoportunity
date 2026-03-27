import { useState, useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, NavLink, useLocation } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Operations from "./pages/Operations.jsx";
import Reporting from "./pages/Reporting.jsx";
import Help from "./pages/Help.jsx";
import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/react";

const NAV_ITEMS = [
  { to: "/",          label: "Home",        end: true },
  { to: "/reporting", label: "Reports"               },
  { to: "/map",       label: "Map"                   },
  { to: "/ops",       label: "Data Engine"            },
  { to: "/help",      label: "Guide"                  },
];

function MobileMenu({ open, onClose }) {
  const location = useLocation();

  useEffect(() => { onClose(); }, [location.pathname]);

  return (
    <div
      className={`absolute top-12 left-0 right-0 bg-white/97 backdrop-blur-md border-b border-plt-border shadow-lg z-[1999] flex flex-col overflow-hidden transition-all duration-200 ease-out ${
        open ? "max-h-96 py-2 opacity-100" : "max-h-0 py-0 opacity-0 pointer-events-none"
      }`}
    >
      {NAV_ITEMS.map(({ to, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onClose}
          className={({ isActive }) =>
            `px-6 py-3 text-sm font-semibold transition-colors ${
              isActive
                ? "text-plt-accent bg-plt-accent/5 border-l-2 border-plt-accent"
                : "text-plt-muted hover:text-plt-secondary hover:bg-plt-hover/50 border-l-2 border-transparent"
            }`
          }
        >
          {label}
        </NavLink>
      ))}
    </div>
  );
}

function AppNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => { if (navRef.current && !navRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const navClass = ({ isActive }) =>
    `px-3 py-2 text-xs font-semibold transition-all border-b-2 flex items-center justify-center whitespace-nowrap ${
      isActive
        ? "text-plt-accent border-plt-accent bg-plt-accent/5"
        : "text-plt-muted border-transparent hover:text-plt-secondary hover:bg-plt-hover/50"
    }`;

  return (
    <nav ref={navRef} className="bg-white/90 backdrop-blur-md border-b border-plt-border px-4 sm:px-6 flex items-center h-12 flex-shrink-0 z-[2000] relative">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-3 lg:mr-8 flex-shrink-0">
        <div className="w-2.5 h-2.5 bg-plt-accent rounded-sm status-active shadow-[0_0_10px_var(--plt-accent)]" />
        <span className="font-semibold text-sm tracking-tight text-plt-primary whitespace-nowrap">
          RE <span className="text-plt-accent">Opportunity</span>
        </span>
      </div>

      {/* Desktop nav links — shown at lg+ where there's enough room for 5 items */}
      <div className="hidden lg:flex h-full items-stretch">
        {NAV_ITEMS.map(({ to, label, end }) => (
          <NavLink key={to} to={to} end={end} className={navClass}>{label}</NavLink>
        ))}
      </div>

      {/* Auth — always right side */}
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <Show when="signed-out">
          <SignInButton mode="modal">
            <button className="text-xs font-semibold text-plt-muted hover:text-plt-secondary transition-colors whitespace-nowrap">Sign In</button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button className="px-3 py-1 text-xs font-semibold bg-plt-accent text-white rounded hover:bg-plt-accent/90 transition-colors whitespace-nowrap">Sign Up</button>
          </SignUpButton>
        </Show>
        <Show when="signed-in">
          <UserButton />
        </Show>

        {/* Hamburger — below lg */}
        <button
          className="lg:hidden flex flex-col justify-center items-center w-8 h-8 gap-1.5 rounded hover:bg-plt-hover/50 transition-colors flex-shrink-0"
          onClick={() => setMenuOpen(o => !o)}
          aria-label="Toggle menu"
        >
          <span className={`block w-5 h-0.5 bg-plt-secondary transition-all duration-200 origin-center ${menuOpen ? "rotate-45 translate-y-[7px]" : ""}`} />
          <span className={`block w-5 h-0.5 bg-plt-secondary transition-all duration-200 ${menuOpen ? "opacity-0 scale-x-0" : ""}`} />
          <span className={`block w-5 h-0.5 bg-plt-secondary transition-all duration-200 origin-center ${menuOpen ? "-rotate-45 -translate-y-[7px]" : ""}`} />
        </button>
      </div>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="h-screen w-screen bg-plt-bg text-plt-primary flex flex-col overflow-hidden selection:bg-plt-accent selection:text-white">
        <AppNav />
        <main className="flex-1 flex flex-col overflow-hidden relative">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/reporting" element={<Reporting />} />
            <Route path="/map" element={<Dashboard />} />
            <Route path="/ops" element={<Operations />} />
            <Route path="/help" element={<Help />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
