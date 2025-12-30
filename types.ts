export interface AsanaUser {
  gid: string;
  name: string;
}

export interface AsanaStory {
  gid: string;
  created_at: string;
  created_by: AsanaUser;
  resource_subtype: string;
  text: string;
  type: string;
}

export interface AsanaTask {
  gid: string;
  name: string;
  notes: string;
  assignee: AsanaUser | null;
  due_on: string | null;
  completed: boolean;
  permalink_url: string;
  projects?: { gid: string; name: string }[];
}

// Extended interface to hold the recursive data for our app
export interface EnrichedTask extends AsanaTask {
  stories: AsanaStory[];
  subtasks: EnrichedTask[];
}

export interface LogEntry {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
  timestamp: number;
}