import { workos } from "./workos";
import { WORKOS_CLIENT_ID, WORKOS_REDIRECT_URI } from "./env-variables";

async function getAuthorizationUrl() {
  return workos.userManagement.getAuthorizationUrl({
    provider: "authkit",
    clientId: WORKOS_CLIENT_ID,
    redirectUri: WORKOS_REDIRECT_URI,
  });
}

export { getAuthorizationUrl };
