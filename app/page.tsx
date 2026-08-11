import TripFlowApp from '@/components/TripFlow/TripFlowApp';
import TimelineDisplayEnhancements from '@/components/TripFlow/TimelineDisplayEnhancements';
import TimelineUxRefinements from '@/components/TripFlow/TimelineUxRefinements';
import SubitemSourcePicker from '@/components/TripFlow/SubitemSourcePicker';

export default function Page() {
  return <><TripFlowApp /><TimelineDisplayEnhancements /><TimelineUxRefinements /><SubitemSourcePicker /></>;
}
