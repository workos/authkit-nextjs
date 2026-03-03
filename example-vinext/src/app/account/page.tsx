"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";

export default function AccountPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div style={{ textAlign: "center" }}>Loading...</div>;
  }

  if (!user) {
    // Middleware should redirect, but handle edge case
    return <div style={{ textAlign: "center" }}>Not signed in. Redirecting...</div>;
  }

  const userFields = [
    ["First name", user?.firstName],
    ["Last name", user?.lastName],
    ["Email", user?.email],
    ["Id", user?.id],
  ].filter(([, value]) => value);

  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <h1 style={{ fontSize: 32, marginBottom: 8 }}>Account details</h1>
        <p style={{ color: "#666", fontSize: 18 }}>
          Below are your account details
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 400, margin: "0 auto" }}>
        {userFields.map(([label, value]) => (
          <label key={String(label)} style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontWeight: 600, fontSize: 14, width: 100, flexShrink: 0 }}>
              {label}
            </span>
            <input
              value={String(value) || ""}
              readOnly
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid #ddd",
                fontSize: 14,
                backgroundColor: "#fafafa",
              }}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
