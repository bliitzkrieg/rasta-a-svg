import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildZip, uniqueZipPath } from "@/lib/download";

async function readZip(blob: Blob): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const out: Record<string, string> = {};
  for (const name of Object.keys(zip.files)) {
    if (!zip.files[name].dir) out[name] = await zip.files[name].async("string");
  }
  return out;
}

describe("uniqueZipPath", () => {
  it("keeps the first use of a path unchanged", () => {
    expect(uniqueZipPath("logo.svg", new Set())).toBe("logo.svg");
  });

  it("suffixes the second and third uses before the extension", () => {
    const used = new Set(["logo.svg", "logo-2.svg"]);
    expect(uniqueZipPath("logo.svg", used)).toBe("logo-3.svg");
  });

  it("handles paths without an extension", () => {
    expect(uniqueZipPath("logo", new Set(["logo"]))).toBe("logo-2");
  });
});

describe("buildZip", () => {
  it("keeps distinct names unchanged", async () => {
    const files = await readZip(
      await buildZip([
        { path: "a.svg", content: "A" },
        { path: "b.svg", content: "B" },
      ]),
    );
    expect(Object.keys(files).sort()).toEqual(["a.svg", "b.svg"]);
    expect(files["a.svg"]).toBe("A");
    expect(files["b.svg"]).toBe("B");
  });

  it("keeps both images when two inputs share a base name (logo.png + logo.jpg)", async () => {
    const files = await readZip(
      await buildZip([
        { path: "logo.svg", content: "<svg>PNG version</svg>" },
        { path: "logo.eps", content: "%EPS PNG version" },
        { path: "logo.dxf", content: "DXF PNG version" },
        { path: "logo.svg", content: "<svg>JPG version</svg>" },
        { path: "logo.eps", content: "%EPS JPG version" },
        { path: "logo.dxf", content: "DXF JPG version" },
      ]),
    );
    expect(Object.keys(files).sort()).toEqual([
      "logo-2.dxf",
      "logo-2.eps",
      "logo-2.svg",
      "logo.dxf",
      "logo.eps",
      "logo.svg",
    ]);
    expect(files["logo.svg"]).toBe("<svg>PNG version</svg>");
    expect(files["logo.eps"]).toBe("%EPS PNG version");
    expect(files["logo.dxf"]).toBe("DXF PNG version");
    expect(files["logo-2.svg"]).toBe("<svg>JPG version</svg>");
    expect(files["logo-2.eps"]).toBe("%EPS JPG version");
    expect(files["logo-2.dxf"]).toBe("DXF JPG version");
  });
});
