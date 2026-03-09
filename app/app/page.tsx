import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { HomeWorkspace } from "@/components/home/HomeWorkspace";
import { buildQuotaAuthContext, getQuotaSnapshot } from "@/lib/server/quota";

export const metadata: Metadata = {
  title: "App",
  alternates: {
    canonical: "/app",
  },
};

export default async function AppPage() {
  const authState = await auth();
  const initialQuota = await getQuotaSnapshot(
    authState.userId,
    buildQuotaAuthContext(authState),
  );

  return <HomeWorkspace initialQuota={initialQuota} />;
}
