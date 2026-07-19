import LectureRoom from "./LectureRoom";

export default async function LecturePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LectureRoom lectureId={Number(id)} />;
}
