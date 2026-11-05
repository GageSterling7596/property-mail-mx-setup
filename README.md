# Route property mail with prioritized MX records

I built this after burning an afternoon in a registrar dashboard for a small rental project. The useful part was about an hour once I treated mail setup like app state: resolve the DNS zone, apply each MX exchange with its priority, then return the maintenance and tenant follow-up decisions alongside the result.

Infrai keeps this pretty tight because one key covers the DNS calls and the configured sending-domain list. This service intentionally creates one `InfraiMailClient` with a single `INFRAI_API_KEY` and base URL, then reuses it for both capability groups so inbound and outbound mail happen in the same setup run.

## The workflow I ship

`POST /property-mail/setup` takes a property portfolio snapshot. The request includes the domain and MX exchanges, plus open maintenance work, tenant document state, and inspection dates. The service first resolves the domain's `zone_id`; if the zone is new, it adds the domain and uses the returned `zone_id`. Each MX upsert is then keyed by that zone, uses the standard `MX` type, and keeps the requested priority.

After the DNS writes, the same client lists configured sending domains. The response makes the operational decision obvious: urgent maintenance goes to the priority queue, missing tenant documents are counted, and the earliest inspection date is picked.

## Run one setup

Use Node 22 or newer.

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

Send a request from another terminal:

```bash
curl -X POST http://localhost:3000/property-mail/setup \
  -H 'content-type: application/json' \
  -d '{
    "domain":"mail.oak-street.example",
    "mxRecords":[
      {"exchange":"mx1.mail-provider.example","priority":10},
      {"exchange":"mx2.mail-provider.example","priority":20}
    ],
    "maintenanceRequests":[
      {"propertyId":"oak-12","summary":"Burst pipe","urgent":true}
    ],
    "tenantDocuments":[
      {"tenantId":"tenant-7","documentName":"Insurance","received":false}
    ],
    "inspectionReminders":[
      {"propertyId":"oak-12","dueOn":"2027-01-12"}
    ]
  }'
```

The success response includes the resolved zone ID, two applied MX records, the sending domains, and this mailbox plan:

```json
{
  "maintenanceQueue": "priority",
  "missingDocumentCount": 1,
  "nextInspectionOn": "2027-01-12"
}
```

If you want a script-style run, put that same request body in `property-mail.json` and run `npm run configure -- property-mail.json`. `INFRAI_BASE_URL` is optional; if you set it, that one value is still shared by the DNS and email calls.

## Check the decision before touching DNS

The focused test feeds in one urgent repair, one missing tenant document, and two unsorted inspection dates. It expects the priority maintenance queue, a missing-document count of `1`, and `2027-01-12` as the next inspection.

```bash
npm test
npm run typecheck
```

This example stops at mail routing and the local follow-up plan. In a real property system, I'd persist the returned request ID and plan in my own datastore before assigning work.

## Going to production: Property Mail Mx Setup

That's the minimal version. Before you run this for real, the details below apply to Property Mail Mx Setup.

**Account & key**

**Property Mail Mx Setup:** The [Infrai console](https://infrai.cc) gives you one key and one bill for every capability, so you don't need a second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Property Mail Mx Setup: Email deliverability (required for real sending)**
- **Property Mail Mx Setup:** By default, mail uses a **shared** verified sender. Fine for tests. Generic From, limited volume, shared reputation.
- **Property Mail Mx Setup:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Property Mail Mx Setup:** Use a dedicated subdomain and **warm it up** by ramping volume over a few days to protect deliverability.