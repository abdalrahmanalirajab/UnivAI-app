import LectureRoom from "./LectureRoom";
import DemoLectureRoom from "./DemoLectureRoom";
import StandaloneLectureRoom from "./StandaloneLectureRoom";
import { getLectureMaterialAccess } from "@/lib/lecture-materials";
import { getLectureMakeupAccess } from "@/lib/lecture-makeup";
import { requireLearningAction } from "@/lib/session";
import { isStandalone } from "@/lib/runtime";
import { redirect } from "next/navigation";
import MakeupLectureGate from "./MakeupLectureGate";
import { isDemoMediaTransport } from "@/lib/live-session-transport";

export default async function LecturePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (isStandalone()) {
    return <StandaloneLectureRoom lectureId={Number(id)} />;
  }
  const user = await requireLearningAction(`/lecture/${id}`);
  const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  const makeup = validId
    ? await getLectureMakeupAccess(user.registrationNumber, id)
    : null;
  const room = isDemoMediaTransport()
    ? <DemoLectureRoom lectureId={id} />
    : <LectureRoom lectureId={id} />;
  if (makeup) {
    return (
      <MakeupLectureGate
        lectureId={id}
        week={makeup.week}
        title={makeup.title}
        initialState={makeup.state}
        activeRoom={room}
      />
    );
  }
  const access = validId ? await getLectureMaterialAccess(user.registrationNumber, id) : null;
  if (access?.mode === "archive") redirect(`/lecture/${id}/archive`);
  return room;
}
