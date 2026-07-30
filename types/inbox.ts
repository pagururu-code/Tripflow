import type { LatLng } from './place';
import type { ItemType } from './schedule';

export interface InboxItem {
  id: string;
  tripId: string;
  title: string;
  duration: number;
  type: ItemType;
  priority: number;
  address?: string;
  location?: LatLng;
  openingHours?: string[];
  placeType?: string;
  mapUrl?: string;
  note?: string;
  source?: 'google-maps' | 'manual' | 'scan';
}
