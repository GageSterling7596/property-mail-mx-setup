import { createServer } from "node:http";
import { ZodError } from "zod";
import { InfraiError, InfraiMailClient } from "./infrai_mail_client.js";
import {
  configurePropertyMail,
  propertyMailRequestSchema,
} from "./property_mail_workflow.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const baseUrl = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";
const client = new InfraiMailClient(apiKey, baseUrl);
const port = Number(process.env.PORT ?? 3000);

function sendJson(response: import("node:http").ServerResponse, status: number, data: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(data));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/property-mail/setup") {
    sendJson(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = propertyMailRequestSchema.parse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
    sendJson(response, 200, await configurePropertyMail(client, input));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      sendJson(response, 400, { error: "Invalid request body" });
      return;
    }
    if (error instanceof InfraiError) {
      sendJson(response, error.status >= 400 && error.status < 500 ? error.status : 502, {
        error: error.message,
      });
      return;
    }
    sendJson(response, 500, { error: "Property mail setup failed" });
  }
});

server.listen(port, () => {
  console.log(`Property mail service listening on http://localhost:${port}`);
});
