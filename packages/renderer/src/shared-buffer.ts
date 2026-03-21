/**
 * Status constants for SharedArrayBuffer communication between
 * the main thread and worker threads.
 */
export const BufferStatus = {
  /** Buffer is idle / no data has been written yet. */
  IDLE: 0,
  /** Producer has written data and notified the consumer. */
  DATA_READY: 1,
  /** Consumer has read and acknowledged the data. */
  CONSUMED: 2,
  /** An error occurred during processing. */
  ERROR: 3,
} as const;

export type BufferStatus = (typeof BufferStatus)[keyof typeof BufferStatus];

/**
 * Header occupies 8 bytes:
 *   - bytes 0–3  → Int32 status flag (BufferStatus)
 *   - bytes 4–7  → Int32 data length in bytes
 */
const HEADER_SIZE = 8;

/**
 * The structured representation of a shared buffer with typed views
 * over the status, data-length, and payload regions.
 */
export interface SharedBuffer {
  /** The underlying SharedArrayBuffer. */
  buffer: SharedArrayBuffer;
  /** Int32 view over the status field (index 0). */
  status: Int32Array;
  /** Int32 view over the data-length field (index 0). */
  dataLength: Int32Array;
  /** Uint8 view over the payload region. */
  data: Uint8Array;
}

/**
 * Allocates a SharedArrayBuffer with a fixed header region and a
 * data payload region of the specified size.
 *
 * @param dataSize — Number of bytes available for the payload.
 */
export function createSharedBuffer(dataSize: number): SharedBuffer {
  if (dataSize <= 0) {
    throw new RangeError("dataSize must be greater than 0");
  }

  const buffer = new SharedArrayBuffer(HEADER_SIZE + dataSize);

  return {
    buffer,
    status: new Int32Array(buffer, 0, 1),
    dataLength: new Int32Array(buffer, 4, 1),
    data: new Uint8Array(buffer, HEADER_SIZE, dataSize),
  };
}

/**
 * Encodes `payload` as JSON, writes it into the shared buffer's
 * data region, sets the data-length header, transitions the status
 * to `DATA_READY`, and notifies any waiting consumer.
 *
 * @throws {Error} if the buffer still holds unread data (`DATA_READY` status).
 * @throws {RangeError} if the encoded payload exceeds the buffer's data capacity.
 */
export function writeToBuffer(shared: SharedBuffer, payload: unknown): void {
  const previousStatus = Atomics.compareExchange(
    shared.status,
    0,
    BufferStatus.IDLE,
    BufferStatus.IDLE,
  );

  if (previousStatus === BufferStatus.DATA_READY) {
    throw new Error(
      "Cannot write to shared buffer: previous payload has not been consumed",
    );
  }

  const encoder = new TextEncoder();
  const encoded = encoder.encode(JSON.stringify(payload));

  if (encoded.byteLength > shared.data.byteLength) {
    throw new RangeError(
      `Payload size (${encoded.byteLength} bytes) exceeds buffer capacity (${shared.data.byteLength} bytes)`,
    );
  }

  shared.data.set(encoded);
  Atomics.store(shared.dataLength, 0, encoded.byteLength);
  Atomics.store(shared.status, 0, BufferStatus.DATA_READY);
  Atomics.notify(shared.status, 0);
}

/**
 * Waits for the producer to signal `DATA_READY`, reads and decodes
 * the JSON payload, then transitions the status to `CONSUMED`.
 *
 * @param shared    — The shared buffer to read from.
 * @param timeoutMs — Maximum time in milliseconds to wait for data
 *                    (default: 5 000 ms).
 * @returns The decoded payload.
 * @throws on timeout or if the buffer is in an error state.
 */
export function readFromBuffer<T = unknown>(
  shared: SharedBuffer,
  timeoutMs = 5_000,
): T {
  const currentStatus = Atomics.load(shared.status, 0);

  if (currentStatus === BufferStatus.ERROR) {
    throw new Error("SharedBuffer is in an error state");
  }

  // Wait only when data is not yet ready
  if (currentStatus !== BufferStatus.DATA_READY) {
    const result = Atomics.wait(shared.status, 0, currentStatus, timeoutMs);

    if (result === "timed-out") {
      throw new Error(
        `Timed out after ${timeoutMs}ms waiting for shared buffer data`,
      );
    }

    // Re-check after waking up
    const newStatus = Atomics.load(shared.status, 0);
    if (newStatus === BufferStatus.ERROR) {
      throw new Error("SharedBuffer is in an error state");
    }
    if (newStatus !== BufferStatus.DATA_READY) {
      throw new Error(
        `Unexpected buffer status after wait: ${String(newStatus)}`,
      );
    }
  }

  const length = Atomics.load(shared.dataLength, 0);

  if (length < 0 || length > shared.data.byteLength) {
    Atomics.store(shared.status, 0, BufferStatus.ERROR);
    Atomics.notify(shared.status, 0);
    throw new RangeError(
      `Invalid data length in shared buffer header: ${length}. Expected 0 <= length <= ${shared.data.byteLength}.`,
    );
  }
  const decoder = new TextDecoder();
  const json = decoder.decode(shared.data.subarray(0, length));
  const payload = JSON.parse(json) as T;

  Atomics.store(shared.status, 0, BufferStatus.CONSUMED);
  Atomics.notify(shared.status, 0);

  return payload;
}
