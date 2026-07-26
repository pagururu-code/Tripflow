export type TravelMode = 'TRANSIT'|'WALK'|'DRIVE';
export type ItemType = 'flight'|'train'|'bus'|'hotel'|'ticket'|'place'|'manual';
export interface LatLng { lat:number; lng:number }
export interface Trip { id:string; title:string; startDate:string; endDate:string; city:string; dayStart:string; dayEnd:string; travelMode:TravelMode; }
export interface Schedule { id:string; tripId:string; title:string; date:string; start:string; duration:number; type:ItemType; address?:string; location?:LatLng; openingHours?:string[]; mapUrl?:string; note?:string; transferMinutes?:number; fixed?:boolean; }
export interface InboxItem { id:string; tripId:string; title:string; duration:number; type:ItemType; priority:number; address?:string; location?:LatLng; openingHours?:string[]; mapUrl?:string; note?:string; source?:'google-maps'|'manual'|'scan'; }
export interface AppData { trips:Trip[]; schedules:Schedule[]; inbox:InboxItem[]; activeTripId:string; }
