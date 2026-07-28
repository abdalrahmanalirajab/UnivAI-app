import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

// Better Auth owns every /api/auth/* endpoint: sign-up, sign-in, reset,
// verify, sessions, and the admin plugin routes. See docs/auth-contract.md.
export const { GET, POST } = toNextJsHandler(auth);
