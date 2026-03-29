import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import App from "./App.jsx";
import "./index.css";
import "leaflet/dist/leaflet.css";

const clerkAppearance = {
  layout: {
    unsafe_disableDevelopmentModeWarnings: false,
  },
  elements: {
    card: "w-full max-w-[calc(100vw-2rem)] sm:max-w-md mx-auto",
    rootBox: "w-full",
  },
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ClerkProvider afterSignOutUrl="/" appearance={clerkAppearance}>
      <App />
    </ClerkProvider>
  </React.StrictMode>
);
