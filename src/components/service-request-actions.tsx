"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  acknowledgeServiceRequest,
  resolveServiceRequest,
} from "@/app/requests/actions";

type ServiceRequestActionsProps = {
  requestId: string;
  requestType: "STAFF_CALL" | "CHECK_BILL";
  status: string;
};

export function ServiceRequestActions({
  requestId,
  requestType,
  status,
}: ServiceRequestActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  function submit(action: typeof acknowledgeServiceRequest, successMessage: string) {
    setFeedback(null);
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("requestId", requestId);
        const result = await action(formData);
        if (result.error) {
          setFeedback(result.error);
          return;
        }
        setFeedback(result.success ?? successMessage);
        router.refresh();
      } catch {
        setFeedback("บันทึกสถานะไม่สำเร็จ กรุณาลองอีกครั้ง");
      }
    });
  }

  return (
    <div className="request-actions">
      {status === "OPEN" ? (
        <button
          className="secondary-button"
          disabled={isPending}
          onClick={() => submit(acknowledgeServiceRequest, "รับเรื่องแล้ว")}
          type="button"
        >
          {isPending ? "กำลังบันทึก…" : "รับเรื่อง"}
        </button>
      ) : null}
      <button
        className="primary-button compact"
        disabled={isPending}
        onClick={() => submit(resolveServiceRequest, requestType === "CHECK_BILL" ? "ส่งต่อชำระแล้ว" : "ปิดงานแล้ว")}
        type="button"
      >
        {isPending ? "กำลังบันทึก…" : requestType === "CHECK_BILL" ? "ส่งต่อชำระ" : "ปิดงาน"}
      </button>
      {feedback ? <p className="request-action-feedback" role="status">{feedback}</p> : null}
    </div>
  );
}
