import assert from "node:assert/strict";
import test from "node:test";
import { planPropertyMailbox, propertyMailRequestSchema } from "./property_mail_workflow.js";

test("urgent repairs take priority while documents and inspections stay visible", () => {
  const input = propertyMailRequestSchema.parse({
    domain: "mail.oak-street.example",
    mxRecords: [{ exchange: "inbound.example.net", priority: 10 }],
    maintenanceRequests: [
      { propertyId: "oak-12", summary: "Burst pipe", urgent: true },
      { propertyId: "oak-14", summary: "Loose cabinet hinge", urgent: false },
    ],
    tenantDocuments: [
      { tenantId: "tenant-7", documentName: "Insurance", received: false },
      { tenantId: "tenant-9", documentName: "Lease", received: true },
    ],
    inspectionReminders: [
      { propertyId: "oak-14", dueOn: "2027-02-18" },
      { propertyId: "oak-12", dueOn: "2027-01-12" },
    ],
  });

  assert.deepEqual(planPropertyMailbox(input), {
    maintenanceQueue: "priority",
    missingDocumentCount: 1,
    nextInspectionOn: "2027-01-12",
  });
});
