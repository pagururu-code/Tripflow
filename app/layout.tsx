import type { Metadata, Viewport } from 'next';
import ShareTripButton from '@/components/Shared/ShareTripButton';
import InboxOrganizer from '@/components/Inbox/InboxOrganizer';
import PlaceHoursEnhancer from '@/components/Shared/PlaceHoursEnhancer';
import PlaceMetadataHydrator from '@/components/Shared/PlaceMetadataHydrator';
import PlaceSearchResultStyle from '@/components/Shared/PlaceSearchResultStyle';
import LegacyDomEnhancements from '@/components/Shared/LegacyDomEnhancements';
import './globals.css';
export const metadata: Metadata = {
  title: 'TripFlow', description: '아이폰에서 쓰는 여행 일정 앱', manifest:'/manifest.webmanifest',
  appleWebApp: { capable:true, title:'TripFlow', statusBarStyle:'black-translucent' },
  icons: { apple:'/icons/icon-192.png' }
};
export const viewport: Viewport = { width:'device-width', initialScale:1, maximumScale:1, viewportFit:'cover', themeColor:'#17231d' };
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ko"><body>{children}<InboxOrganizer/><PlaceHoursEnhancer/><PlaceMetadataHydrator/><PlaceSearchResultStyle/><ShareTripButton/><LegacyDomEnhancements/></body></html>}
