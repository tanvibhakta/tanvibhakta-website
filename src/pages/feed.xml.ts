import type { APIRoute } from "astro";
import { generateMainFeed } from "../config/feeds";

export const GET: APIRoute = async () => {
  return await generateMainFeed();
};
