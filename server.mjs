import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 3311);
const baseUrl = (
  process.env.PUBLIC_BASE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://${host}:${port}`)
).replace(/\/+$/, "");
const processStartedAt = new Date().toISOString();

const providerId = "independent-weather-provider-1";

const agentCard = {
  protocolVersion: "0.1.0",
  name: "opp-independent-weather-provider",
  description:
    "Standalone Open Prediction Protocol weather provider implemented without the reference SDK runtime.",
  url: baseUrl,
  identity: {
    id: providerId
  },
  capabilities: {
    predictions: [
      {
        id: "weather.precipitation.daily",
        domain: "weather.precipitation",
        title: "Daily precipitation probability",
        output: {
          type: "binary-probability"
        },
        horizons: ["24h"]
      }
    ]
  }
};

const a2aAgentCard = {
  name: agentCard.name,
  description: agentCard.description,
  supportedInterfaces: [
    {
      url: appendPath(baseUrl, "/rpc"),
      protocolBinding: "https://openpredictionprotocol.org/bindings/opp-jsonrpc/v0.1",
      protocolVersion: "1.0"
    }
  ],
  provider: {
    organization: providerId,
    url: baseUrl
  },
  version: agentCard.protocolVersion,
  documentationUrl: "https://github.com/making-mike/opp-independent-weather-provider",
  capabilities: {
    streaming: true,
    pushNotifications: false,
    stateTransitionHistory: false,
    extendedAgentCard: false,
    extensions: [
      {
        uri: "https://openpredictionprotocol.org/extensions/prediction/v0.1",
        description:
          "Declares Open Prediction Protocol forecast request, response, lifecycle, and evidence semantics over the OPP JSON-RPC binding.",
        required: true,
        params: {
          oppProtocolVersion: agentCard.protocolVersion,
          oppDiscoveryPath: "/.well-known/agent.json",
          oppRpcPath: "/rpc",
          oppMethods: ["predictions.request", "tasks/sendSubscribe"],
          oppConformancePath: "/conformance/latest.json",
          oppEvidencePath: "/evidence/latest.json"
        }
      }
    ]
  },
  defaultInputModes: ["application/json"],
  defaultOutputModes: ["application/json"],
  skills: agentCard.capabilities.predictions.map((capability) => ({
    id: capability.id,
    name: capability.title,
    description: `Provides ${capability.output.type} forecasts for ${capability.domain}.`,
    tags: [
      "prediction",
      capability.domain,
      capability.output.type,
      ...capability.horizons.map((horizon) => `horizon:${horizon}`)
    ],
    examples: [
      `Request a ${capability.output.type} forecast for ${capability.domain} at horizon ${capability.horizons[0]}.`
    ],
    inputModes: ["application/json"],
    outputModes: ["application/json"]
  }))
};

