/**
 * Test-only worker that throws a string (non-Error) to exercise
 * the non-Error catch branch in ssg-pipeline.
 */
export default function handler() {
  throw "string error from worker";
}
