"use client";

import { Button, Callout, Code, Flex, Heading, Text, TextField, Badge, Box } from "@radix-ui/themes";
import { useAuth, useAccessToken } from "@workos-inc/authkit-nextjs/components";
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
  const { accessToken, loading: tokenLoading, refresh } = useAccessToken();

  const [orgIdInput, setOrgIdInput] = useState("");
  const [switchResult, setSwitchResult] = useState<string | null>(null);

  const handleRefreshToken = async () => {
    try {
      await refresh();
      setSwitchResult("Token refreshed successfully");
    } catch (err) {
      setSwitchResult(`Refresh error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleSwitchOrg = async () => {
    if (!orgIdInput.trim()) {
      setSwitchResult("Please enter an organization ID");
      return;
    }
    setSwitchResult(null);
    try {
      const result = await switchToOrganization(orgIdInput.trim());
      if (result && "error" in result) {
        setSwitchResult(`Error: ${result.error}`);
      } else {
        setSwitchResult("Switched successfully");
      }
    } catch (err) {
      setSwitchResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  if (loading) return null;

  if (!user) {
    return (
      <Flex direction="column" gap="4" align="center">
        <Heading size="8">Client-Side Hooks Demo</Heading>
        <Text size="5" color="gray">Sign in to see hooks in action</Text>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="6" align="center" maxWidth="600px" mx="auto">
      <Heading size="8">Client-Side Hooks Demo</Heading>

      {/* Session info */}
      <Flex direction="column" gap="2" width="100%">
        <Heading size="4">Session</Heading>
        <Text size="2">Session ID: <Code>{sessionId ?? "none"}</Code></Text>
        <Text size="2">
          Organization:{" "}
          <Badge color={organizationId ? "green" : "gray"}>
            {organizationId ?? "none"}
          </Badge>
        </Text>
        {role && <Text size="2">Role: <Code>{role}</Code></Text>}
        {permissions && permissions.length > 0 && (
          <Text size="2">Permissions: <Code>{permissions.join(", ")}</Code></Text>
        )}
        {impersonator && (
          <Text size="2" color="yellow">
            Impersonated by: {impersonator.email}
          </Text>
        )}
      </Flex>

      {/* Access Token */}
      <Flex direction="column" gap="2" width="100%">
        <Heading size="4">Access Token</Heading>
        <Text size="2">
          Status:{" "}
          <Badge color={tokenLoading ? "yellow" : accessToken ? "green" : "red"}>
            {tokenLoading ? "loading" : accessToken ? "available" : "none"}
          </Badge>
        </Text>
        <Button size="2" variant="soft" onClick={handleRefreshToken}>
          Refresh Token
        </Button>
      </Flex>

      {/* Org Switching */}
      <Flex direction="column" gap="2" width="100%">
        <Heading size="4">Organization Switching</Heading>
        <Flex gap="2">
          <Box flexGrow="1">
            <TextField.Root
              placeholder="org_..."
              value={orgIdInput}
              onChange={(e) => setOrgIdInput(e.target.value)}
            />
          </Box>
          <Button onClick={handleSwitchOrg}>Switch</Button>
        </Flex>
        {switchResult && (
          <Callout.Root size="1">
            <Callout.Text>{switchResult}</Callout.Text>
          </Callout.Root>
        )}
      </Flex>

      {/* Sign Out */}
      <Button variant="soft" color="red" onClick={() => signOut()}>
        Sign Out (Client)
      </Button>
    </Flex>
  );
}
