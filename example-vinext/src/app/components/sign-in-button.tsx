"use client";

/**
 * Example of a client component using the useAuth hook to get the current user session.
 */

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { handleSignOutAction } from "../actions/signOut";

const buttonStyle = (large?: boolean) => ({
  padding: large ? "12px 24px" : "8px 16px",
  borderRadius: 6,
  border: "1px solid #ddd",
  backgroundColor: "#333",
  color: "#fff",
  fontSize: large ? 16 : 14,
  cursor: "pointer" as const,
  textDecoration: "none" as const,
  display: "inline-block" as const,
});

export function SignInButton({ large }: { large?: boolean }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (user) {
    return (
      <form action={handleSignOutAction}>
        <button type="submit" style={buttonStyle(large)}>
          Sign Out
        </button>
      </form>
    );
  }

  return (
    <a href="/login" style={buttonStyle(large)}>
      Sign In {large && "with AuthKit"}
    </a>
  );
}
