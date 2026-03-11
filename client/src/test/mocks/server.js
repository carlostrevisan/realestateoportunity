import { setupServer } from "msw/node";
import { handlers } from "./handlers.js";

// MSW node server — used in Vitest (Node runtime, not browser SW)
export const server = setupServer(...handlers);
