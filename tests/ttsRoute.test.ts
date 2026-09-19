import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../app/api/tts/route";

describe("TTS API Route (/api/tts)", () => {
  it("returns 400 when text is missing in GET", async () => {
    const req = new NextRequest("http://localhost:3000/api/tts?text=&lang=en-US");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Text is required.");
  });

  it("returns 400 when text is missing in POST", async () => {
    const req = new NextRequest("http://localhost:3000/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "   " }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Text is required.");
  });

  it("returns 400 on malformed JSON body in POST", async () => {
    const req = new NextRequest("http://localhost:3000/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("synthesizes English audio cleanly", async () => {
    const req = new NextRequest("http://localhost:3000/api/tts?text=Test&lang=en-US");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    const blob = await res.blob();
    expect(blob.size).toBeGreaterThan(100);
  }, 15000);

  it("synthesizes Thai audio cleanly with Edge TTS", async () => {
    const req = new NextRequest("http://localhost:3000/api/tts?text=" + encodeURIComponent("สวัสดีครับ") + "&lang=th-TH");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    const blob = await res.blob();
    expect(blob.size).toBeGreaterThan(100);
  }, 15000);

  it("supports explicit voice parameter in POST", async () => {
    const req = new NextRequest("http://localhost:3000/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "สวัสดีครับ", lang: "th-TH", voice: "th-TH-PremwadeeNeural" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    const blob = await res.blob();
    expect(blob.size).toBeGreaterThan(100);
  }, 15000);
});
