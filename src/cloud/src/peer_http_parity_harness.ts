import { createServer, type Server } from "node:http";
import { FixedWindowRateLimiter } from "./rate_limit.js";
import { newObservationKey, observePeer } from "./peer_observation.js";
import { PeerWindowCoordinator } from "./peer_window_coordinator.js";

/**
 * Research-only HTTP parity harness. NOT the production VoiceBridge server.
 * Diagnostic errors are swallowed, never influencing limiter decisions.
 */
export function createPeerDiagnosticParityHarness(
  diagnosticsEnabled: boolean,
  limit = 2,
  diagnosticHook?: () => void
): { server: Server; diagnosticSummaries: () => number } {
  const limiter = new FixedWindowRateLimiter(limit);
  const key = newObservationKey();
  const coordinator = new PeerWindowCoordinator(Date.now());
  let errors = 0;
  const server = createServer((request, response) => {
    if (request.method === "OPTIONS" ||
        (request.method === "GET" && request.url === "/api/v1/health")) {
      response.writeHead(request.method === "OPTIONS" ? 204 : 200).end();
      return;
    }
    const socketPeer = request.socket.remoteAddress || "unknown";
    // Exactly one limiter decision, regardless of diagnostic state or failure.
    const allowed = limiter.allow(socketPeer);
    if (diagnosticsEnabled) {
      try {
        diagnosticHook?.();
        const forwarded = request.headers["x-forwarded-for"];
        const header = Array.isArray(forwarded) ? forwarded.join(",") : forwarded;
        coordinator.record(observePeer(socketPeer, header, key), allowed, Date.now());
      } catch {
        errors++;
      }
    }
    if (!allowed) {
      response.setHeader("retry-after", "60");
      response.writeHead(429).end("RATE_LIMITED");
      return;
    }
    response.writeHead(200).end("OK");
  });
  return { server, diagnosticSummaries: () => {
    // Error counter is test-only and never exposes raw peer or headers.
    return errors;
  } };
}
