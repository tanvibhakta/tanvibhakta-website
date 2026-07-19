import type { APIRoute, GetStaticPaths } from "astro";
import {
  generateCollectionFeed,
  getEligibleCollections,
  type FeedCollectionName,
} from "../../utils/feeds";

export const getStaticPaths: GetStaticPaths = () => {
  const collectionNames = getEligibleCollections();

  return collectionNames.map((collection) => ({
    params: { collection },
  }));
};

export const GET: APIRoute = async ({ params }) => {
  const { collection } = params;

  // Guard with feed eligibility (not mere collection existence) so the
  // FeedCollectionName cast below holds even if this route ever runs
  // outside the statically generated paths.
  if (
    !collection ||
    !(getEligibleCollections() as string[]).includes(collection)
  ) {
    return new Response("Collection not found", { status: 404 });
  }

  return await generateCollectionFeed(collection as FeedCollectionName);
};
