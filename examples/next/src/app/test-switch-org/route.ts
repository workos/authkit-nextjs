import { switchToOrganization } from "@workos-inc/authkit-nextjs";
import { NextRequest, NextResponse } from "next/server";

/**
 * Test route that switches the session to a different organization.
 * Accepts ?org_id= query param. Returns the updated session info as JSON.
 */
export const GET = async (request: NextRequest) => {
  const orgId = request.nextUrl.searchParams.get("org_id");
  if (!orgId) {
    return NextResponse.json(
      { error: "org_id query param required" },
      { status: 400 }
    );
  }

  try {
    const result = await switchToOrganization(orgId, {
      revalidationStrategy: "none",
    });
    return NextResponse.json({
      switched: true,
      organizationId: result.organizationId ?? null,
      user: result.user
        ? { email: result.user.email, firstName: result.user.firstName }
        : null,
    });
  } catch (error) {
    return NextResponse.json(
      { switched: false, error: String(error) },
      { status: 500 }
    );
  }
};
