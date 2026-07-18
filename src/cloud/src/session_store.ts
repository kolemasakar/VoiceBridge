import { randomUUID } from "node:crypto";

export type SessionState =
  | "CREATED"
  | "STARTING"
  | "ACTIVE"
  | "PAUSED"
  | "STOPPING"
  | "COMPLETED"
  | "FAILED";

export interface ProviderPreferences {
  recognition: string | null;
  translation: string | null;
  synthesis: string | null;
}

export interface VoicePreferences {
  voice_id: string | null;
  speaking_rate: number | null;
}

export interface CreateSessionInput {
  source_language: "en";
  target_language: "uk";
  runtime_mode: "YOUTUBE_MVP";
  input_type: "BROWSER_AUDIO";
  output_type: "BROWSER_PLAYBACK";
  provider_preferences: ProviderPreferences;
  voice: VoicePreferences;
}

export interface Session {
  session_id: string;
  state: SessionState;
  source_language: "en";
  target_language: "uk";
  runtime_mode: "YOUTUBE_MVP";
  input_type: "BROWSER_AUDIO";
  output_type: "BROWSER_PLAYBACK";
  provider_preferences: ProviderPreferences;
  voice: VoicePreferences;
  current_pipeline_stage: null;
  error: null;
  created_at: string;
  updated_at: string;
}

const VALID_COMMAND_STATES: Record<
  string,
  { from: SessionState[]; to: SessionState }
> = {
  start: { from: ["CREATED"], to: "ACTIVE" },
  pause: { from: ["ACTIVE"], to: "PAUSED" },
  resume: { from: ["PAUSED"], to: "ACTIVE" },
  stop: {
    from: ["CREATED", "STARTING", "ACTIVE", "PAUSED", "STOPPING"],
    to: "COMPLETED"
  }
};

export class InvalidSessionStateError extends Error {
  constructor(
    public readonly currentState: SessionState,
    public readonly command: string
  ) {
    super(`Command ${command} is invalid for state ${currentState}.`);
  }
}

export class SessionStore {
  private readonly sessions = new Map<string, Session>();

  create(input: CreateSessionInput): Session {
    const now = new Date().toISOString();
    const session: Session = {
      session_id: randomUUID(),
      state: "CREATED",
      source_language: input.source_language,
      target_language: input.target_language,
      runtime_mode: input.runtime_mode,
      input_type: input.input_type,
      output_type: input.output_type,
      provider_preferences: input.provider_preferences,
      voice: input.voice,
      current_pipeline_stage: null,
      error: null,
      created_at: now,
      updated_at: now
    };

    this.sessions.set(session.session_id, session);
    return structuredClone(session);
  }

  get(sessionId: string): Session | undefined {
    const session = this.sessions.get(sessionId);
    return session ? structuredClone(session) : undefined;
  }

  command(sessionId: string, command: string): Session | undefined {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return undefined;
    }

    const transition = VALID_COMMAND_STATES[command];

    if (!transition) {
      throw new Error(`Unknown session command: ${command}`);
    }

    if (session.state === transition.to) {
      return structuredClone(session);
    }

    if (command === "stop" && session.state === "COMPLETED") {
      return structuredClone(session);
    }

    if (!transition.from.includes(session.state)) {
      throw new InvalidSessionStateError(session.state, command);
    }

    session.state = transition.to;
    session.updated_at = new Date().toISOString();
    this.sessions.set(session.session_id, session);
    return structuredClone(session);
  }
}
