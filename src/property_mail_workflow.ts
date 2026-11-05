import { createHash } from "node:crypto";
import { z } from "zod";
import { InfraiError, InfraiMailClient } from "./infrai_mail_client.js";

export const propertyMailRequestSchema = z.object({
  domain: z.string().min(1),
  mxRecords: z
    .array(
      z.object({
        exchange: z.string().min(1),
        priority: z.number().int().min(0).max(65_535),
      }),
    )
    .min(1),
  maintenanceRequests: z.array(
    z.object({
      propertyId: z.string().min(1),
      summary: z.string().min(1),
      urgent: z.boolean(),
    }),
  ),
  tenantDocuments: z.array(
    z.object({
      tenantId: z.string().min(1),
      documentName: z.string().min(1),
      received: z.boolean(),
    }),
  ),
  inspectionReminders: z.array(
    z.object({
      propertyId: z.string().min(1),
      dueOn: z.string().date(),
    }),
  ),
});

export type PropertyMailRequest = z.infer<typeof propertyMailRequestSchema>;

export type MailboxPlan = {
  maintenanceQueue: "priority" | "standard";
  missingDocumentCount: number;
  nextInspectionOn: string | null;
};

export function planPropertyMailbox(input: PropertyMailRequest): MailboxPlan {
  const nextInspectionOn = input.inspectionReminders
    .map((reminder) => reminder.dueOn)
    .sort()[0] ?? null;

  return {
    maintenanceQueue: input.maintenanceRequests.some((request) => request.urgent)
      ? "priority"
      : "standard",
    missingDocumentCount: input.tenantDocuments.filter((document) => !document.received)
      .length,
    nextInspectionOn,
  };
}

function requestId(input: PropertyMailRequest): string {
  return createHash("sha256")
    .update(JSON.stringify({ domain: input.domain, mxRecords: input.mxRecords }))
    .digest("hex")
    .slice(0, 16);
}

export async function configurePropertyMail(
  client: InfraiMailClient,
  input: PropertyMailRequest,
) {
  let domain: { zone_id: string };
  try {
    domain = await client.getDnsDomain(input.domain);
  } catch (error) {
    if (!(error instanceof InfraiError) || error.status !== 404) throw error;
    domain = await client.addDnsDomain(input.domain);
  }

  await Promise.all(
    input.mxRecords.map((record) =>
      client.upsertMxRecord({
        zone_id: domain.zone_id,
        name: "@",
        content: record.exchange,
        priority: record.priority,
        ttl: 3600,
      }),
    ),
  );

  const sendingDomains = await client.listSendingDomains();
  return {
    requestId: requestId(input),
    zoneId: domain.zone_id,
    mxRecordsApplied: input.mxRecords.length,
    sendingDomains,
    mailboxPlan: planPropertyMailbox(input),
  };
}
