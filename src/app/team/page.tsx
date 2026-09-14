import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyFacility } from "@/app/builder/actions";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { getTeam } from "./actions";
import { TeamClient } from "./team-client";

export default async function TeamPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [facility, team, t] = await Promise.all([getMyFacility(), getTeam(), getTranslations()]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", minHeight: 0, overflow: "hidden" }}>
      {facility && (
        <AppHeader
          facilityName={facility.name}
          floorText={t("common.floorText", { width: facility.widthM.toFixed(1), height: facility.heightM.toFixed(1) })}
          userEmail={session.user.email ?? ""}
        />
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 26 }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, marginBottom: 4 }}>{t("team.title")}</div>
          <p className="text-muted" style={{ fontSize: 13, marginBottom: 20 }}>{t("team.subtitle")}</p>
          <TeamClient
            members={team.members}
            pendingInvites={team.pendingInvites}
            canManage={team.canManage}
            myUserId={team.myUserId}
          />
        </div>
      </div>
    </div>
  );
}
