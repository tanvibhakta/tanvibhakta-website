// Telegrams the site owner when the build phase runs long — the canary for
// image-processing regressions. Best-effort by design: an alert failure
// must never fail the deploy, so everything is wrapped and onEnd never throws.
const startedAt = { time: null };

export const onPreBuild = () => {
  startedAt.time = Date.now();
};

export const onEnd = async () => {
  try {
    const threshold = Number(process.env.BUILD_TIME_ALERT_SECONDS ?? 120);
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_ALLOWED_USER_ID;
    if (!startedAt.time || !token || !chatId) return;
    const elapsed = Math.round((Date.now() - startedAt.time) / 1000);
    if (elapsed <= threshold) return;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `⚠️ tanvibhakta.in build took ${elapsed}s (threshold ${threshold}s) — commit ${process.env.COMMIT_REF?.slice(0, 7) ?? "?"}`,
      }),
    });
  } catch (error) {
    console.error("build-time-alert failed (non-fatal):", error);
  }
};
