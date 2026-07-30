export const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

export const toTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export const formatDuration = (minutes: number) =>
  `${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)}시간 ` : ''}${minutes % 60 ? `${minutes % 60}분` : ''}`.trim();
