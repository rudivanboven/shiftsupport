"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markNotificationsRead } from "@/app/actions/notifications";
import { buttonClass } from "@/components/ui/buttonClass";

export default function MarkAllRead() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      className={buttonClass("ghost")}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markNotificationsRead();
          router.refresh();
        })
      }
    >
      {pending ? "Marking…" : "Mark all as read"}
    </button>
  );
}
