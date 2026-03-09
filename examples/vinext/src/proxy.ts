import { authkitProxy } from "@workos-inc/authkit-nextjs";

export default authkitProxy();

// Match against the pages
export const config = {
  matcher: [
    "/",
    "/account/:path*",
    "/api/:path*",
  ],
};
