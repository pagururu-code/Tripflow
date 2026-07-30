import type { InboxItem } from './inbox';
import type { Schedule } from './schedule';
import type { Trip } from './trip';

export * from './bucket';
export * from './inbox';
export * from './place';
export * from './schedule';
export * from './trip';

export interface AppData {
  trips: Trip[];
  schedules: Schedule[];
  inbox: InboxItem[];
  activeTripId: string;
}
