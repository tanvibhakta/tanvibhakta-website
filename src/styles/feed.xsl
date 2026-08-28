<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>
          <xsl:value-of select="rss/channel/title"/>
        </title>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous"/>
        <link href="https://fonts.googleapis.com/css2?family=Literata:wght@400;700&amp;family=Open+Sans:wght@400;600&amp;display=swap" rel="stylesheet"/>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          body { font-family: "Open Sans", ui-sans-serif, system-ui, sans-serif; }
          h1, h2, h3 { font-family: "Literata", serif; }
          .feed-content { max-width: 65ch; }
          .feed-content img { max-width: 100%; height: auto; }
          .feed-content pre { background: #f5f5f4; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; }
          .feed-content code { font-family: "Monaco", "Courier New", monospace; }
          .text-red-link { color: rgb(168, 42, 18); }
          .text-red-link:hover { color: rgb(127, 29, 29); }
        </style>
      </head>
      <body class="bg-stone-100 text-stone-800">
        <!-- Header -->
        <header class="border-b border-stone-200 bg-stone-50">
          <div class="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
            <h1 class="text-4xl font-bold tracking-tight text-stone-800">
              <xsl:value-of select="rss/channel/title"/>
            </h1>
            <p class="mt-2 text-lg text-stone-700">
              <xsl:value-of select="rss/channel/description"/>
            </p>
          </div>
        </header>

        <!-- Subscribe Section -->
        <section class="bg-stone-50 border-b border-stone-200">
          <div class="max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
            <h2 class="text-sm font-semibold text-stone-800 uppercase tracking-wide">Subscribe</h2>
            <p class="mt-2 text-sm text-stone-600 mb-4">
              Copy this feed URL into your favorite RSS reader to stay updated.
            </p>
            <div class="bg-white p-4 rounded border border-stone-200 font-mono text-sm break-all text-stone-700">
              <xsl:value-of select="rss/channel/link"/>
            </div>
          </div>
        </section>

        <!-- Feed Entries -->
        <main class="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
          <div class="space-y-12">
            <xsl:for-each select="rss/channel/item">
              <article class="border-b border-stone-200 pb-12 last:border-b-0">
                <header class="mb-4">
                  <h3 class="text-2xl font-bold text-stone-800 mb-2">
                    <a href="{link}" class="text-red-link hover:underline">
                      <xsl:value-of select="title"/>
                    </a>
                  </h3>
                  <time class="text-sm text-stone-500">
                    <xsl:value-of select="substring(pubDate, 1, 16)"/>
                  </time>
                </header>
                <div class="feed-content prose prose-sm max-w-none text-stone-700">
                  <xsl:copy-of select="content:encoded/node() | description/node()"/>
                </div>
              </article>
            </xsl:for-each>
          </div>
        </main>

        <!-- Footer -->
        <footer class="bg-stone-50 border-t border-stone-200">
          <div class="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <p class="text-sm text-stone-600">
              <a href="https://tanvibhakta.in" class="text-red-link hover:underline">
                tanvibhakta.in
              </a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
