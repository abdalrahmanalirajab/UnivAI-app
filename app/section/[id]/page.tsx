import SectionRoom from "./SectionRoom";

export default async function SectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SectionRoom sectionId={id} />;
}