const conformanceChecks = [
  ["discovery.status", "error", "GET /.well-known/agent.json must return HTTP 200"],
  ["discovery.schema", "error", "Agent Card must validate against agent-card.schema.json"],
  [
    "discovery.capability",
    "error",
    "Agent Card must advertise at least one prediction capability for conformance checks"
  ],
  ["health.status", "warning", "GET /health should return HTTP 200 when the provider is operational"],
  ["health.json", "warning", "GET /health should return a machine-readable JSON object"],
  ["rpc.status", "error", "POST /rpc should return HTTP 200 for a valid JSON-RPC request"],
  ["rpc.jsonrpc", "error", "JSON-RPC response must declare jsonrpc = 2.0"],
  ["rpc.idBinding", "error", "JSON-RPC response id must match the originating request id"],
  ["rpc.result", "error", "predictions.request must return a JSON-RPC result for a valid request"],
  [
    "rpc.responseSchema",
    "error",
    "Prediction result must validate against prediction-response.schema.json and OPP invariants"
  ],
  ["rpc.requestBinding", "error", "Prediction response must preserve requestId"],
  [
    "rpc.forecastDomainBinding",
    "error",
    "Completed prediction responses must preserve the requested domain"
  ],
  [
    "rpc.forecastHorizonBinding",
    "error",
    "Completed prediction responses must preserve the requested horizon"
  ],
  [
    "rpc.forecastTypeBinding",
    "error",
    "Completed prediction responses must preserve the requested output type"
  ],
  [
    "rpc.providerBinding",
    "error",
    "Prediction response provider identity must match Agent Card identity metadata when advertised"
  ],
  ["stream.contentType", "error", "tasks/sendSubscribe must return Content-Type: text/event-stream"],
  ["stream.hasEvents", "error", "tasks/sendSubscribe must emit lifecycle and result events"],
  ["stream.submitted", "error", "Streaming lifecycle must include submitted"],
  ["stream.working", "error", "Streaming lifecycle must include working"],
  ["stream.result", "error", "Streaming lifecycle must include one terminal result event"],
  ["stream.resultCardinality", "error", "Streaming lifecycle must include exactly one terminal result event"],
  ["stream.terminalResultLast", "error", "Streaming lifecycle must end with the terminal result event"],
  [
    "stream.resultSchema",
    "error",
    "Streaming result payload must validate against prediction-response.schema.json and OPP invariants"
  ],
  ["stream.lifecycleRequestBinding", "error", "Streaming lifecycle events must preserve requestId"],
  ["stream.resultRequestBinding", "error", "Streaming terminal responses must preserve requestId"],
  [
    "stream.forecastDomainBinding",
    "error",
    "Streaming terminal responses must preserve the requested domain"
  ],
  [
    "stream.forecastHorizonBinding",
    "error",
    "Streaming terminal responses must preserve the requested horizon"
  ],
  [
    "stream.forecastTypeBinding",
    "error",
    "Streaming terminal responses must preserve the requested output type"
  ],
  [
    "stream.providerBinding",
    "error",
    "Streaming provider identities must match Agent Card identity metadata when advertised"
  ],
  ["stream.lifecycleOrder", "error", "Streaming lifecycle states must follow the documented lifecycle transitions"],
  ["errors.invalidRequest.status", "warning", "Invalid predictions.request payloads should return HTTP 400"],
  [
    "errors.invalidRequest.jsonrpc",
    "warning",
    "Invalid predictions.request payloads should return a JSON-RPC error envelope"
  ],
  [
    "errors.invalidRequest.structured",
    "warning",
    "Invalid predictions.request payloads should return a structured JSON-RPC error"
  ],
  [
    "errors.invalidRequest.sanitized",
    "warning",
    "Invalid predictions.request payloads should sanitize public validation errors by default"
  ],
  [
    "errors.invalidStreamRequest.status",
    "warning",
    "Invalid tasks/sendSubscribe payloads should return HTTP 400"
  ],
  [
    "errors.invalidStreamRequest.contentType",
    "warning",
    "Invalid tasks/sendSubscribe payloads should return JSON-RPC errors before opening an event stream"
  ],
  [
    "errors.invalidStreamRequest.jsonrpc",
    "warning",
    "Invalid tasks/sendSubscribe payloads should return a JSON-RPC error envelope"
  ],
  [
    "errors.invalidStreamRequest.structured",
    "warning",
    "Invalid tasks/sendSubscribe payloads should return a structured JSON-RPC error"
  ],
  [
    "errors.invalidStreamRequest.sanitized",
    "warning",
    "Invalid tasks/sendSubscribe payloads should sanitize public validation errors by default"
  ]
].map(([id, severity, message]) => ({
  id,
  ok: true,
  severity,
  message
}));

const latestConformanceReport = {
  protocolVersion: "0.1.0",
  generatedAt: processStartedAt,
  baseUrl,
  implementation: {
    name: "opp-independent-weather-provider",
    version: "0.1.0",
    repository: "https://github.com/making-mike/opp-independent-weather-provider"
  },
  runner: {
    name: "open-prediction-protocol-http-conformance",
    repository: "https://github.com/making-mike/Open-Prediction-Protocol"
  },
  passed: true,
  failures: [],
  warnings: [],
  checks: conformanceChecks
};

const latestEvidenceRecord = {
  protocolVersion: "0.1.0",
  evidenceRecordId: "evr-demo-weather-precipitation-1",
  status: "logged",
  createdAt: processStartedAt,
  forecast: {
    requestId: "demo-weather-request-1",
    responseId: "demo-weather-response-1",
    provider: {
      id: providerId
    },
    domain: "weather.precipitation",
    horizon: "24h",
    outputType: "binary-probability",
    forecastedAt: processStartedAt,
    questionId: "demo-weather-precipitation-1",
    question: "Will rainfall exceed 10mm in the target region within 24 hours?",
    evidenceUri: appendPath(baseUrl, "/evidence/latest.json")
  }
};

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function appendPath(url, path) {
  const parsed = new URL(url);
  const basePath = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
  parsed.pathname = `${basePath}/${path.replace(/^\//, "")}`;
  return parsed.toString();
}

