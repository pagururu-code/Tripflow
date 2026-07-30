export type TravelMode = 'TRANSIT' | 'WALK' | 'DRIVE';

export interface Trip {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  city: string;
  dayStart: string;
  dayEnd: string;
  travelMode: TravelMode;
}
