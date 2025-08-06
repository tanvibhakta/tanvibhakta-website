import type { APIRoute } from "astro";
import { generateMainFeed } from "../utils/feeds";

export const GET: APIRoute = async () => {
  return await generateMainFeed();
};
