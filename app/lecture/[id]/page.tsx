import LectureRoom from "./LectureRoom";
import StandaloneLectureRoom from "./StandaloneLectureRoom";
import { isStandalone } from "@/lib/runtime";

export default async function LecturePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (isStandalone()) {
    return <StandaloneLectureRoom lectureId={Number(id)} />;
  }
  return <LectureRoom lectureId={Number(id)} />;
}
