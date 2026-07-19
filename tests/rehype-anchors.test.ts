import { describe, expect, test } from "vitest";
import { rehypeAnchors } from "../src/plugins/rehype-anchors.mjs";

type HastElement = {
  type: "element";
  tagName: string;
  properties: Record<string, unknown>;
  children: HastNode[];
};
type HastText = { type: "text"; value: string };
type HastNode = HastElement | HastText;

function elem(
  tagName: string,
  properties: Record<string, unknown> = {},
  children: HastNode[] = [],
): HastElement {
  return { type: "element", tagName, properties, children };
}
function text(value: string): HastText {
  return { type: "text", value };
}

function run(
  tree: { type: "root"; children: HastNode[] },
  pluginArgs: {
    options?: Parameters<typeof rehypeAnchors>[0];
    file?: object;
  } = {},
) {
  rehypeAnchors(pluginArgs.options)(tree, pluginArgs.file);
  return tree;
}

function lastChild(el: HastElement): HastElement {
  return el.children.at(-1) as HastElement;
}

describe("rehypeAnchors (paragraphs + list items)", () => {
  test("paragraphs get sequential p-N ids and a trailing # link", () => {
    const tree = {
      type: "root" as const,
      children: [
        elem("p", {}, [text("First.")]),
        elem("p", {}, [text("Second.")]),
      ],
    };
    run(tree);

    const p1 = tree.children[0] as HastElement;
    const p2 = tree.children[1] as HastElement;
    expect(p1.properties.id).toBe("p-1");
    expect(p2.properties.id).toBe("p-2");
    expect(lastChild(p1).properties.href).toBe("#p-1");
  });

  test("tight list items get sequential li-N ids and a trailing # link", () => {
    const tree = {
      type: "root" as const,
      children: [
        elem("ul", {}, [
          elem("li", {}, [text("Apples")]),
          elem("li", {}, [text("Oranges")]),
        ]),
      ],
    };
    run(tree);

    const ul = tree.children[0] as HastElement;
    const [li1, li2] = ul.children as HastElement[];
    expect(li1.properties.id).toBe("li-1");
    expect(li2.properties.id).toBe("li-2");
    expect(lastChild(li1).properties.href).toBe("#li-1");
  });

  test("loose list items (containing <p>) defer to the inner paragraph", () => {
    // markdown:
    // - first
    //
    // - second
    // → <ul><li><p>first</p></li><li><p>second</p></li></ul>
    const tree = {
      type: "root" as const,
      children: [
        elem("ul", {}, [
          elem("li", {}, [elem("p", {}, [text("first")])]),
          elem("li", {}, [elem("p", {}, [text("second")])]),
        ]),
      ],
    };
    run(tree);

    const ul = tree.children[0] as HastElement;
    const [li1] = ul.children as HastElement[];
    // li itself is NOT anchored (no id, no appended <a>)
    expect(li1.properties.id).toBeUndefined();
    expect(li1.children).toHaveLength(1); // just the <p>, no anchor

    // inner <p> IS anchored
    const innerP = li1.children[0] as HastElement;
    expect(innerP.properties.id).toBe("p-1");
    expect(lastChild(innerP).properties.href).toBe("#p-1");
  });

  test("counters for paragraphs and list items are independent", () => {
    const tree = {
      type: "root" as const,
      children: [
        elem("p", {}, [text("para")]),
        elem("ul", {}, [elem("li", {}, [text("item")])]),
        elem("p", {}, [text("another")]),
      ],
    };
    run(tree);

    expect((tree.children[0] as HastElement).properties.id).toBe("p-1");
    expect(
      ((tree.children[1] as HastElement).children[0] as HastElement).properties
        .id,
    ).toBe("li-1");
    expect((tree.children[2] as HastElement).properties.id).toBe("p-2");
  });

  test("headings are not touched (handled by rehype-autolink-headings)", () => {
    const tree = {
      type: "root" as const,
      children: [
        elem("h1", { id: "title" }, [text("Title")]),
        elem("h2", { id: "section" }, [text("Section")]),
      ],
    };
    run(tree);

    expect((tree.children[0] as HastElement).children).toHaveLength(1);
    expect((tree.children[1] as HastElement).children).toHaveLength(1);
  });

  test("non-anchorable blocks (div, blockquote) are not modified", () => {
    const tree = {
      type: "root" as const,
      children: [
        elem("div", {}, [text("hi")]),
        elem("blockquote", {}, [elem("p", {}, [text("quoted")])]),
      ],
    };
    run(tree);

    expect((tree.children[0] as HastElement).children).toHaveLength(1);
    // blockquote untouched, but inner <p> still gets anchored
    const innerP = (tree.children[1] as HastElement).children[0] as HastElement;
    expect(lastChild(innerP).properties.href).toBe("#p-1");
  });

  test("frontmatter anchors:false skips the entire entry", () => {
    const tree = {
      type: "root" as const,
      children: [elem("p", {}, [text("hi")])],
    };
    run(tree, {
      file: { data: { astro: { frontmatter: { anchors: false } } } },
    });

    const p = tree.children[0] as HastElement;
    expect(p.properties.id).toBeUndefined();
    expect(p.children).toHaveLength(1);
  });

  test("config-level skip predicate skips matching files", () => {
    const tree = {
      type: "root" as const,
      children: [elem("p", {}, [text("hi")])],
    };
    run(tree, {
      options: { skip: (file) => file?.path?.includes("/poetry/") },
      file: {
        path: "/posts/poetry/day-1.md",
        data: { astro: { frontmatter: {} } },
      },
    });

    const p = tree.children[0] as HastElement;
    expect(p.properties.id).toBeUndefined();
  });

  test("frontmatter anchors:true overrides a config-level skip", () => {
    const tree = {
      type: "root" as const,
      children: [elem("p", {}, [text("hi")])],
    };
    run(tree, {
      options: { skip: () => true },
      file: {
        path: "/posts/poetry/day-1.md",
        data: { astro: { frontmatter: { anchors: true } } },
      },
    });

    const p = tree.children[0] as HastElement;
    expect(p.properties.id).toBe("p-1");
  });

  test("anchor link uses anchor-link class with appropriate aria-label", () => {
    const tree = {
      type: "root" as const,
      children: [
        elem("p", {}, [text("hi")]),
        elem("ul", {}, [elem("li", {}, [text("item")])]),
      ],
    };
    run(tree);

    const pLink = lastChild(tree.children[0] as HastElement);
    expect(pLink.properties.className).toContain("anchor-link");
    expect(pLink.properties.ariaLabel).toMatch(/paragraph/i);

    const liLink = lastChild(
      (tree.children[1] as HastElement).children[0] as HastElement,
    );
    expect(liLink.properties.className).toContain("anchor-link");
    expect(liLink.properties.ariaLabel).toMatch(/item/i);
  });
});
