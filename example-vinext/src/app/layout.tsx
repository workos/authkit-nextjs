import type { Metadata } from "next";
import NextLink from "next/link";
import { SignInButton } from "./components/sign-in-button";
import { Footer } from "./components/footer";
import {
  AuthKitProvider,
  Impersonation,
} from "@workos-inc/authkit-nextjs/components";

export const metadata: Metadata = {
  title: "Example AuthKit App (vinext)",
  description:
    "Example vinext application demonstrating how to use AuthKit on Vite.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ padding: 0, margin: 0, fontFamily: "system-ui, sans-serif", backgroundColor: "#f5f5f5" }}>
        <AuthKitProvider>
          <Impersonation />
          <div style={{ maxWidth: 800, margin: "0 auto", padding: 20 }}>
            <div
              style={{
                backgroundColor: "#fff",
                borderRadius: 8,
                padding: 32,
                minHeight: "70vh",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
                <nav style={{ display: "flex", gap: 12 }}>
                  <NextLink href="/" style={{ padding: "8px 16px", borderRadius: 6, backgroundColor: "#f0f0f0", textDecoration: "none", color: "#333", fontSize: 14 }}>
                    Home
                  </NextLink>
                  <NextLink href="/account" style={{ padding: "8px 16px", borderRadius: 6, backgroundColor: "#f0f0f0", textDecoration: "none", color: "#333", fontSize: 14 }}>
                    Account
                  </NextLink>
                </nav>
                <SignInButton />
              </header>

              <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {children}
              </main>
            </div>
            <Footer />
          </div>
        </AuthKitProvider>
      </body>
    </html>
  );
}
