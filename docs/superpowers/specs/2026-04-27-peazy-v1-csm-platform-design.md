# Peazy V1 CSM Platform Design

## Summary

Peazy V1 is a bare-minimum post-sale CSM platform. It gives Customer Success Managers and Account Managers one place to manage customers, people, tasks, meetings, notes, lists, and internal team members.

V1 intentionally does not include AI recommendations, Peazy Guide configuration, workflow automation, health scoring, or a success-plan abstraction. The goal is to replace the CSM's scattered daily workspace across CRM, note takers, spreadsheets, and project/task tools with a simple, coherent operating surface.

The object model borrows directly from Lightfield's concrete CRM primitives, adapted for post-sale work:

- Account becomes Customer.
- Contact becomes Person.
- Task remains Task.
- Meeting remains Meeting.
- Note remains Note.
- List remains List.
- Member remains Member.

This gives Peazy a future-proof product spine without overbuilding intelligence in V1.

## Goals

- Provide a clean WorkOS-authenticated command center for post-sale teams.
- Make Customer the center of the product.
- Give CSMs one place to see customer context, people, notes, meetings, and tasks.
- Support curated focus lists such as "Renewing this quarter" and "Needs attention."
- Keep the information architecture simple enough for a first coding-agent implementation.
- Preserve room for later AI, Guide, workflows, integrations, memory search, and health scoring.

## Non-Goals

- No Peazy Guide or embedded widget management.
- No AI recommendations, account briefs, summaries, agent runs, or signals.
- No workflow builder.
- No public API.
- No custom object builder.
- No full CRM replacement.
- No support inbox, email sync, calendar sync, Slack sync, or live integrations.
- No "Success Plan" object in V1. The term is too overloaded and should not be introduced until we know the exact workflow it represents.

## Product Positioning

Peazy V1 is a command center for CSMs who are firefighting across scattered systems.

The product answers:

- Who are my customers?
- Who are the people involved?
- What work is open?
- What meetings happened or are coming up?
- What notes do we know?
- Which customers belong to my current focus lists?
- Who owns the account internally?

It does not yet answer:

- What is risky?
- What should AI recommend?
- What should be automated?
- What should the customer-facing Guide do?

## Core Objects

### Customer

The company or organization the post-sale team manages.

System fields:

- `id`
- `organizationId`
- `name`
- `website`
- `lifecycleStage`
- `status`
- `ownerMemberId`
- `description`
- `createdAt`
- `updatedAt`

Suggested lifecycle stage options:

- `onboarding`
- `active`
- `renewal`
- `at_risk`
- `churned`

Suggested status options:

- `active`
- `inactive`

Relationships:

- Customer has many People.
- Customer has many Tasks.
- Customer has many Meetings.
- Customer has many Notes.
- Customer belongs to many Lists.
- Customer has one owner Member.

### Person

A person associated with a customer. This is intentionally named Person, not User, because CSMs manage champions, admins, executive sponsors, blockers, buyers, and end users.

System fields:

- `id`
- `organizationId`
- `customerId`
- `firstName`
- `lastName`
- `email`
- `phone`
- `title`
- `role`
- `relationshipStatus`
- `notes`
- `createdAt`
- `updatedAt`

Suggested role options:

- `champion`
- `admin`
- `executive_sponsor`
- `buyer`
- `end_user`
- `blocker`
- `unknown`

Suggested relationship status options:

- `strong`
- `neutral`
- `weak`
- `unknown`

### Task

An actionable CSM work item.

System fields:

- `id`
- `organizationId`
- `customerId`
- `title`
- `description`
- `status`
- `priority`
- `dueAt`
- `ownerMemberId`
- `createdAt`
- `updatedAt`
- `completedAt`

Suggested status options:

- `open`
- `in_progress`
- `done`
- `canceled`

Suggested priority options:

- `low`
- `medium`
- `high`

### Meeting

A scheduled or logged customer meeting. This object replaces vague "success plan" language in V1 with something CSMs already understand.

