import SectionRoom from "./SectionRoom";
import DemoSectionRoom from "./DemoSectionRoom";
import { isDemoMediaTransport } from "@/lib/live-session-transport";
import { requireLearningAction } from "@/lib/session";

export default async function SectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (isDemoMediaTransport()) {
    await requireLearningAction(`/section/${id}`);
    return <DemoSectionRoom sectionId={id} />;
  }
  return <SectionRoom sectionId={id} />;
}
