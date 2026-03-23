/**
 * Test-only worker that hangs indefinitely to exercise the timeout
 * branch in ssg-pipeline.
 */
export default function handler() {
  return new Promise(() => {
    // Never resolves — forces a timeout
  });
}