System fields:

- `id`
- `organizationId`
- `customerId`
- `title`
- `meetingUrl`
- `scheduledAt`
- `durationMinutes`
- `summary`
- `notes`
- `createdAt`
- `updatedAt`

Relationships:

- Meeting has many People as participants.
- Meeting can create many Tasks.
- Meeting can have many Notes.

V1 can support manual meeting creation only. Calendar sync is out of scope.

### Note

A rich text or markdown note linked to a customer, person, meeting, or task.

System fields:

- `id`
- `organizationId`
- `customerId`
- `title`
- `body`
- `authorMemberId`
- `linkedObjectType`
- `linkedObjectId`
- `createdAt`
- `updatedAt`

Notes are the first version of customer memory. They allow the CSM to paste call notes, account context, renewal concerns, implementation notes, and internal updates.

### List

A curated list of customers, inspired by Lightfield's List object.

System fields:

- `id`
- `organizationId`
- `name`
- `description`
- `objectType`
- `createdByMemberId`
- `createdAt`
- `updatedAt`

V1 should support customer lists only, even if the schema leaves room for other object types later.

Example lists:

- Renewing this quarter
- Needs attention
- Onboarding
- Executive sponsor missing
- My book of business

### Member

An internal Peazy workspace user.

System fields:

- `id`
- `organizationId`
- `workosUserId`
- `email`
- `name`
- `role`
- `createdAt`
- `updatedAt`

Suggested role options:

- `admin`
- `manager`
- `csm`
- `am`
- `viewer`

Authentication and identity should come from WorkOS AuthKit. The local Member record stores application-specific role and ownership information.

## Information Architecture

V1 sidebar:

- Today
- Customers
- People
- Tasks
- Meetings
- Notes
- Lists
- Settings

### Today

The landing page for a CSM.

V1 content:

- My open tasks due today or overdue.
- Recently updated customers.
- Upcoming meetings.
- My lists.

No AI prioritization in V1. Sort using deterministic rules:

- overdue tasks first
- due today next
- upcoming meetings soonest first
- recently updated customers newest first

### Customers

Customer list and customer detail.

Customer list columns:

- Name
- Lifecycle stage
- Status
- Owner
- Open tasks
- Upcoming meeting
- Updated

Customer detail tabs or sections:

- Overview
- People
- Tasks
- Meetings
- Notes
- Lists

Overview should show:

- basic customer metadata
- owner
- lifecycle stage
- status
- recent notes
- open tasks
- upcoming meetings

### People

List of people across customers.

Columns:

- Name
- Customer
- Role
- Title
- Email
- Relationship status

### Tasks

Global task list for the CSM.

Filters:

- owner
- customer
- status
- priority
- due date

### Meetings

Global meeting list.

V1 supports manual logged meetings and manually entered future meetings.

### Notes

Global notes list and note editor.

Notes should always be linked to a Customer. They may optionally link to a Person, Meeting, or Task.

### Lists

Curated customer lists.

V1 should support:

- create list
- edit list metadata
- add customer to list
- remove customer from list
- view customers in list

No dynamic segment builder in V1.

### Settings

Minimal settings:

- profile
- organization
- members

Use WorkOS/AuthKit as the base for authentication and organization context.

## Data Model Direction

Use normal relational tables for V1. Do not introduce a generic object graph yet. Every product table must include `organizationId` so data is scoped to the active WorkOS organization from the start.

Recommended tables:

- `members`
- `customers`
- `people`
- `tasks`
- `meetings`
- `meeting_participants`
- `notes`
- `lists`
- `list_customers`

This is deliberately simpler than the later Lightfield-inspired platform model. V1 should keep the schema concrete while preserving clean names and relationships.

Future-compatible naming matters:

- Use `customers`, not `accounts`.
- Use `people`, not `contacts` or `users`.
- Use `members` for internal users.
- Use `meetings` and `notes` as first-class objects.

## Recommended App Structure

