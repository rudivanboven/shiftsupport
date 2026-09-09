import type { Metadata } from "next";
import { requireRetailer } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui/Kit";
import PostShiftForm from "./PostShiftForm";

export const metadata: Metadata = { title: "Post a shift | ShiftSupport" };

export default async function PostShiftPage() {
  const { store } = await requireRetailer();

  return (
    <>
      <PageHeader
        eyebrow="New shift"
        title="Post a shift"
        description="Tell workers what you need and when. You'll get applications from people nearby, and you choose who works it."
      />
      <PostShiftForm storeName={store.name} />
    </>
  );
}
