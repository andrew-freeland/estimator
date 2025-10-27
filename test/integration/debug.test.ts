import fetch from "node-fetch";

(async () => {
  const base = process.env.TEST_BASE_URL || "http://localhost:3000";
  try {
    const res = await fetch(`${base}/api/debug`);
    const json = await res.json();
    if (res.status !== 200 || json?.status !== "ok") {
      console.error("DEBUG endpoint failed:", res.status, json);
      process.exit(1);
    }
    console.log("DEBUG endpoint ok");
    console.log("Environment summary:", json.env);
    console.log("Storage check:", json.storage);
    process.exit(0);
  } catch (error) {
    console.error("DEBUG endpoint test failed:", error);
    process.exit(1);
  }
})();
