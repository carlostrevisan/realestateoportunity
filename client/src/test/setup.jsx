import React from "react";
import "@testing-library/jest-dom";
import { server } from "./mocks/server.js";
import { vi } from "vitest";

// happy-dom does not implement pointer capture APIs used by Radix UI primitives.
// Polyfill them so Select, Dialog, etc. can be interacted with in tests.
if (typeof Element !== "undefined" && !Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

// Mock Clerk
vi.mock("@clerk/react", () => ({
  ClerkProvider: ({ children }) => <div>{children}</div>,
  Show: ({ children, when }) => {
    if (when === "signed-in") return null; // Default to signed-out for tests
    return <div>{children}</div>;
  },
  SignInButton: ({ children }) => <div>{children}</div>,
  SignUpButton: ({ children }) => <div>{children}</div>,
  UserButton: () => <div>UserButton</div>,
  useUser: () => ({ isSignedIn: false, user: null }),
  useAuth: () => ({ isSignedIn: false, userId: null }),
}));

// Start MSW before every test suite, clean up handlers between tests,
// and shut down after all tests finish.
beforeAll(() => {
  server.listen({ onUnhandledRequest: "warn" });
  window.alert = vi.fn();
});
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => server.close());
