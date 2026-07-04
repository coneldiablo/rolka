import { createBot } from "./bot";

async function main() {
  const bot = createBot();

  await bot.api.deleteWebhook({ drop_pending_updates: true });
  console.log(`Rolka bot polling started at ${new Date().toISOString()}`);

  const stop = () => {
    console.log("Stopping Rolka bot polling...");
    bot.stop();
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  await bot.start({ drop_pending_updates: true });
}

main().catch((error) => {
  console.error("Rolka bot polling failed", error);
  process.exit(1);
});
