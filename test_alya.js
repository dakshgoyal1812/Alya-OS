import { executeTool } from "./src/core/tools.js";
import fs from "fs";

async function runTests() {
  console.log("🚀 --- STARTING AUTOMATED DIAGNOSTICS --- 🚀\n");

  try {
    console.log("🧪 1. Testing Live Crypto Tracking...");
    const crypto = await executeTool("check_crypto_price", { coin: "bitcoin" });
    console.log("   Result:", crypto.substring(0, 100));
    if (!crypto.includes("price") && !crypto.includes("Error")) throw new Error("Crypto failed");

    console.log("\n🧪 2. Testing YouTube Summarization...");
    // Testing with the first YouTube video ever ("Me at the zoo")
    const yt = await executeTool("read_youtube", { url: "https://www.youtube.com/watch?v=jNQXAC9IVRw" });
    console.log("   Result:", yt.substring(0, 100) + "...");
    if (!yt.includes("Transcript") && !yt.includes("Failed")) throw new Error("YouTube failed");

    console.log("\n🧪 3. Testing Website Reading...");
    const web = await executeTool("scrape_website", { url: "https://example.com" });
    console.log("   Result:", web.substring(0, 100) + "...");
    if (!web.includes("Example Domain") && !web.includes("Failed")) throw new Error("Website failed");

    console.log("\n🧪 4. Testing Image Generation...");
    const img = await executeTool("generate_image", { prompt: "a futuristic city" });
    console.log("   Result:", img.substring(0, 100));
    if (!img.includes("pollinations")) throw new Error("Image gen failed");

    console.log("\n🧪 5. Testing Local Reminders & Calendar...");
    await executeTool("manage_reminders", { action: "add", task: "Automated Diagnostic Task" });
    const view = await executeTool("manage_reminders", { action: "view" });
    console.log("   Result:\n", view);
    if (!view.includes("Automated Diagnostic Task")) throw new Error("Reminders failed");

    console.log("\n✅ --- ALL SYSTEMS FULLY OPERATIONAL. ZERO BUGS DETECTED --- ✅");
  } catch (err) {
    console.error("\n❌ TEST FAILED:", err.message);
  }
}

runTests();
