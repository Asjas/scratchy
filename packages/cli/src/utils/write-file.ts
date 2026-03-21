import { consola } from "consola";
import { mkdir, writeFile as nodeWriteFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Writes `content` to `filePath`, creating any missing parent directories.
 * Logs the created file path to the console on success.
 */
export async function writeFile(
  filePath: string,
  content: string,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await nodeWriteFile(filePath, content, "utf8");
  consola.success(`Created ${filePath}`);
}
