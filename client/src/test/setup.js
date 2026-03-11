import "@testing-library/jest-dom";
import { server } from "./mocks/server.js";

// happy-dom does not implement pointer capture APIs used by Radix UI primitives.
// Polyfill them so Select, Dialog, etc. can be interacted with in tests.
if (typeof Element !== "undefined" && !Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

// Start MSW before every test suite, clean up handlers between tests,
// and shut down after all tests finish.
beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
