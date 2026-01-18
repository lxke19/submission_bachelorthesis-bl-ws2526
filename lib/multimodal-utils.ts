import { ContentBlock } from "@langchain/core/messages";
import { toast } from "sonner";

/**
 * Returns a multimodal content block for images or PDFs.
 *
 * COMPATIBILITY GOAL:
 * - UI (AgentChat-UI) expects camelCase: mimeType (and sometimes sourceType)
 * - Backend / adapters often expect snake_case: mime_type, source_type
 *
 * => We include BOTH to avoid breaking UI previews while keeping backend happy.
 */
export async function fileToContentBlock(
  file: File,
): Promise<ContentBlock.Multimodal.Data> {
  const supportedImageTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
  ] as const;

  const supportedFileTypes = [
    ...supportedImageTypes,
    "application/pdf",
  ] as const;

  if (!supportedFileTypes.includes(file.type as any)) {
    toast.error(
      `Unsupported file type: ${file.type}. Supported types are: ${supportedFileTypes.join(", ")}`,
    );
    throw new Error(`Unsupported file type: ${file.type}`);
  }

  const data = await fileToBase64(file);

  // Images
  if (supportedImageTypes.includes(file.type as any)) {
    return {
      type: "image",

      // --- UI compatibility ---
      mimeType: file.type,
      sourceType: "base64",

      // --- Backend compatibility ---
      mime_type: file.type,
      source_type: "base64",

      data,
      metadata: { name: file.name },
    } as unknown as ContentBlock.Multimodal.Data;
  }

  // PDF
  return {
    type: "file",

    // --- UI compatibility ---
    mimeType: "application/pdf",
    sourceType: "base64",

    // --- Backend compatibility ---
    mime_type: "application/pdf",
    source_type: "base64",

    data,
    metadata: { filename: file.name },
  } as unknown as ContentBlock.Multimodal.Data;
}

/**
 * Convert a browser File to a base64 string (no data:...;base64, prefix).
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Unexpected FileReader result type."));
        return;
      }

      // Expect a Data URL: data:<mime>;base64,<payload>
      const commaIdx = result.indexOf(",");
      if (commaIdx === -1) {
        reject(
          new Error("Unexpected FileReader result (no comma in data URL)."),
        );
        return;
      }

      resolve(result.slice(commaIdx + 1));
    };

    reader.onerror = () =>
      reject(reader.error ?? new Error("FileReader failed."));
    reader.readAsDataURL(file);
  });
}

/**
 * Type guard for base64 multimodal blocks (images + PDFs).
 * Accepts BOTH key styles:
 * - camelCase: mimeType, sourceType
 * - snake_case: mime_type, source_type
 */
export function isBase64ContentBlock(
  block: unknown,
): block is ContentBlock.Multimodal.Data {
  if (typeof block !== "object" || block === null) return false;

  const b = block as any;
  if (b.type !== "file" && b.type !== "image") return false;

  const mime: unknown = b.mimeType ?? b.mime_type;
  if (typeof mime !== "string") return false;

  const sourceType: unknown = b.sourceType ?? b.source_type;
  // If present, it must be base64 for our preview handling
  if (sourceType != null && sourceType !== "base64") return false;

  if (b.type === "file") {
    return mime === "application/pdf" || mime.startsWith("image/");
  }

  // b.type === "image"
  return mime.startsWith("image/");
}
