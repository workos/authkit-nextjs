"use client";

import {
  Badge,
  Box,
  Button,
  Callout,
  Code,
  Flex,
  Heading,
  Text,
  TextField,
} from "@radix-ui/themes";
import {
  useAuth,
  useAccessToken,
} from "@workos-inc/authkit-nextjs/components";
import { useState } from "react";

export default function ClientPage() {
  const {
    user,
    loading,
    sessionId,
    organizationId,
    role,
    permissions,
    impersonator,
    signOut,
    switchToOrganization,
  } = useAuth();
  const {
    accessToken,
    loading: tokenLoading,
    error: tokenError,
    refresh,
  } = useAccessToken();

  const [orgIdInput, setOrgIdInput] = useState("");
  const [switchOrgResult, setSwitchOrgResult] = useState<string | null>(null);
  const [refreshResult, setRefreshResult] = useState<string | null>(null);

  const handleRefreshToken = async () => {
    setRefreshResult(null);
    try {
      await refresh();
      setRefreshResult("Token refreshed successfully");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setRefreshResult(`Error: ${message}`);
    }
  };

  const handleClientSignOut = async () => {
    try {
      await signOut({ returnTo: "/" });
    } catch (err) {
      console.error("signOut() failed:", err);
    }
  };

  const handleSwitchOrg = async () => {
    if (!orgIdInput.trim()) {
      setSwitchOrgResult("Please enter an organization ID");
      return;
    }
    setSwitchOrgResult(null);
    try {
      const result = await switchToOrganization(orgIdInput.trim());
      if (result && "error" in result) {
        setSwitchOrgResult(`Error: ${result.error}`);
      } else {
        setSwitchOrgResult("Success! Check updated claims above.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSwitchOrgResult(`Error: ${message}`);
    }
  };

  if (loading) {
    return (
      <Flex direction="column" gap="2" align="center">
        <Heading size="8">Loading...</Heading>
      </Flex>
    );
  }

  if (!user) {
    return (
      <Flex direction="column" gap="4" align="center" maxWidth="600px">
        <Heading size="8" align="center">
          Client-Side Hooks Demo
        </Heading>
        <Text size="5" align="center" color="gray">
          This page demonstrates the client-side hooks from{" "}
          <Code>@workos-inc/authkit-nextjs/components</Code>
        </Text>
        <Callout.Root>
          <Callout.Text>
            Please sign in to see the client-side hooks in action.
          </Callout.Text>
        </Callout.Root>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="5" maxWidth="800px">
      <Flex direction="column" gap="2" mb="2">
        <Heading size="8" align="center">
          Client-Side Hooks Demo
        </Heading>
        <Text size="5" align="center" color="gray">
          Using <Code>useAuth()</Code> and <Code>useAccessToken()</Code>
        </Text>
      </Flex>

      <Callout.Root>
        <Callout.Text>
          This page uses client-side React hooks to access authentication data.
          Unlike server components, these hooks work in client components and
          automatically update when auth state changes.
        </Callout.Text>
      </Callout.Root>

      {/* useAuth() Hook */}
      <Flex direction="column" gap="3">
        <Heading size="5">useAuth() Hook</Heading>
        <Flex direction="column" gap="2">
          <Flex align="center" gap="2">
            <Text weight="bold" style={{ width: 150 }}>
              User ID:
            </Text>
            <TextField.Root
              value={user.id}
              readOnly
              style={{ flexGrow: 1 }}
            />
          </Flex>
          <Flex align="center" gap="2">
            <Text weight="bold" style={{ width: 150 }}>
              Email:
            </Text>
            <TextField.Root
              value={user.email}
              readOnly
              style={{ flexGrow: 1 }}
            />
          </Flex>
          <Flex align="center" gap="2">
            <Text weight="bold" style={{ width: 150 }}>
              First Name:
            </Text>
            <TextField.Root
              value={user.firstName || ""}
              readOnly
              style={{ flexGrow: 1 }}
            />
          </Flex>
          <Flex align="center" gap="2">
            <Text weight="bold" style={{ width: 150 }}>
              Last Name:
            </Text>
            <TextField.Root
              value={user.lastName || ""}
              readOnly
              style={{ flexGrow: 1 }}
            />
          </Flex>
          <Flex align="center" gap="2">
            <Text weight="bold" style={{ width: 150 }}>
              Session ID:
            </Text>
            <TextField.Root
              value={sessionId || ""}
              readOnly
              style={{ flexGrow: 1 }}
            />
          </Flex>
          {organizationId && (
            <Flex align="center" gap="2">
              <Text weight="bold" style={{ width: 150 }}>
                Organization ID:
              </Text>
              <TextField.Root
                value={organizationId}
                readOnly
                style={{ flexGrow: 1 }}
              />
            </Flex>
          )}
          {role && (
            <Flex align="center" gap="2">
              <Text weight="bold" style={{ width: 150 }}>
                Role:
              </Text>
              <TextField.Root
                value={role}
                readOnly
                style={{ flexGrow: 1 }}
              />
            </Flex>
          )}
          {permissions && permissions.length > 0 && (
            <Flex align="center" gap="2">
              <Text weight="bold" style={{ width: 150 }}>
                Permissions:
              </Text>
              <Flex gap="2" wrap="wrap" style={{ flexGrow: 1 }}>
                {permissions.map((p) => (
                  <Badge key={p} color="blue">
                    {p}
                  </Badge>
                ))}
              </Flex>
            </Flex>
          )}
          {impersonator && (
            <Flex align="center" gap="2">
              <Text weight="bold" style={{ width: 150 }}>
                Impersonator:
              </Text>
              <TextField.Root
                value={impersonator.email}
                readOnly
                style={{ flexGrow: 1 }}
              />
            </Flex>
          )}
        </Flex>
      </Flex>

      {/* useAccessToken() Hook */}
      <Flex direction="column" gap="3">
        <Heading size="5">useAccessToken() Hook</Heading>
        <Flex direction="column" gap="2">
          <Flex align="center" gap="2">
            <Text weight="bold" style={{ width: 150 }}>
              Token Status:
            </Text>
            <Badge
              color={tokenLoading ? "yellow" : accessToken ? "green" : "gray"}
            >
              {tokenLoading ? "Loading" : accessToken ? "Available" : "None"}
            </Badge>
          </Flex>
          {tokenError && (
            <Flex align="center" gap="2">
              <Text weight="bold" style={{ width: 150 }}>
                Error:
              </Text>
              <Badge color="red">{tokenError.message}</Badge>
            </Flex>
          )}
          {accessToken && (
            <Flex align="center" gap="2">
              <Text weight="bold" style={{ width: 150 }}>
                Access Token:
              </Text>
              <Box
                style={{
                  flexGrow: 1,
                  maxWidth: "100%",
                  overflow: "hidden",
                }}
              >
                <Code
                  size="2"
                  style={{ wordBreak: "break-all", display: "block" }}
                >
                  ...{accessToken.slice(-20)}
                </Code>
              </Box>
            </Flex>
          )}
          <Flex gap="2" mt="2">
            <Button onClick={handleRefreshToken} disabled={tokenLoading}>
              Refresh Token
            </Button>
          </Flex>
          {refreshResult && (
            <Callout.Root
              color={refreshResult.startsWith("Error") ? "red" : "green"}
            >
              <Callout.Text>{refreshResult}</Callout.Text>
            </Callout.Root>
          )}
        </Flex>
      </Flex>

      {/* Organization Management */}
      <Flex direction="column" gap="3">
        <Heading size="5">Organization Management</Heading>
        <Text size="2" color="gray">
          Switch to a different organization. Requires multi-organization setup
          in WorkOS.
        </Text>
        <Flex direction="column" gap="2">
          <Flex align="center" gap="2">
            <Text weight="bold" style={{ width: 150 }}>
              Current Org:
            </Text>
            <Badge color={organizationId ? "green" : "gray"} size="2">
              {organizationId || "None"}
            </Badge>
          </Flex>
          <Flex align="center" gap="2">
            <Text weight="bold" style={{ width: 150 }}>
              Switch to Org:
            </Text>
            <TextField.Root
              placeholder="org_..."
              value={orgIdInput}
              onChange={(e) => setOrgIdInput(e.target.value)}
              style={{ flexGrow: 1 }}
            />
            <Button onClick={handleSwitchOrg} disabled={!orgIdInput.trim()}>
              Switch
            </Button>
          </Flex>
          {switchOrgResult && (
            <Callout.Root
              color={switchOrgResult.startsWith("Success") ? "green" : "red"}
            >
              <Callout.Text>{switchOrgResult}</Callout.Text>
            </Callout.Root>
          )}
        </Flex>
      </Flex>

      {/* Sign Out */}
      <Flex direction="column" gap="3">
        <Heading size="5">Sign Out</Heading>
        <Flex gap="2" wrap="wrap">
          <Button onClick={handleClientSignOut} color="red">
            Sign Out (Client-Side)
          </Button>
        </Flex>
      </Flex>
    </Flex>
  );
}
