export type TaskStatus = 'open' | 'in_progress' | 'done' | 'canceled';
export type TaskPriority = 'low' | 'medium' | 'high';
export type NoteLinkedObjectType = 'customer' | 'person' | 'meeting' | 'task';

export interface TodayTask {
  taskId: string;
  customerId: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  sortBucket: number;
}

export interface UpcomingMeeting {
  meetingId: string;
  customerId: string;
  title: string;
  scheduledAt: string;
}

export interface RecentCustomer {
  customerId: string;
  name: string;
  lifecycleStage: string;
  status: string;
  updatedAt: string;
}

export interface TodayList {
  listId: string;
  name: string;
  description: string | null;
  updatedAt: string;
}

export interface TodaySnapshot {
  tasks: TodayTask[];
  upcomingMeetings: UpcomingMeeting[];
  recentCustomers: RecentCustomer[];
  lists: TodayList[];
}

export interface CreateMeetingWithParticipantsInput {
  organizationId: string;
  customerId: string;
  title: string;
  meetingUrl?: string | null;
  scheduledAt?: string | null;
  durationMinutes?: number | null;
  summary?: string | null;
  notes?: string | null;
  participantIds?: string[];
  followupTaskTitle?: string | null;
  followupTaskDescription?: string | null;
  followupTaskDueAt?: string | null;
  followupTaskOwnerMemberId?: string | null;
  followupTaskPriority?: TaskPriority;
}

export interface CreateCheckedNoteInput {
  organizationId: string;
  customerId: string;
  title: string;
  body: string;
  authorMemberId: string;
  linkedObjectType?: NoteLinkedObjectType | null;
  linkedObjectId?: string | null;
}
