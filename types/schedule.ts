import type { LatLng } from './place';

export type ItemType = 'flight' | 'train' | 'bus' | 'hotel' | 'ticket' | 'place' | 'manual';

export interface Schedule {
  id: string;
  tripId: string;
  title: string;
  date: string;
  start: string;
  duration: number;
  type: ItemType;
  address?: string;
  location?: LatLng;
  openingHours?: string[];
  placeType?: string;
  mapUrl?: string;
  note?: string;
  transferMinutes?: number;
  fixed?: boolean;
}
