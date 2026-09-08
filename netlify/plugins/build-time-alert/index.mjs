// Telegrams the site owner when the build phase runs long — the canary for
// image-processing regressions. Best-effort by design: an alert failure
// must never fail the deploy, so everything is wrapped and onEnd never throws.
const startedAt = { time: null };

export const onPreBuild = () => {
  startedAt.time = Date.now();
};

export const onEnd = async () => {
  try {
    const parsed = Number(process.env.BUILD_TIME_ALERT_SECONDS ?? 120);
    // A garbage env var parses to NaN, and NaN comparisons are always false —
    // which would alert on EVERY build. Fall back to the default instead.
    const threshold = Number.isFinite(parsed) ? parsed : 120;
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_ALLOWED_USER_ID;
    if (!startedAt.time || !token || !chatId) return;
    const elapsed = Math.round((Date.now() - startedAt.time) / 1000);
    if (elapsed <= threshold) return;
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: `⚠️ tanvibhakta.in build took ${elapsed}s (threshold ${threshold}s) — commit ${process.env.COMMIT_REF?.slice(0, 7) ?? "?"}`,
        }),
      },
    );
    if (!response.ok) {
      console.error("build-time-alert: telegram rejected", response.status);
    }
  } catch (error) {
    console.error("build-time-alert failed (non-fatal):", error);
  }
};
