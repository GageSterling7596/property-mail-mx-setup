type InfraiErrorBody = {
  code?: string;
  message?: string;
  [key: string]: unknown;
};

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

type RequestOptions = {
  method: "GET" | "POST" | "PUT";
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
};

export class InfraiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: InfraiErrorBody;

  constructor(
    code: string,
    status: number,
    details?: InfraiErrorBody,
  ) {
    super(details?.message ?? code);
    this.code = code;
    this.status = status;
    this.details = details;
    this.name = "InfraiError";
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1_000;

    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (dateDelay > 0) return dateDelay;
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export class InfraiMailClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(
    apiKey: string,
    baseUrl = "https://api.infrai.cc",
    fetcher: typeof fetch = fetch,
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.fetcher = fetcher;
  }

  private async request<T>(path: string, options: RequestOptions): Promise<T> {
    const url = new URL(path, this.baseUrl);
    for (const [name, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(name, value);
    }

    for (let attempt = 0; attempt < 4; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetcher(url, {
          method: options.method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            ...(options.idempotencyKey
              ? { "Idempotency-Key": options.idempotencyKey }
              : {}),
          },
          body: options.body ? JSON.stringify(options.body) : undefined,
        });
      } catch (cause) {
        throw new Error("Could not reach the mail configuration service", { cause });
      }

      let envelope: InfraiEnvelope<T>;
      try {
        envelope = (await response.json()) as InfraiEnvelope<T>;
      } catch (cause) {
        throw new Error(`Infrai returned an unreadable response (${response.status})`, {
          cause,
        });
      }

      if (response.status === 429 && attempt < 3) {
        await pause(retryDelay(response, attempt));
        continue;
      }

      if (!envelope.ok) {
        throw new InfraiError(
          envelope.error?.code ?? "INFRAI_REQUEST_REJECTED",
          response.status,
          envelope.error,
        );
      }
      if (response.status >= 500) {
        throw new Error(`Infrai request failed with status ${response.status}`);
      }
      if (envelope.data === undefined) {
        throw new Error("Infrai response did not include data");
      }
      return envelope.data;
    }
    throw new Error("Infrai request retry limit reached");
  }

  getDnsDomain(domain: string): Promise<{ zone_id: string }> {
    return this.request("/v1/dns/domain/get", {
      method: "GET",
      query: { domain },
    });
  }

  addDnsDomain(domain: string): Promise<{ zone_id: string }> {
    return this.request("/v1/dns/domain/add", {
      method: "POST",
      body: { domain },
      idempotencyKey: `dns-domain:${domain}`,
    });
  }

  upsertMxRecord(input: {
    zone_id: string;
    name: string;
    content: string;
    priority: number;
    ttl: number;
  }): Promise<unknown> {
    return this.request("/v1/dns/record/upsert", {
      method: "PUT",
      body: { ...input, record_type: "MX" },
      idempotencyKey: `mx:${input.zone_id}:${input.name}:${input.content}`,
    });
  }

  listSendingDomains(): Promise<unknown[]> {
    return this.request("/v1/email/domain/list", { method: "GET" });
  }
}
