import type { APIRoute, GetStaticPaths } from "astro";
import {
  generateCollectionFeed,
  getEligibleCollections,
} from "../../config/feeds";
import { collections } from "../../content.config";

type CollectionName = keyof typeof collections;

export const getStaticPaths: GetStaticPaths = () => {
  const collectionNames = getEligibleCollections();

  return collectionNames.map((collection) => ({
    params: { collection },
  }));
};

export const GET: APIRoute = async ({ params }) => {
  const { collection } = params;

  if (!collection || !(collection in collections)) {
    return new Response("Collection not found", { status: 404 });
  }

  return await generateCollectionFeed(collection as CollectionName);
};
