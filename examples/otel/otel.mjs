// OpenTelemetry for `easy-cms serve` (or any Node server): load it before the app.
//   node --import ./otel.mjs node_modules/easy-cms/bin/easy-cms.js serve
// Needs: npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/sdk-metrics
//   @opentelemetry/exporter-trace-otlp-http @opentelemetry/exporter-metrics-otlp-http
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { NodeSDK } from '@opentelemetry/sdk-node'

// OTEL_EXPORTER_OTLP_ENDPOINT (default http://localhost:4318) says where the collector is.
const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME ?? 'easy-cms',
  traceExporter: new OTLPTraceExporter(),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter(),
    exportIntervalMillis: 15_000,
  }),
})
sdk.start()
process.on('SIGTERM', () => sdk.shutdown().finally(() => process.exit(0)))
