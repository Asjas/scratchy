/**
 * Header layout inside the SharedArrayBuffer:
 *   - bytes 0–3  → Int32 writePos (monotonically increasing write pointer)
 *   - bytes 4–7  → Int32 readPos  (monotonically increasing read pointer)
 *   - bytes 8–(8+capacity-1) → ring data
 *
 * Design: Single-Producer / Single-Consumer (SPSC) lock-free ring buffer.
 * `writePos` is advanced only by the producer; `readPos` only by the consumer.
 * Both pointers grow monotonically — the actual buffer position is derived via
 * `pointer % capacity`.  This keeps the arithmetic race-free for SPSC access
 * without any CAS loop.
 *
 * Overflow safety: `Atomics.load` returns a signed Int32, so both pointers are
 * treated as unsigned 32-bit integers by applying `>>> 0` after every load.
 * This converts any negative (post-wrap) Int32 value back to the correct uint32
 * representation.  All arithmetic (`wp - rp`, `wp % capacity`) is then
 * performed on unsigned values, keeping the ring correct at pointer wrap-around.
 * Pointer wrap-around occurs after transferring ~4 GB cumulatively, and the
 * ring remains fully correct across that boundary.
 */
const HEADER_SIZE = 8;

/**
 * A lock-free ring buffer built on top of a `SharedArrayBuffer`.
 *
 * Suitable for high-throughput, low-latency data transfer between the main
 * Node.js thread and Worker Threads (e.g., streaming rendered HTML chunks).
 *
 * ### Usage — producer (main thread)
 * ```typescript
 * const ring = new SharedRingBuffer(64 * 1024); // 64 KB
 * const written = ring.write(encoder.encode("chunk"));
 * // Pass ring.getSharedBuffer() to a worker via Piscina
 * ```
 *
 * ### Usage — consumer (worker thread)
 * ```typescript
 * const ring = SharedRingBuffer.fromSharedBuffer(task.sharedBuffer);
 * const chunk = ring.read(4096);
 * ```
 */
export class SharedRingBuffer {
  private buffer: SharedArrayBuffer;
  /** Monotonically increasing write pointer (advanced only by the producer). */
  private writePos: Int32Array;
  /** Monotonically increasing read pointer (advanced only by the consumer). */
  private readPos: Int32Array;
  private data: Uint8Array;

  /** Number of bytes available for data storage. */
  readonly capacity: number;

