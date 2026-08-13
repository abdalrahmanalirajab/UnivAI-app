import { vi } from "vitest";

// `server-only` deliberately throws when loaded outside Next's server graph.
// Route tests execute that graph directly in Vitest, so replace the marker;
// the production build still enforces the real client/server boundary.
vi.mock("server-only", () => ({}));
