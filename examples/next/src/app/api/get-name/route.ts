import { authkit } from "@workos-inc/authkit-nextjs";
import { NextRequest, NextResponse } from "next/server";

export const GET = async (request: NextRequest) => {
  // Use 'authkit' for edge functions that don't have access to headers
  const { session } = await authkit(request);

  if (!session || !session.user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ name: session.user.firstName });
};
