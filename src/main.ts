import { createApp } from "./create-app.js";

async function bootstrap() {
  try {
    const app = await createApp();

    const port = Number(process.env.PORT ?? 5001);

    await app.listen(port, "0.0.0.0");

    console.log(`Backend running at http://localhost:${port}`);
  } catch (error) {
    console.error("Backend startup failed:", error);
    process.exit(1);
  }
}
bootstrap();
