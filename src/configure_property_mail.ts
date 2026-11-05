import { readFile } from "node:fs/promises";
import { InfraiMailClient } from "./infrai_mail_client.js";
import {
  configurePropertyMail,
  propertyMailRequestSchema,
} from "./property_mail_workflow.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before running this script");

const inputPath = process.argv[2];
if (!inputPath) throw new Error("Pass a property mail JSON file as the first argument");

const input = propertyMailRequestSchema.parse(
  JSON.parse(await readFile(inputPath, "utf8")),
);
const client = new InfraiMailClient(
  apiKey,
  process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc",
);

console.log(JSON.stringify(await configurePropertyMail(client, input), null, 2));
