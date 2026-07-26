import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TripFlow 여행 일정', short_name: 'TripFlow', description: '항공편·장소·빈 시간을 한눈에 정리하는 여행 일정 앱',
    start_url: '/', display: 'standalone', background_color: '#f6f3ec', theme_color: '#17231d', orientation: 'portrait',
    icons: [
      { src:'/icons/icon-192.png', sizes:'192x192', type:'image/png' },
      { src:'/icons/icon-512.png', sizes:'512x512', type:'image/png' },
      { src:'/icons/icon-maskable-512.png', sizes:'512x512', type:'image/png', purpose:'maskable' }
    ]
  };
}
