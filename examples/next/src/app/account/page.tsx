import { Text, Heading, TextField, Flex, Box } from '@radix-ui/themes';
import { requireMemberContext } from '@/lib/auth-context';

export default async function AccountPage() {
  const memberContext = await requireMemberContext();

  const userFields = [
    ['Member ID', memberContext.memberId],
    ['Organization ID', memberContext.organizationId],
    ['Role', memberContext.role],
    ['WorkOS User ID', memberContext.workosUserId],
  ];

  return (
    <>
      <Flex direction="column" gap="2" mb="7">
        <Heading size="8" align="center">
          Account details
        </Heading>
        <Text size="5" align="center" color="gray">
          Below are your account details
        </Text>
      </Flex>

      {userFields && (
        <Flex direction="column" justify="center" gap="3" width="400px">
          {userFields.map(([label, value]) => (
            <Flex asChild align="center" gap="6" key={String(value)}>
              <label>
                <Text weight="bold" size="3" style={{ width: 100 }}>
                  {label}
                </Text>

                <Box flexGrow="1">
                  <TextField.Root value={String(value) || ''} readOnly />
                </Box>
              </label>
            </Flex>
          ))}
        </Flex>
      )}
    </>
  );
}