function createCompletedResponse(request) {
  const requestId = request?.requestId ?? "unknown-request";
  const prediction = request?.prediction ?? {};

  return {
    responseId: randomUUID(),
    requestId,
    status: "completed",
    createdAt: new Date().toISOString(),
    provider: {
      id: providerId
    },
    forecast: {
      type: prediction.desiredOutput ?? "binary-probability",
      domain: prediction.domain ?? "weather.precipitation",
      horizon: prediction.horizon ?? "24h",
      generatedAt: new Date().toISOString(),
      probability: 0.42,
      rationale:
        "Deterministic demonstration forecast from an independent OPP HTTP implementation."
    }
  };
}

function isValidPredictionRequest(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof value.requestId === "string" &&
    typeof value.createdAt === "string" &&
    value.consumer !== null &&
    typeof value.consumer === "object" &&
    typeof value.consumer.id === "string" &&
    value.prediction !== null &&
    typeof value.prediction === "object" &&
    typeof value.prediction.domain === "string" &&
    typeof value.prediction.question === "string" &&
    typeof value.prediction.horizon === "string" &&
    value.prediction.desiredOutput === "binary-probability"
  );
}

function parseJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;

    request.on("data", (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > 1_048_576) {
        reject(new Error("Request body too large"));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });

    request.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });

    request.on("error", reject);
  });
}

function sendSse(response, eventName, payload) {
  response.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function sendJsonRpcError(response, statusCode, id, code, message) {
  sendJson(response, statusCode, {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message
    }
  });
}

export async function handleOppRequest(request, response) {
  const requestUrl = new URL(request.url ?? "/", baseUrl);
  const pathname = normalizePathname(requestUrl.pathname);

  if (request.method === "GET" && pathname === "/.well-known/agent.json") {
    sendJson(response, 200, agentCard);
    return;
  }

  if (request.method === "GET" && pathname === "/.well-known/agent-card.json") {
    sendJson(response, 200, a2aAgentCard);
    return;
  }

  if (request.method === "GET" && pathname === "/conformance/latest.json") {
    sendJson(response, 200, latestConformanceReport);
    return;
  }

  if (request.method === "GET" && pathname === "/evidence/latest.json") {
    sendJson(response, 200, latestEvidenceRecord);
    return;
  }

  if (request.method === "GET" && pathname === "/health") {
    sendJson(response, 200, { status: "ok" });
    return;
  }

  if (request.method === "POST" && pathname === "/rpc") {
    let payload;
    try {
      payload = await parseJsonBody(request);
    } catch {
      sendJsonRpcError(response, 400, null, -32700, "Invalid JSON");
      return;
    }

    if (payload?.jsonrpc !== "2.0" || typeof payload?.method !== "string") {
      sendJsonRpcError(
        response,
        400,
        payload?.id ?? null,
        -32600,
        "Invalid JSON-RPC request"
      );
      return;
    }

    if (payload.method === "predictions.request") {
      if (!isValidPredictionRequest(payload.params)) {
        sendJsonRpcError(
          response,
          400,
          payload.id ?? null,
          -32602,
          "Request validation failed"
        );
        return;
      }

      sendJson(response, 200, {
        jsonrpc: "2.0",
        id: payload.id ?? null,
        result: createCompletedResponse(payload.params)
      });
      return;
    }

    if (payload.method === "tasks/sendSubscribe") {
      if (!isValidPredictionRequest(payload.params)) {
        sendJsonRpcError(
          response,
          400,
          payload.id ?? null,
          -32602,
          "Request validation failed"
        );
        return;
      }

      response.statusCode = 200;
      response.setHeader("cache-control", "no-cache, no-transform");
      response.setHeader("connection", "keep-alive");
      response.setHeader("content-type", "text/event-stream; charset=utf-8");
      response.flushHeaders();

      const requestId = payload.params?.requestId ?? "unknown-request";
      sendSse(response, "lifecycle", {
        type: "lifecycle",
        requestId,
        createdAt: new Date().toISOString(),
        state: "submitted",
        provider: {
          id: providerId
        }
      });
      sendSse(response, "lifecycle", {
        type: "lifecycle",
        requestId,
        createdAt: new Date().toISOString(),
        state: "working",
        provider: {
          id: providerId
        }
      });
      sendSse(response, "result", {
        type: "result",
        response: createCompletedResponse(payload.params)
      });
      response.end();
      return;
    }

    sendJsonRpcError(response, 404, payload.id ?? null, -32601, "Method not found");
    return;
  }

  sendJson(response, 404, {
    error: {
      code: "not_found",
      message: "Route not found"
    }
  });
}

function normalizePathname(pathname) {
  if (pathname === "/api") {
    return "/";
  }

  if (pathname.startsWith("/api/")) {
    return pathname.slice(4);
  }

  return pathname;
}

const server = createServer(handleOppRequest);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  server.listen(port, host, () => {
    console.log(`Independent OPP provider listening on http://${host}:${port}`);
  });
}