The new repo should use the WorkOS AuthKit Next.js example as the base.

Target monorepo shape:

```txt
apps/command-center
packages/db
packages/ui
packages/domain
```

For this implementation, create `apps/command-center` as the runnable app. Add `packages/db`, `packages/ui`, and `packages/domain` only if the scaffolding is straightforward in the first pass. If package setup creates friction, keep the code inside `apps/command-center/src` and preserve the folder boundaries below.

Suggested app folders:

```txt
src/app/(app)/today
src/app/(app)/customers
src/app/(app)/people
src/app/(app)/tasks
src/app/(app)/meetings
src/app/(app)/notes
src/app/(app)/lists
src/app/(app)/settings
src/domain
src/db
src/components
```

## UI Direction

The UI should feel like disciplined operator software:

- calm
- dense but not cramped
- table-first where useful
- minimal cards
- compact headers
- clear object relationships
- no marketing-style hero layout
- no decorative gradients or oversized panels

Use shadcn/ui primitives for:

- sidebar
- buttons
- inputs
- forms
- tables
- dialogs/sheets
- badges
- dropdown menus
- tabs
- textarea

V1 should prioritize clarity over novelty.

## Data Flow

V1 should use server actions for form mutations and server components for primary page reads. Route handlers are only needed for API-style endpoints or WorkOS callbacks provided by the AuthKit base.

Basic flow:

1. WorkOS authenticates the user.
2. App resolves the current Member from the WorkOS user.
3. Member accesses Customers, People, Tasks, Meetings, Notes, and Lists scoped to the organization.
4. Mutations update concrete relational tables.
5. Pages revalidate or refetch after mutation.

No background jobs are required in V1.

## Permissions

V1 permissions can be simple:

- `admin`: manage members and all data
- `manager`: manage all customers and work
- `csm`: manage assigned customers and owned tasks
- `am`: manage assigned customers and owned tasks
- `viewer`: read-only

If this slows implementation, enforce authentication first and leave role restrictions as a clearly isolated follow-up.

## Seed Data

V1 should include realistic seed data:

- 8-12 customers
- 20-40 people
- 30-50 tasks
- 12-20 meetings
- 30-50 notes
- 4-6 lists
- 3-5 internal members

Seed data should demonstrate the actual CSM workflow:

- onboarding customers
- renewal customers
- customers needing attention
- multiple people per customer
- overdue tasks
- recent meeting notes
- curated customer lists

## Acceptance Criteria

- A user can sign in through WorkOS/AuthKit.
- A user can view the Today page.
- A user can create, view, edit, and delete Customers.
- A user can create, view, edit, and delete People linked to Customers.
- A user can create, view, edit, and complete Tasks linked to Customers.
- A user can create, view, edit, and delete Meetings linked to Customers.
- A user can create, view, edit, and delete Notes linked to Customers.
- A user can create Lists and add/remove Customers from Lists.
- Customer detail provides a usable single place to inspect people, tasks, meetings, notes, and list membership.
- The product contains no AI surfaces, Guide configuration, workflow builder, or success-plan object in V1.

## Implementation Order

1. Create or reshape the app shell from the WorkOS AuthKit Next.js example.
2. Add database setup and V1 tables.
3. Add seed data.
4. Build layout and sidebar.
5. Build Today.
6. Build Customers list and detail.
7. Build People.
8. Build Tasks.
9. Build Meetings.
10. Build Notes.
11. Build Lists.
12. Build minimal Settings.
13. Run QA across CRUD flows and navigation.

## Future Extensions

After V1 is stable, the likely next layers are:

- Document uploads.
- Meeting transcript ingestion.
- Customer memory search.
- Health/risk signals.
- AI account briefs.
- AI-generated follow-up drafts.
- Peazy Guide configuration.
- Workflow automation.
- Integrations with CRM, note takers, project tools, support tools, Slack, and product analytics.

These should not leak into the V1 implementation unless they are simple naming or schema choices that keep the future path open.
