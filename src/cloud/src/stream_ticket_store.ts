import { randomBytes } from "node:crypto";

export interface StreamTicket {
  ticket: string;
  sessionId: string;
  expiresAt: number;
}

export class StreamTicketStore {
  private readonly tickets = new Map<string, StreamTicket>();

  constructor(
    private readonly ttlMilliseconds = 60000,
    private readonly now: () => number = Date.now
  ) {}

  issue(sessionId: string): StreamTicket {
    this.removeExpired();
    const ticket: StreamTicket = {
      ticket: randomBytes(32).toString("base64url"),
      sessionId,
      expiresAt: this.now() + this.ttlMilliseconds
    };
    this.tickets.set(ticket.ticket, ticket);
    return { ...ticket };
  }

  consume(ticketValue: string, sessionId: string): boolean {
    this.removeExpired();
    const ticket = this.tickets.get(ticketValue);

    if (!ticket || ticket.sessionId !== sessionId) {
      return false;
    }

    this.tickets.delete(ticketValue);
    return ticket.expiresAt > this.now();
  }

  private removeExpired(): void {
    const now = this.now();
    for (const [ticketValue, ticket] of this.tickets) {
      if (ticket.expiresAt <= now) {
        this.tickets.delete(ticketValue);
      }
    }
  }
}
