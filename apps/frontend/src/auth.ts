import { createAuthClient } from "better-auth/client";
import { passkeyClient } from "@better-auth/passkey/client";

const client = createAuthClient({
  baseURL: window.location.origin,
  plugins: [passkeyClient()],
});

window.EntityAuth = client;
declare global {
  interface Window {
    EntityAuth: typeof client;
  }
}
