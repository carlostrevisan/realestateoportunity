import "@testing-library/jest-dom";
import { server } from "./mocks/server.js";

// Start MSW before every test suite, clean up handlers between tests,
// and shut down after all tests finish.
beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
