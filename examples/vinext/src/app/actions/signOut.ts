"use server";

import { signOut } from "@workos-inc/authkit-nextjs";

export const handleSignOutAction = async () => {
  await signOut();
};
