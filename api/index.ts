import { createApp } from "../src/create-app.js";

let handler: ((request: any, response: any) => unknown) | undefined;

export default async function api(request: any, response: any) {
  if (!handler) {
    const app = await createApp();
    handler = app.getHttpAdapter().getInstance();
  }

  return handler(request, response);
}
