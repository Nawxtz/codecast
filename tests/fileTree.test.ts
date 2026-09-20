import { describe, it, expect } from "vitest";
import { buildFileTree, type FileTreeNode } from "../components/FileTreeExplorer";

describe("FileTreeExplorer - buildFileTree", () => {
  it("builds a single root node with specified rootName", () => {
    const tree = buildFileTree([], "ecolog");
    expect(tree.id).toBe("root");
    expect(tree.name).toBe("ecolog");
    expect(tree.isFolder).toBe(true);
    expect(tree.children).toEqual([]);
  });

  it("builds a hierarchical tree from a flat list of file paths", () => {
    const files = [
      "app/layout.tsx",
      "app/page.tsx",
      "app/_components/DashboardClient.tsx",
      "app/api/geocode/route.ts",
      "package.json",
      "prisma/schema.prisma",
    ];

    const tree = buildFileTree(files, "ecolog");
    expect(tree.name).toBe("ecolog");
    expect(tree.children).toBeDefined();

    // Folders come first: "app", "prisma", then files: "package.json"
    const topNames = tree.children!.map((c) => c.name);
    expect(topNames).toEqual(["app", "prisma", "package.json"]);

    // Find "app" folder
    const appFolder = tree.children!.find((c) => c.name === "app")!;
    expect(appFolder.isFolder).toBe(true);
    expect(appFolder.path).toBe("app");

    // In "app": folders first ("_components", "api") then files ("layout.tsx", "page.tsx")
    const appChildNames = appFolder.children!.map((c) => c.name);
    expect(appChildNames).toEqual(["_components", "api", "layout.tsx", "page.tsx"]);

    // In "_components": "DashboardClient.tsx"
    const componentsFolder = appFolder.children!.find((c) => c.name === "_components")!;
    expect(componentsFolder.children!.map((c) => c.name)).toEqual(["DashboardClient.tsx"]);
    expect(componentsFolder.children![0].path).toBe("app/_components/DashboardClient.tsx");
    expect(componentsFolder.children![0].isFolder).toBe(false);

    // In "api": folder "geocode" -> file "route.ts"
    const apiFolder = appFolder.children!.find((c) => c.name === "api")!;
    const geocodeFolder = apiFolder.children!.find((c) => c.name === "geocode")!;
    expect(geocodeFolder.children![0].path).toBe("app/api/geocode/route.ts");
    expect(geocodeFolder.children![0].name).toBe("route.ts");
  });

  it("supports objects with filename property", () => {
    const files = [
      { filename: "src/index.ts" },
      { filename: "src/utils.ts" },
      { filename: "README.md" },
    ];

    const tree = buildFileTree(files, "my-repo");
    expect(tree.name).toBe("my-repo");
    const topNames = tree.children!.map((c) => c.name);
    expect(topNames).toEqual(["src", "README.md"]);

    const srcFolder = tree.children!.find((c) => c.name === "src")!;
    expect(srcFolder.children!.map((c) => c.name)).toEqual(["index.ts", "utils.ts"]);
  });

  it("normalizes leading slashes and duplicate slashes", () => {
    const files = [
      "/app//page.tsx",
      "///app/layout.tsx",
      "/components/Nav.tsx",
    ];

    const tree = buildFileTree(files, "project");
    const appFolder = tree.children!.find((c) => c.name === "app")!;
    expect(appFolder).toBeDefined();
    expect(appFolder.children!.map((c) => c.path)).toEqual(["app/layout.tsx", "app/page.tsx"]);
  });

  it("handles deep directory nesting gracefully", () => {
    const files = ["a/b/c/d/e/f/file.txt"];
    const tree = buildFileTree(files, "root");

    let current: FileTreeNode = tree;
    const parts = ["a", "b", "c", "d", "e", "f", "file.txt"];
    for (let i = 0; i < parts.length; i++) {
      expect(current.children).toBeDefined();
      expect(current.children!.length).toBe(1);
      current = current.children![0];
      expect(current.name).toBe(parts[i]);
      expect(current.isFolder).toBe(i < parts.length - 1);
    }
    expect(current.path).toBe("a/b/c/d/e/f/file.txt");
  });
});
