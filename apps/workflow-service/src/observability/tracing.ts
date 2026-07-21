import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

/**
 * Starts the OpenTelemetry SDK. Imported for its side effect at the very top of
 * main.ts so auto-instrumentation patches http/express/pg before Nest loads.
 * No-op unless OTEL_EXPORTER_OTLP_ENDPOINT is set, so unit tests and a bare
 * `make up` are unaffected.
 */
export function startTracing(): void {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return;

  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? "workflow-service",
    }),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
      }),
    ],
  });

  sdk.start();
  process.on("SIGTERM", () => {
    void sdk.shutdown().finally(() => process.exit(0));
  });
}

// Side effect on import: main.ts imports this module first so instrumentation
// is installed before http/express/pg are loaded.
startTracing();
