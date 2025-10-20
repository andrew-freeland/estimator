import { NextResponse } from "next/server";
import { validateRuntimeEnv } from "lib/env";

export async function POST(req: Request) {
  // Strict runtime env check - will throw with a clear message if required vars are missing
  validateRuntimeEnv();
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith("audio/")) {
      return NextResponse.json(
        { error: "File must be an audio file" },
        { status: 400 },
      );
    }

    // Validate file size (25MB limit for Whisper)
    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File size must be less than 25MB" },
        { status: 400 },
      );
    }

    // Use the same approach as the existing codebase
    const audioBuffer = await file.arrayBuffer();
    const formDataForWhisper = new FormData();
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: file.type });
    formDataForWhisper.append("file", blob, "audio.webm");
    formDataForWhisper.append("model", "whisper-1");
    formDataForWhisper.append("response_format", "json");
    formDataForWhisper.append("language", "auto"); // Auto-detect language

    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: formDataForWhisper,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Whisper API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    const text = result.text || "";

    return NextResponse.json({ text });
  } catch (error) {
    console.error("Transcription error:", error);
    return NextResponse.json(
      { error: "Failed to transcribe audio" },
      { status: 500 },
    );
  }
}
