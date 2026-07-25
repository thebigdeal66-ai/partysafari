import AuthGuard from "@/components/AuthGuard";
import DiscoverTonightExperience from "@/components/discover/DiscoverTonightExperience";

export default function Dashboard() {
  return (
    <AuthGuard>
      <DiscoverTonightExperience />
    </AuthGuard>
  );
}
