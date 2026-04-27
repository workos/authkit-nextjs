import NextLink from 'next/link';
import { Box, Button, Card, Flex, Heading, Table, Text, TextField } from '@radix-ui/themes';
import { requireMemberContext } from '@/lib/auth-context';
import { listCustomers, listPeople } from '@/lib/customer-person-store';
import { createPersonAction, deletePersonFromPeoplePageAction } from './actions';

export default async function PeoplePage() {
  const context = await requireMemberContext();
  const customers = listCustomers({ organizationId: context.organizationId });
  const people = listPeople({ organizationId: context.organizationId });

  return (
    <Flex direction="column" gap="5" width="100%" maxWidth="1100px">
      <Flex direction="column" gap="2">
        <Heading size="8">People</Heading>
        <Text color="gray">Global people list linked to customers in the current organization.</Text>
      </Flex>

      <Card size="3">
        <form action={createPersonAction}>
          <Flex direction="column" gap="3">
            <Heading size="4">Create person</Heading>
            <Flex gap="3" wrap="wrap">
              <Box width="220px">
                <Text size="2">Customer ID</Text>
                <TextField.Root name="customerId" placeholder={customers[0]?.id ?? 'customer id'} required />
              </Box>
              <Box width="220px">
                <Text size="2">First name</Text>
                <TextField.Root name="firstName" required />
              </Box>
              <Box width="220px">
                <Text size="2">Last name</Text>
                <TextField.Root name="lastName" required />
              </Box>
              <Box width="260px">
                <Text size="2">Email</Text>
                <TextField.Root name="email" type="email" />
              </Box>
              <Box width="180px">
                <Text size="2">Role</Text>
                <TextField.Root name="role" defaultValue="unknown" />
              </Box>
            </Flex>
            <Flex justify="end">
              <Button type="submit">Create person</Button>
            </Flex>
          </Flex>
        </form>
      </Card>

      <Table.Root variant="surface">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Customer</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Role</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Email</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Actions</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {people.map((person) => (
            <Table.Row key={person.id}>
              <Table.RowHeaderCell>{`${person.firstName} ${person.lastName}`}</Table.RowHeaderCell>
              <Table.Cell>
                <Button asChild variant="ghost" size="1">
                  <NextLink href={`/customers/${person.customerId}`}>{person.customerId}</NextLink>
                </Button>
              </Table.Cell>
              <Table.Cell>{person.role}</Table.Cell>
              <Table.Cell>{person.email ?? '—'}</Table.Cell>
              <Table.Cell>
                <form action={deletePersonFromPeoplePageAction}>
                  <input type="hidden" name="personId" value={person.id} />
                  <Button type="submit" variant="soft" color="red" size="1">
                    Delete
                  </Button>
                </form>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Flex>
  );
}
