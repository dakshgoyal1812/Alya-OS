import { rmSync } from "fs";
import { join } from "path";

const dir = join(process.cwd(), "data", "whatsapp-auth");
const cacheDir = join(process.cwd(), ".wwebjs_cache");

try {
  rmSync(dir, { recursive: true, force: true });
  console.log("Deleted data/whatsapp-auth successfully.");
} catch (e) {
  console.log("Could not delete data/whatsapp-auth:", e.message);
}

try {
  rmSync(cacheDir, { recursive: true, force: true });
  console.log("Deleted .wwebjs_cache successfully.");
} catch (e) {
  console.log("Could not delete .wwebjs_cache:", e.message);
}
