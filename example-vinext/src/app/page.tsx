"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { SignInButton } from "./components/sign-in-button";

export default function HomePage() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div style={{ textAlign: "center" }}>Loading...</div>;
  }

  return (
    <div style={{ textAlign: "center" }}>
      {user ? (
        <>
          <h1 style={{ fontSize: 32, marginBottom: 8 }}>
            Welcome back{user?.firstName && `, ${user?.firstName}`}
          </h1>
          <p style={{ color: "#666", fontSize: 18, marginBottom: 24 }}>
            You are now authenticated into the application
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <a
              href="/account"
              style={{
                padding: "12px 24px",
                borderRadius: 6,
                backgroundColor: "#f0f0f0",
                textDecoration: "none",
                color: "#333",
                fontSize: 16,
              }}
            >
              View account
            </a>
            <SignInButton large />
          </div>
        </>
      ) : (
        <>
          <h1 style={{ fontSize: 32, marginBottom: 8 }}>
            AuthKit authentication example
          </h1>
          <p style={{ color: "#666", fontSize: 18, marginBottom: 24 }}>
            Sign in to view your account details
          </p>
          <SignInButton large />
        </>
      )}
    </div>
  );
}
