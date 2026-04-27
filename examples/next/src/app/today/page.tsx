import { Badge, Box, Button, Card, Flex, Heading, Separator, Table, Text, TextArea, TextField } from '@radix-ui/themes';
import { requireMemberContext } from '@/lib/auth-context';
import {
  getExecutionFlowOptions,
  getTodaySnapshotForMember,
  isExecutionFlowPostgresEnabled,
} from '@/lib/execution-flow-store-postgres';
import {
  addCustomerToListAction,
  createMeetingAction,
  createNoteAction,
  markTaskDoneAction,
  removeCustomerFromListAction,
} from './actions';

function toLocal(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

type TodayStatus = 'success' | 'error';
type TodayActionKey = 'mark_task_done' | 'add_customer_to_list' | 'remove_customer_from_list' | 'create_note' | 'create_meeting';

function getSingleQueryParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function resolveBannerMessage(status: TodayStatus, action: TodayActionKey): string {
  if (status === 'success') {
    if (action === 'mark_task_done') return 'Task marked as done.';
    if (action === 'add_customer_to_list') return 'Customer added to list.';
    if (action === 'remove_customer_from_list') return 'Customer removed from list.';
    if (action === 'create_note') return 'Note created.';
    if (action === 'create_meeting') return 'Meeting created.';
  }

  if (action === 'mark_task_done') return 'Could not mark task as done.';
  if (action === 'add_customer_to_list') return 'Could not add customer to list.';
  if (action === 'remove_customer_from_list') return 'Could not remove customer from list.';
  if (action === 'create_note') return 'Could not create note.';
  return 'Could not create meeting.';
}

export default async function TodayPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const context = await requireMemberContext();
  const statusRaw = getSingleQueryParam(searchParams.status);
  const actionRaw = getSingleQueryParam(searchParams.action);
  const status = statusRaw === 'success' || statusRaw === 'error' ? statusRaw : null;
  const action =
    actionRaw === 'mark_task_done' ||
    actionRaw === 'add_customer_to_list' ||
    actionRaw === 'remove_customer_from_list' ||
    actionRaw === 'create_note' ||
    actionRaw === 'create_meeting'
      ? actionRaw
      : null;

  if (!isExecutionFlowPostgresEnabled()) {
    return (
      <Flex direction="column" gap="3" maxWidth="900px">
        <Heading size="8">Today</Heading>
        <Text color="gray">
          Set `DATABASE_URL` to enable Postgres-backed execution flows for Tasks, Meetings, Lists, and Notes.
        </Text>
      </Flex>
    );
  }

  const snapshot = await getTodaySnapshotForMember({
    organizationId: context.organizationId,
    memberId: context.memberId,
  });
  const options = await getExecutionFlowOptions({
    organizationId: context.organizationId,
  });

  return (
    <Flex direction="column" gap="5" width="100%" maxWidth="1100px">
      <Flex direction="column" gap="2">
        <Heading size="8">Today</Heading>
        <Text color="gray">Overdue and due-today tasks first, then upcoming meetings and recent customer updates.</Text>
      </Flex>
      {status && action ? (
        <Card size="1">
          <Text color={status === 'success' ? 'green' : 'red'}>{resolveBannerMessage(status, action)}</Text>
        </Card>
      ) : null}

      <Card size="3">
        <Heading size="4" mb="3">
          My Tasks
        </Heading>
        <Table.Root variant="surface">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>Title</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Priority</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Due</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Order Bucket</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Action</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {snapshot.tasks.map((task) => (
              <Table.Row key={task.taskId}>
                <Table.RowHeaderCell>{task.title}</Table.RowHeaderCell>
                <Table.Cell>
                  <Badge>{task.priority}</Badge>
                </Table.Cell>
                <Table.Cell>{toLocal(task.dueAt)}</Table.Cell>
                <Table.Cell>
                  <Badge color={task.status === 'done' ? 'green' : 'blue'}>{task.status}</Badge>
                </Table.Cell>
                <Table.Cell>{task.sortBucket}</Table.Cell>
                <Table.Cell>
                  {(task.status === 'open' || task.status === 'in_progress') && (
                    <form action={markTaskDoneAction}>
                      <input type="hidden" name="taskId" value={task.taskId} />
                      <Button type="submit" size="1" variant="soft">
                        Mark done
                      </Button>
                    </form>
                  )}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Card>

      <Separator size="4" />

      <Flex gap="4" wrap="wrap">
        <Card size="3" style={{ minWidth: 320, flex: '1 1 320px' }}>
          <Heading size="4" mb="3">
            Upcoming Meetings
          </Heading>
          <Flex direction="column" gap="2">
            {snapshot.upcomingMeetings.map((meeting) => (
              <Box key={meeting.meetingId}>
                <Text weight="medium">{meeting.title}</Text>
                <Text size="2" color="gray">
                  {toLocal(meeting.scheduledAt)}
                </Text>
              </Box>
            ))}
          </Flex>
        </Card>

        <Card size="3" style={{ minWidth: 320, flex: '1 1 320px' }}>
          <Heading size="4" mb="3">
            Recent Customers
          </Heading>
          <Flex direction="column" gap="2">
            {snapshot.recentCustomers.map((customer) => (
              <Box key={customer.customerId}>
                <Text weight="medium">{customer.name}</Text>
                <Text size="2" color="gray">
                  Updated {toLocal(customer.updatedAt)}
                </Text>
              </Box>
            ))}
          </Flex>
        </Card>
      </Flex>

      <Card size="3">
        <Heading size="4" mb="3">
          My Lists
        </Heading>
        <Flex direction="column" gap="2">
          {snapshot.lists.map((list) => (
            <Box key={list.listId}>
              <Text weight="medium">{list.name}</Text>
              <Text size="1" color="gray">
                {list.listId}
              </Text>
              <Text size="2" color="gray">
                {list.description ?? 'No description'}
              </Text>
            </Box>
          ))}
        </Flex>
      </Card>

      <Separator size="4" />

      <Flex gap="4" wrap="wrap">
        <Card size="3" style={{ minWidth: 320, flex: '1 1 320px' }}>
          <Heading size="4" mb="3">
            Add Customer To List
          </Heading>
          <form action={addCustomerToListAction}>
            <Flex direction="column" gap="2">
              <Text size="2">List</Text>
              <select name="listId" required>
                <option value="">Select list</option>
                {options.lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.label}
                  </option>
                ))}
              </select>
              <Text size="2">Customer</Text>
              <select name="customerId" required>
                <option value="">Select customer</option>
                {options.customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.label}
                  </option>
                ))}
              </select>
              <Button type="submit">Add</Button>
            </Flex>
          </form>
        </Card>

        <Card size="3" style={{ minWidth: 320, flex: '1 1 320px' }}>
          <Heading size="4" mb="3">
            Remove Customer From List
          </Heading>
          <form action={removeCustomerFromListAction}>
            <Flex direction="column" gap="2">
              <Text size="2">List</Text>
              <select name="listId" required>
                <option value="">Select list</option>
                {options.lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.label}
                  </option>
                ))}
              </select>
              <Text size="2">Customer</Text>
              <select name="customerId" required>
                <option value="">Select customer</option>
                {options.customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.label}
                  </option>
                ))}
              </select>
              <Button type="submit" color="red" variant="soft">
                Remove
              </Button>
            </Flex>
          </form>
        </Card>
      </Flex>

      <Flex gap="4" wrap="wrap">
        <Card size="3" style={{ minWidth: 320, flex: '1 1 320px' }}>
          <Heading size="4" mb="3">
            Create Note
          </Heading>
          <form action={createNoteAction}>
            <Flex direction="column" gap="2">
              <Text size="2">Customer</Text>
              <select name="customerId" required>
                <option value="">Select customer</option>
                {options.customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.label}
                  </option>
                ))}
              </select>
              <Text size="2">Title</Text>
              <TextField.Root name="title" placeholder="Note title" required />
              <Text size="2">Body</Text>
              <TextArea name="body" placeholder="Note body" required />
              <Button type="submit">Create note</Button>
            </Flex>
          </form>
        </Card>

        <Card size="3" style={{ minWidth: 320, flex: '1 1 320px' }}>
          <Heading size="4" mb="3">
            Create Meeting
          </Heading>
          <form action={createMeetingAction}>
            <Flex direction="column" gap="2">
              <Text size="2">Customer</Text>
              <select name="customerId" required>
                <option value="">Select customer</option>
                {options.customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.label}
                  </option>
                ))}
              </select>
              <Text size="2">Title</Text>
              <TextField.Root name="title" placeholder="Weekly sync" required />
              <Text size="2">Meeting URL</Text>
              <TextField.Root name="meetingUrl" placeholder="https://meet.example.com/..." />
              <Text size="2">Scheduled At (ISO)</Text>
              <TextField.Root name="scheduledAt" placeholder="2026-04-27T18:00:00Z" />
              <Text size="2">Duration Minutes</Text>
              <TextField.Root name="durationMinutes" placeholder="30" />
              <Text size="2">Participant 1</Text>
              <select name="participantId1">
                <option value="">None</option>
                {options.people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.label}
                  </option>
                ))}
              </select>
              <Text size="2">Participant 2</Text>
              <select name="participantId2">
                <option value="">None</option>
                {options.people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.label}
                  </option>
                ))}
              </select>
              <Text size="2">Follow-up Task Title (optional)</Text>
              <TextField.Root name="followupTaskTitle" placeholder="Send recap" />
              <Button type="submit">Create meeting</Button>
            </Flex>
          </form>
        </Card>
      </Flex>
    </Flex>
  );
}
