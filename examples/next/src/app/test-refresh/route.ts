import { withAuth } from "@workos-inc/authkit-nextjs";
import { refreshSession } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";

/**
 * Test route that forces a session refresh via the refresh token.
 * Returns the refreshed user info as JSON.
 */
export const GET = async () => {
  try {
    const result = await refreshSession();
    return NextResponse.json({
      refreshed: true,
      user: result.user
        ? { email: result.user.email, firstName: result.user.firstName }
        : null,
      organizationId: result.organizationId ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { refreshed: false, error: String(error) },
      { status: 500 }
    );
  }
};
