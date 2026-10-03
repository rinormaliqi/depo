"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useNotify } from "@/components/notifications";
import { unwrap } from "@/lib/action-result";
import type { ContractPriceBreakdown } from "@/lib/billing-plans";
import { SIGNED_CONTRACT_MAX_BYTES, SIGNED_CONTRACT_MIME } from "@/lib/contracts-shared";
import { startContract } from "./actions";

const startContractUnwrapped = unwrap(startContract);

type ClientInfo = { legalName: string; registrationNumber: string; address: string; contactName: string; contactEmail: string };
type ContractRow = {
  id: string;
  status: "draft" | "signed";
  months: number;
  pricingSnapshot: ContractPriceBreakdown;
  clientInfo: ClientInfo;
  signedFileName: string | null;
};

function eur(cents: number) {
  return `€${(cents / 100).toFixed(2)}`;
}

// 3- and 6-month contracts carry no discount, so the standard-price and
// discount rows would only repeat the total — they're shown for 12 only.
function PricingSummary({ pricing, months }: { pricing: ContractPriceBreakdown; months: number }) {
  const t = useTranslations("contract");
  return (
    <div style={{ padding: 12, border: "1px solid var(--color-divider)", background: "#fff", fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span className="text-muted">{t("monthlyPrice")}</span>
        <span>{eur(pricing.monthlyPriceCents)}</span>
      </div>
      {pricing.discountCents > 0 && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span className="text-muted">{t("standardTotal", { n: months })}</span>
            <span>{eur(pricing.standardTotalCents)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-accent-800)" }}>
            <span>{t("discount")}</span>
            <span>-{eur(pricing.discountCents)}</span>
          </div>
        </>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-heading)", fontSize: 16, marginTop: 4, paddingTop: 4, borderTop: "1px solid var(--color-divider)" }}>
        <span>{t("finalTotal")}</span>
        <span>{eur(pricing.finalTotalCents)}</span>
      </div>
    </div>
  );
}

function NewContractForm({
  planKey,
  months,
  defaultLegalName,
  defaultContactEmail,
  pricing,
}: {
  planKey: string;
  months: number;
  defaultLegalName: string;
  defaultContactEmail: string;
  pricing: ContractPriceBreakdown;
}) {
  const t = useTranslations("contract");
  const router = useRouter();
  const notify = useNotify();
  const [legalName, setLegalName] = useState(defaultLegalName);
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [address, setAddress] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState(defaultContactEmail);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const done = await notify.run(() =>
      startContractUnwrapped(planKey, months, { legalName, registrationNumber, address, contactName, contactEmail }),
    );
    setBusy(false);
    if (done !== undefined) router.refresh();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      style={{ display: "flex", flexDirection: "column", gap: 10 }}
    >
      <PricingSummary pricing={pricing} months={months} />
      <div className="field">
        <label>{t("field.legalName")}</label>
        <input className="input" value={legalName} onChange={(e) => setLegalName(e.target.value)} required />
      </div>
      <div className="field">
        <label>{t("field.registrationNumber")}</label>
        <input className="input" value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} placeholder={t("field.registrationNumberOptional")} />
      </div>
      <div className="field">
        <label>{t("field.address")}</label>
        <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} required />
      </div>
      <div className="field">
        <label>{t("field.contactName")}</label>
        <input className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} required />
      </div>
      <div className="field">
        <label>{t("field.contactEmail")}</label>
        <input className="input" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} required />
      </div>
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? t("generating") : t("generateContract")}
      </button>
    </form>
  );
}

function UploadSignedForm({ contractId }: { contractId: string }) {
  const t = useTranslations("contract");
  const router = useRouter();
  const notify = useNotify();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (!file) return;
    if (file.size > SIGNED_CONTRACT_MAX_BYTES) {
      notify.warning(t("errorFileTooLarge"));
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch(`/api/contracts/${contractId}/signed`, { method: "POST", body });
      if (!res.ok) throw new Error(t("errorUploadFailed"));
      notify.success(t("uploaded"));
      router.refresh();
    } catch (e) {
      notify.warning(e instanceof Error ? e.message : t("errorUploadFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <input
        className="input"
        type="file"
        accept={SIGNED_CONTRACT_MIME.join(",")}
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <button type="button" className="btn btn-primary" onClick={upload} disabled={busy || !file}>
        {busy ? t("uploading") : t("uploadSigned")}
      </button>
    </div>
  );
}

export function ContractFlow({
  planKey,
  months,
  planName,
  pricing,
  defaultLegalName,
  defaultContactEmail,
  existing,
}: {
  planKey: string;
  months: number;
  planName: string;
  pricing: ContractPriceBreakdown;
  defaultLegalName: string;
  defaultContactEmail: string;
  existing: ContractRow | null;
}) {
  const t = useTranslations("contract");

  if (!existing) {
    return <NewContractForm planKey={planKey} months={months} defaultLegalName={defaultLegalName} defaultContactEmail={defaultContactEmail} pricing={pricing} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <PricingSummary pricing={existing.pricingSnapshot} months={existing.months} />
      <a href={`/api/contracts/${existing.id}/pdf`} className="btn btn-secondary" download>
        {t("downloadContract")}
      </a>
      {existing.status === "signed" ? (
        <div style={{ padding: 12, border: "1px solid var(--color-divider)", background: "#fff", fontSize: 13 }}>
          <p style={{ margin: 0, fontWeight: 600 }}>{t("signedReceivedTitle")}</p>
          <p className="text-muted" style={{ marginTop: 6, marginBottom: 0 }}>{t("signedReceivedBody")}</p>
        </div>
      ) : (
        <div style={{ padding: 12, border: "1px solid var(--color-divider)", background: "#fff", display: "flex", flexDirection: "column", gap: 8 }}>
          <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>{t("uploadHint", { plan: planName })}</p>
          <UploadSignedForm contractId={existing.id} />
        </div>
      )}
    </div>
  );
}
