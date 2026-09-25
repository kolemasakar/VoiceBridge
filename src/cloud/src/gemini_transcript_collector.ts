/**
 * Read-only client-side collection for an already completed Gemini MEDIA job.
 * The caller must expose the verified original text to the active chat; this
 * module neither invokes start() nor writes a permanent archive.
 */
export interface TranscriptSegment {
  index: number;
  text: string;
  start_ms?: number | null;
  end_ms?: number | null;
}

export interface TranscriptStatus {
  job_id: string;
  status: string;
  segment_count: number;
  transcript_characters: number;
}

export interface TranscriptPage {
  job_id: string;
  status: string;
  cursor: number;
  next_cursor: number | null;
  segments: TranscriptSegment[];
}

export interface CompleteTranscript {
  job_id: string;
  segment_count: number;
  transcript_characters: number;
  text: string;
  segments: TranscriptSegment[];
}

export async function collectCompletedTranscript(
  status: TranscriptStatus,
  readPage: (jobId: string, cursor: number, limit: number) => Promise<TranscriptPage | null>,
  pageSize = 20
): Promise<CompleteTranscript> {
  if (status.status !== "COMPLETED") throw new Error("TRANSCRIPT_NOT_COMPLETED");
  if (!status.job_id || !Number.isSafeInteger(status.segment_count) ||
      status.segment_count < 0 || !Number.isSafeInteger(status.transcript_characters) ||
      status.transcript_characters < 0) throw new Error("INVALID_TRANSCRIPT_METADATA");
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new Error("INVALID_PAGE_SIZE");
  }

  const segments: TranscriptSegment[] = [];
  let cursor = 0;
  do {
    const page = await readPage(status.job_id, cursor, pageSize);
    if (!page || page.job_id !== status.job_id || page.status !== "COMPLETED" ||
        page.cursor !== cursor || !Array.isArray(page.segments) ||
        page.segments.length > pageSize) throw new Error("TRANSCRIPT_PAGE_INVALID");
    if (page.segments.length === 0 && page.next_cursor !== null) {
      throw new Error("TRANSCRIPT_PAGE_EMPTY");
    }
    for (const segment of page.segments) {
      if (!segment || !Number.isSafeInteger(segment.index) ||
          segment.index !== segments.length || typeof segment.text !== "string") {
        throw new Error("TRANSCRIPT_SEGMENT_OUT_OF_ORDER");
      }
      segments.push({ ...segment });
    }
    if (segments.length > status.segment_count) throw new Error("TRANSCRIPT_SEGMENT_OVERFLOW");
    if (page.next_cursor === null) break;
    if (!Number.isSafeInteger(page.next_cursor) ||
        page.next_cursor !== cursor + page.segments.length ||
        page.next_cursor <= cursor) throw new Error("TRANSCRIPT_CURSOR_INVALID");
    cursor = page.next_cursor;
  } while (true);

  if (segments.length !== status.segment_count) throw new Error("TRANSCRIPT_INCOMPLETE");
  // Server counts the original provider transcript_text, not the joined segment text.
  // A mismatch must fail closed rather than invent missing whitespace/punctuation.
  const text = segments.map((segment) => segment.text).join("");
  if (text.length !== status.transcript_characters) {
    throw new Error("TRANSCRIPT_CHARACTER_COUNT_MISMATCH");
  }
  return {
    job_id: status.job_id,
    segment_count: segments.length,
    transcript_characters: text.length,
    text,
    segments
  };
}