  /**
   * Creates a new `SharedRingBuffer` backed by a freshly allocated
   * `SharedArrayBuffer` of size `8 + capacity`.
   *
   * @param capacity - Number of data bytes in the ring. Must be > 0.
   * @throws {RangeError} if `capacity` is not a positive integer.
   */
  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError("capacity must be a positive integer");
    }

    this.capacity = capacity;
    this.buffer = new SharedArrayBuffer(HEADER_SIZE + capacity);
    this.writePos = new Int32Array(this.buffer, 0, 1);
    this.readPos = new Int32Array(this.buffer, 4, 1);
    this.data = new Uint8Array(this.buffer, HEADER_SIZE, capacity);
  }

  /**
   * Reconstructs a `SharedRingBuffer` from an existing `SharedArrayBuffer`
   * that was previously created by `new SharedRingBuffer()` or
   * `getSharedBuffer()`.  Useful for worker threads that receive the buffer
   * via a Piscina task payload.
   *
   * @param sab - A `SharedArrayBuffer` whose `byteLength` is at least 9
   *              (8 header bytes + at least 1 data byte).
   * @throws {RangeError} if the buffer is too small.
   */
  static fromSharedBuffer(sab: SharedArrayBuffer): SharedRingBuffer {
    const capacity = sab.byteLength - HEADER_SIZE;

    if (capacity <= 0) {
      throw new RangeError(
        `SharedArrayBuffer is too small to be a valid ring buffer ` +
          `(byteLength=${sab.byteLength}, minimum=${HEADER_SIZE + 1})`,
      );
    }

    // Bypass the constructor so we reuse the existing SAB rather than
    // creating a new one.
    const instance = Object.create(
      SharedRingBuffer.prototype,
    ) as SharedRingBuffer;

    // Using Object.defineProperty to assign the readonly `capacity` field
    // that the constructor normally sets.
    Object.defineProperty(instance, "capacity", {
      value: capacity,
      writable: false,
      enumerable: true,
      configurable: false,
    });

    instance.buffer = sab;
    instance.writePos = new Int32Array(sab, 0, 1);
    instance.readPos = new Int32Array(sab, 4, 1);
    instance.data = new Uint8Array(sab, HEADER_SIZE, capacity);

    return instance;
  }

  // ---------------------------------------------------------------------------
  // Write
  // ---------------------------------------------------------------------------

  /**
   * Writes `chunk` into the ring buffer.
   *
   * The write is atomic with respect to the `writePos` pointer: the pointer
   * is only advanced after all bytes have been copied, so a concurrently
   * reading consumer will never observe a partial write.
   *
   * After a successful write, any agent waiting on `writePos` via
   * `Atomics.wait` is notified (useful for blocking-consumer extensions).
   *
   * @param chunk - The bytes to write.  An empty chunk is a no-op that
   *                always returns `true`.
   * @returns `true` if the data was written, `false` if there is insufficient
   *          space in the ring buffer.
   */
  write(chunk: Uint8Array): boolean {
    if (chunk.byteLength === 0) return true;

    // >>> 0 converts the signed Int32 from Atomics.load to an unsigned uint32.
    const wp = Atomics.load(this.writePos, 0) >>> 0;
    const rp = Atomics.load(this.readPos, 0) >>> 0;
    // (wp - rp) >>> 0 keeps the subtraction unsigned across pointer wrap-around.
    const available = this.capacity - ((wp - rp) >>> 0);

    if (chunk.byteLength > available) return false;

    // wp is now a uint32, so % capacity is always non-negative.
    const offset = wp % this.capacity;
    const spaceToEnd = this.capacity - offset;

    if (chunk.byteLength <= spaceToEnd) {
      // Chunk fits without wrapping around the end of the ring.
      this.data.set(chunk, offset);
    } else {
      // Split the write across the ring boundary.
      this.data.set(chunk.subarray(0, spaceToEnd), offset);
      this.data.set(chunk.subarray(spaceToEnd), 0);
    }

    Atomics.store(this.writePos, 0, wp + chunk.byteLength);
    // Wake any consumer that is blocking on Atomics.wait(writePos, …).
    Atomics.notify(this.writePos, 0);

    return true;
  }

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------

  /**
   * Reads up to `maxBytes` bytes from the ring buffer.
   *
   * The read is atomic with respect to the `readPos` pointer: the pointer is
   * only advanced after all bytes have been copied out.
   *
   * After a successful read, any agent waiting on `readPos` via `Atomics.wait`
   * is notified (useful for blocking-producer extensions).
   *
   * @param maxBytes - Upper bound on the number of bytes to return.
   *                   Must be a positive integer.
   * @returns A `Uint8Array` containing the bytes read, or `null` if the buffer
   *          is empty.
   * @throws {RangeError} if `maxBytes` is not a positive integer.
   */
  read(maxBytes: number): Uint8Array | null {
    if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
      throw new RangeError("maxBytes must be a positive integer");
    }

    // >>> 0 converts the signed Int32 from Atomics.load to an unsigned uint32.
    const wp = Atomics.load(this.writePos, 0) >>> 0;
    const rp = Atomics.load(this.readPos, 0) >>> 0;

    if (wp === rp) return null; // Buffer is empty.

    // (wp - rp) >>> 0 keeps the subtraction unsigned across pointer wrap-around.
    const available = (wp - rp) >>> 0;
    const readSize = Math.min(maxBytes, available);
    // rp is now a uint32, so % capacity is always non-negative.
    const offset = rp % this.capacity;
    const spaceToEnd = this.capacity - offset;

    let chunk: Uint8Array;

    if (readSize <= spaceToEnd) {
      // Read fits without wrapping — return a copy so the caller owns the data.
      chunk = this.data.slice(offset, offset + readSize);
    } else {
      // Split the read across the ring boundary.
      chunk = new Uint8Array(readSize);
      chunk.set(this.data.subarray(offset, offset + spaceToEnd), 0);
      chunk.set(this.data.subarray(0, readSize - spaceToEnd), spaceToEnd);
    }

    Atomics.store(this.readPos, 0, rp + readSize);
    // Wake any producer that is blocking on Atomics.wait(readPos, …).
    Atomics.notify(this.readPos, 0);

    return chunk;
  }

  // ---------------------------------------------------------------------------
  // Introspection helpers
  // ---------------------------------------------------------------------------

  /**
   * Number of bytes currently available to read.
   *
   * This is a snapshot; in a concurrent scenario the value may change
   * immediately after it is read.
   */
  get availableToRead(): number {
    const wp = Atomics.load(this.writePos, 0) >>> 0;
    const rp = Atomics.load(this.readPos, 0) >>> 0;
    return (wp - rp) >>> 0;
  }

  /**
   * Number of bytes that can be written before the ring is full.
   *
   * This is a snapshot; in a concurrent scenario the value may change
   * immediately after it is read.
   */
  get availableToWrite(): number {
    const wp = Atomics.load(this.writePos, 0) >>> 0;
    const rp = Atomics.load(this.readPos, 0) >>> 0;
    return this.capacity - ((wp - rp) >>> 0);
  }

  /**
   * `true` when there are no bytes to read.
   *
   * This is a snapshot value.
   */
  get isEmpty(): boolean {
    return Atomics.load(this.writePos, 0) === Atomics.load(this.readPos, 0);
  }

  /**
   * `true` when the ring is completely full (no space for any additional
   * bytes).
   *
   * This is a snapshot value.
   */
  get isFull(): boolean {
    const wp = Atomics.load(this.writePos, 0) >>> 0;
    const rp = Atomics.load(this.readPos, 0) >>> 0;
    return this.capacity - ((wp - rp) >>> 0) === 0;
  }

  /**
   * Total byte length of the underlying `SharedArrayBuffer`
   * (`HEADER_SIZE + capacity`).
   */
  get byteLength(): number {
    return this.buffer.byteLength;
  }

  /**
   * Returns the underlying `SharedArrayBuffer` so it can be transferred to a
   * Worker Thread via a Piscina task payload.
   */
  getSharedBuffer(): SharedArrayBuffer {
    return this.buffer;
  }
}
