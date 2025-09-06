# Tanvi's web home

[![Netlify Status](https://api.netlify.com/api/v1/badges/93203410-0cf6-43bd-8527-49e274e0e091/deploy-status)](https://app.netlify.com/sites/tanvibhakta/deploys)

This project uses astro.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 📜 Custom Scripts

### transform-files.cjs

Transforms Mataroa blog export files to Astro-compatible frontmatter format.

**Example:**

```bash
node src/utils/transform-files.cjs posts/weeknotes
```

This script converts Mataroa's markdown format (with title and date in the content) to Astro's YAML frontmatter format. It can be run multiple times safely on the same files.
