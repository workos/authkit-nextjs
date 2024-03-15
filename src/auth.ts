import { getAuthorizationUrl } from "./get-authorization-url";
import { cookies } from "next/headers";
import { cookieName } from "./cookie";
import { terminateSession } from "./session";

async function getSignInUrl() {
  return getAuthorizationUrl();
}

async function signOut() {
  cookies().delete(cookieName);
  await terminateSession();
}

export { getSignInUrl, signOut };
