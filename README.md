# Independent OPP Weather Provider

Standalone Open Prediction Protocol provider implemented without the OPP reference SDK runtime.

This repository exists as an interoperability proof target for OPP `v0.1.0`.

## Endpoints

- `GET /.well-known/agent.json`
- `GET /.well-known/agent-card.json`
- `GET /health`
- `POST /rpc` with `predictions.request`
- `POST /rpc` with `tasks/sendSubscribe`
- `GET /conformance/latest.json`
- `GET /evidence/latest.json`

## Run

```bash
npm start
```

The provider listens on `http://127.0.0.1:3311` by default.

You can override host and port:

```bash
HOST=0.0.0.0 PORT=3311 npm start
```

For hosted deployments, set the public URL advertised in discovery and evidence
metadata:

```bash
PUBLIC_BASE_URL=https://provider.example.com npm start
```

## Conformance

The GitHub Actions workflow starts this provider and runs the upstream OPP HTTP conformance suite against it.

The provider intentionally uses only built-in Node.js HTTP primitives and does not import `open-prediction-protocol`.
