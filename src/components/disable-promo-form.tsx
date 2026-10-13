"use client";
import { useActionState } from "react";
import { disablePromoCode, type CommerceState } from "@/app/settings/commerce/actions";
export function DisablePromoForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(disablePromoCode, {} as CommerceState);
  return <form action={action}><input name="promoCodeId" type="hidden" value={id} /><button className="danger-button" disabled={pending}>ปิดโปรโมชั่น</button>{state.error ? <small role="alert">{state.error}</small> : state.success ? <small role="status">{state.success}</small> : null}</form>;
}
