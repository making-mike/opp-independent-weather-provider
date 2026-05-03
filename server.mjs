import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 3311);

const providerId = "independent-weather-provider-1";

const agentCard = {
  protocolVersion: "0.1.0",
  name: "opp-independent-weather-provider",
  description:
    "Standalone Open Prediction Protocol weather provider implemented without the reference SDK runtime.",
  url: `http://${host}:${port}`,
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

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
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

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/.well-known/agent.json") {
    sendJson(response, 200, agentCard);
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, { status: "ok" });
    return;
  }

  if (request.method === "POST" && request.url === "/rpc") {
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
});

server.listen(port, host, () => {
  console.log(`Independent OPP provider listening on http://${host}:${port}`);
});
