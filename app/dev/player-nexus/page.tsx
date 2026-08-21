import { requireDeveloper } from "@/lib/session";
import PlayerNexus from "./PlayerNexus";

export default async function PlayerNexusPage() {
  const developer = await requireDeveloper();
  return <PlayerNexus developerId={developer.id} />;
}
