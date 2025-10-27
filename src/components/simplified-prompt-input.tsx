"use client";

import {
  AudioWaveformIcon,
  CornerRightUp,
  FileIcon,
  Loader2,
  PaperclipIcon,
  Square,
  XIcon,
  Mic,
  MicOff,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "ui/button";
import { UIMessage, UseChatHelpers } from "@ai-sdk/react";
import { appStore, UploadedFile } from "@/app/store";
import { useShallow } from "zustand/shallow";
import { useFileUpload } from "@/hooks/use-presigned-upload";
import { toast } from "sonner";
import { generateUUID, cn } from "@/lib/utils";
import { FileUIPart } from "ai";

interface SimplifiedPromptInputProps {
  placeholder?: string;
  setInput: (value: string) => void;
  input: string;
  onStop: () => void;
  sendMessage: UseChatHelpers<UIMessage>["sendMessage"];
  isLoading?: boolean;
  threadId?: string;
  onFocus?: () => void;
}

export default function SimplifiedPromptInput({
  placeholder,
  sendMessage,
  input,
  onFocus,
  setInput,
  onStop,
  isLoading,
  threadId,
}: SimplifiedPromptInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { upload } = useFileUpload();

  const [threadFiles, appStoreMutate] = appStore(
    useShallow((state) => [state.threadFiles, state.mutate]),
  );

  const uploadedFiles = useMemo<UploadedFile[]>(() => {
    if (!threadId) return [];
    return threadFiles[threadId] ?? [];
  }, [threadFiles, threadId]);

  const deleteFile = useCallback(
    (fileId: string) => {
      if (!threadId) return;

      // Find file and abort if uploading
      const file = uploadedFiles.find((f) => f.id === fileId);
      if (file?.isUploading && file.abortController) {
        file.abortController.abort();
      }

      // Cleanup preview URL if exists
      if (file?.previewUrl) {
        URL.revokeObjectURL(file.previewUrl);
      }

      appStoreMutate((prev) => {
        const newFiles = uploadedFiles.filter((f) => f.id !== fileId);
        return {
          threadFiles: {
            ...prev.threadFiles,
            [threadId]: newFiles,
          },
        };
      });
    },
    [uploadedFiles, threadId, appStoreMutate],
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !threadId) return;

      // Validate file type - support PDF, XLSX, JPG, PNG, CSV
      const allowedTypes = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // XLSX
        "application/vnd.ms-excel", // XLS
        "image/jpeg",
        "image/jpg",
        "image/png",
        "text/csv",
      ];

      if (!allowedTypes.includes(file.type)) {
        toast.error("Please upload a PDF, XLSX, JPG, PNG, or CSV file");
        return;
      }

      // Validate file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File size must be less than 10MB");
        return;
      }

      // Create preview URL for images
      const previewUrl = file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : undefined;
      const fileId = generateUUID();
      const abortController = new AbortController();

      // Add file with uploading state immediately
      const uploadingFile: UploadedFile = {
        id: fileId,
        url: "",
        name: file.name,
        mimeType: file.type,
        size: file.size,
        isUploading: true,
        progress: 0,
        previewUrl,
        abortController,
      };

      appStoreMutate((prev) => ({
        threadFiles: {
          ...prev.threadFiles,
          [threadId]: [...(prev.threadFiles[threadId] ?? []), uploadingFile],
        },
      }));

      try {
        // Upload file
        const uploadedFile = await upload(file);

        if (uploadedFile) {
          // Update with final URL
          appStoreMutate((prev) => ({
            threadFiles: {
              ...prev.threadFiles,
              [threadId]: (prev.threadFiles[threadId] ?? []).map((f) =>
                f.id === fileId
                  ? {
                      ...f,
                      url: uploadedFile.url,
                      isUploading: false,
                      progress: 100,
                    }
                  : f,
              ),
            },
          }));

          toast.success("File uploaded successfully");
        } else {
          // Failed to upload - remove the file
          appStoreMutate((prev) => ({
            threadFiles: {
              ...prev.threadFiles,
              [threadId]: (prev.threadFiles[threadId] ?? []).filter(
                (f) => f.id !== fileId,
              ),
            },
          }));
        }
      } catch (error) {
        // Upload failed - remove the file
        if (error instanceof Error && error.name === "AbortError") {
          // Remove aborted upload
          appStoreMutate((prev) => ({
            threadFiles: {
              ...prev.threadFiles,
              [threadId]: (prev.threadFiles[threadId] ?? []).filter(
                (f) => f.id !== fileId,
              ),
            },
          }));
        } else {
          // For other errors, remove the file and show error
          appStoreMutate((prev) => ({
            threadFiles: {
              ...prev.threadFiles,
              [threadId]: (prev.threadFiles[threadId] ?? []).filter(
                (f) => f.id !== fileId,
              ),
            },
          }));
        }
      } finally {
        // Cleanup preview URL
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
        }
      }

      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [threadId, upload, appStoreMutate],
  );

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        await handleVoiceMemo(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Error starting recording:", error);
      toast.error(
        "Failed to start recording. Please check microphone permissions.",
      );
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const handleVoiceMemo = useCallback(
    async (audioBlob: Blob) => {
      setIsTranscribing(true);
      try {
        const formData = new FormData();
        formData.append("file", audioBlob, "memo.webm");

        const res = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          throw new Error("Transcription failed");
        }

        const { text } = await res.json();
        setInput(input + (input ? " " : "") + text);
        toast.success("Voice memo transcribed");
      } catch (error) {
        console.error("Transcription error:", error);
        toast.error("Failed to transcribe voice memo");
      } finally {
        setIsTranscribing(false);
      }
    },
    [setInput],
  );

  const submit = () => {
    if (isLoading) return;
    const userMessage = input?.trim() || "";
    if (userMessage.length === 0) return;

    setInput("");
    sendMessage({
      role: "user",
      parts: [
        ...uploadedFiles.map(
          (file) =>
            ({
              type: "file",
              url: file.url || file.dataUrl || "",
              mediaType: file.mimeType,
            }) as FileUIPart,
        ),
        {
          type: "text",
          text: userMessage,
        },
      ],
    });
    appStoreMutate((prev) => ({
      threadFiles: {
        ...prev.threadFiles,
        [threadId!]: [],
      },
    }));
  };

  return (
    <div className="max-w-3xl mx-auto fade-in animate-in">
      <div className="z-10 mx-auto w-full max-w-3xl relative">
        <fieldset className="flex w-full min-w-0 max-w-full flex-col px-4">
          <div className="shadow-lg overflow-hidden rounded-4xl backdrop-blur-sm transition-all duration-200 bg-muted/60 relative flex w-full flex-col cursor-text z-10 items-stretch focus-within:bg-muted hover:bg-muted focus-within:ring-muted hover:ring-muted">
            <div className="flex flex-col gap-3.5 px-5 pt-2 pb-4">
              <div className="relative min-h-[2rem]">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    placeholder ??
                    "Ask about construction estimates, upload files, or record a voice memo..."
                  }
                  className="w-full resize-none border-0 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 min-h-[2rem] max-h-[200px] py-2"
                  onFocus={onFocus}
                  rows={1}
                  style={{
                    height: "auto",
                    minHeight: "2rem",
                  }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = "auto";
                    target.style.height = target.scrollHeight + "px";
                  }}
                />
              </div>
              <div className="flex w-full items-center z-30">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png,.csv"
                  className="hidden"
                  onChange={handleFileSelect}
                  disabled={!threadId}
                />

                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full hover:bg-input! p-2!"
                  disabled={!threadId}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <PaperclipIcon className="size-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full hover:bg-input! p-2!"
                  disabled={!threadId || isTranscribing}
                  onClick={isRecording ? stopRecording : startRecording}
                >
                  {isTranscribing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : isRecording ? (
                    <MicOff className="size-4" />
                  ) : (
                    <Mic className="size-4" />
                  )}
                </Button>

                <div className="flex-1" />

                <div
                  onClick={() => {
                    if (isLoading) {
                      onStop();
                    } else {
                      submit();
                    }
                  }}
                  className="fade-in animate-in cursor-pointer text-muted-foreground rounded-full p-2 bg-secondary hover:bg-accent-foreground hover:text-accent transition-all duration-200"
                >
                  {isLoading ? (
                    <Square
                      size={16}
                      className="fill-muted-foreground text-muted-foreground"
                    />
                  ) : (
                    <CornerRightUp size={16} />
                  )}
                </div>
              </div>

              {/* Uploaded Files Preview - Below Input */}
              {uploadedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {uploadedFiles.map((file) => {
                    const isImage = file.mimeType.startsWith("image/");
                    const fileExtension =
                      file.name.split(".").pop()?.toUpperCase() || "FILE";
                    const imageSrc =
                      file.previewUrl || file.url || file.dataUrl || "";

                    return (
                      <div
                        key={file.id}
                        className="relative group rounded-lg overflow-hidden border-2 border-border hover:border-primary transition-all"
                      >
                        {isImage ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={imageSrc}
                            alt={file.name}
                            className="w-24 h-24 object-cover"
                          />
                        ) : (
                          <div className="w-24 h-24 flex flex-col items-center justify-center bg-muted">
                            <FileIcon className="size-8 text-muted-foreground mb-1" />
                            <span className="text-xs font-medium text-muted-foreground">
                              {fileExtension}
                            </span>
                          </div>
                        )}

                        {/* Upload Progress Overlay */}
                        {file.isUploading && (
                          <div className="absolute inset-0 bg-background/90 flex rounded-lg flex-col items-center justify-center backdrop-blur-sm">
                            <Loader2 className="size-6 animate-spin text-foreground mb-2" />
                            <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary transition-all duration-300"
                                style={{ width: `${file.progress || 0}%` }}
                              />
                            </div>
                            <span className="text-foreground text-xs mt-1">
                              {file.progress || 0}%
                            </span>
                          </div>
                        )}

                        {/* Hover Delete Button */}
                        <div
                          className={cn(
                            "absolute inset-0 bg-background/80 backdrop-blur-sm transition-opacity flex items-center justify-center rounded-lg",
                            file.isUploading
                              ? "opacity-0"
                              : "opacity-0 group-hover:opacity-100",
                          )}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full bg-background/80 hover:bg-background"
                            onClick={() => deleteFile(file.id)}
                            disabled={file.isUploading}
                          >
                            <XIcon className="size-4" />
                          </Button>
                        </div>

                        {/* Cancel Upload Button (Top Right) */}
                        {file.isUploading && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-1 right-1 size-6 rounded-full bg-background/60 hover:bg-background/80 backdrop-blur-sm"
                            onClick={() => deleteFile(file.id)}
                          >
                            <XIcon className="size-3" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </fieldset>
      </div>
    </div>
  );
}
