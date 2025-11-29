import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to parse frontmatter from markdown
function parseFrontmatter(content) {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const frontmatterLines = match[1].split("\n");
  const frontmatter = {};

  frontmatterLines.forEach((line) => {
    const colonIndex = line.indexOf(":");
    if (colonIndex > -1) {
      const key = line.substring(0, colonIndex).trim();
      let value = line.substring(colonIndex + 1).trim();

      // Remove quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      frontmatter[key] = value;
    }
  });

  return { frontmatter, body: match[2].trim() };
}

// Function to generate a unique ID for posts
function generateId() {
  return crypto.randomBytes(12).toString("hex");
}

// Function to create a slug from title
function createSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Function to get all markdown files recursively
function getAllMarkdownFiles(dir) {
  const files = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);

    if (item.isDirectory()) {
      files.push(...getAllMarkdownFiles(fullPath));
    } else if (item.isFile() && path.extname(item.name) === ".md") {
      files.push(fullPath);
    }
  }

  return files;
}

// Main function to generate Ghost JSON
function generateGhostJson() {
  const postsDir = path.join(__dirname, "posts");
  const markdownFiles = getAllMarkdownFiles(postsDir);

  console.log(`Found ${markdownFiles.length} markdown files to process`);

  const posts = [];
  const tags = new Map();
  const posts_tags = [];

  markdownFiles.forEach((filePath, index) => {
    const content = fs.readFileSync(filePath, "utf-8");
    const { frontmatter, body } = parseFrontmatter(content);

    // Determine category based on directory
    const relativePath = path.relative(postsDir, filePath);
    const category = relativePath.split(path.sep)[0];

    // Create post object
    const postId = generateId();
    const post = {
      id: postId,
      title: frontmatter.title || path.basename(filePath, ".md"),
      slug: createSlug(frontmatter.title || path.basename(filePath, ".md")),
      mobiledoc: JSON.stringify({
        version: "0.3.1",
        markups: [],
        atoms: [],
        cards: [["markdown", { cardName: "markdown", markdown: body }]],
        sections: [[10, 0]],
      }),
      html: "", // Ghost will generate this from mobiledoc
      comment_id: postId,
      plaintext: body.replace(/[#*_\[\]()]/g, "").substring(0, 500),
      feature_image: null,
      featured: 0,
      type: "post",
      status: "published",
      locale: null,
      visibility: "public",
      email_recipient_filter: "none",
      created_at: frontmatter.publishedOn
        ? new Date(frontmatter.publishedOn).toISOString()
        : new Date().toISOString(),
      updated_at: frontmatter.lastUpdatedOn
        ? new Date(frontmatter.lastUpdatedOn).toISOString()
        : frontmatter.publishedOn
          ? new Date(frontmatter.publishedOn).toISOString()
          : new Date().toISOString(),
      published_at: frontmatter.publishedOn
        ? new Date(frontmatter.publishedOn).toISOString()
        : new Date().toISOString(),
      custom_excerpt: null,
      codeinjection_head: null,
      codeinjection_foot: null,
      custom_template: null,
      canonical_url: null,
    };

    posts.push(post);

    // Add category as tag
    if (!tags.has(category)) {
      tags.set(category, {
        id: generateId(),
        name:
          category.charAt(0).toUpperCase() +
          category.slice(1).replace("-", " "),
        slug: category,
        description: `Posts from ${category}`,
        feature_image: null,
        parent_id: null,
        visibility: "public",
        og_image: null,
        og_title: null,
        og_description: null,
        twitter_image: null,
        twitter_title: null,
        twitter_description: null,
        meta_title: null,
        meta_description: null,
        codeinjection_head: null,
        codeinjection_foot: null,
        canonical_url: null,
        accent_color: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    // Link post to tag
    posts_tags.push({
      id: generateId(),
      post_id: postId,
      tag_id: tags.get(category).id,
      sort_order: 0,
    });

    console.log(
      `Processed ${index + 1}/${markdownFiles.length}: ${frontmatter.title || path.basename(filePath)}`,
    );
  });

  // Create the Ghost export structure
  const ghostExport = {
    meta: {
      exported_on: Date.now(),
      version: "5.0.0",
    },
    data: {
      posts: posts,
      users: [
        {
          id: "1",
          name: "Tanvi Bhakta",
          slug: "tanvi",
          email: "tanvi@example.com",
          profile_image: null,
          cover_image: null,
          bio: null,
          website: "https://tanvibhakta.in",
          location: null,
          facebook: null,
          twitter: null,
          accessibility: null,
          status: "active",
          locale: null,
          visibility: "public",
          meta_title: null,
          meta_description: null,
          tour: null,
          last_seen: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      tags: Array.from(tags.values()),
      posts_authors: posts.map((post) => ({
        id: generateId(),
        post_id: post.id,
        author_id: "1",
        sort_order: 0,
      })),
      posts_tags: posts_tags,
    },
  };

  return ghostExport;
}

// Generate and save the JSON file
try {
  const ghostJson = generateGhostJson();
  const outputPath = path.join(__dirname, "ghost-import.json");

  fs.writeFileSync(outputPath, JSON.stringify(ghostJson, null, 2));

  console.log("\n✓ Ghost import file generated successfully!");
  console.log(`  Output: ${outputPath}`);
  console.log(`  Total posts: ${ghostJson.data.posts.length}`);
  console.log(`  Total tags: ${ghostJson.data.tags.length}`);
  console.log("\nYou can now import this file into your Ghost website.");
} catch (error) {
  console.error("Error generating Ghost import file:", error);
  process.exit(1);
}
