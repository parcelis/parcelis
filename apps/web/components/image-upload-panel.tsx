"use client";

import * as React from "react";
import { ImagePlus, Replace, Trash2 } from "lucide-react";

const supportedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

type ImageUploadPanelProps = {
  alt: string;
  imagePreviewUrl: string | null;
  isDeletePending?: boolean;
  onDelete: () => void;
  onImageChange: (file: File | null) => void;
  onValidationErrorChange?: (error: string | null) => void;
  title: string;
};

export function ImageUploadPanel({
  alt,
  imagePreviewUrl,
  isDeletePending = false,
  onDelete,
  onImageChange,
  onValidationErrorChange,
  title,
}: ImageUploadPanelProps) {
  const imageInputRef = React.useRef<HTMLInputElement | null>(null);
  const [validationError, setValidationError] = React.useState<string | null>(null);

  return (
    <section className="w-full">
      <h3 className="text-xl font-bold text-parcelis-charcoal dark:text-white">{title}</h3>
      <div className="mx-auto w-full max-w-xs">
        <input
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            if (file && !supportedImageTypes.has(file.type)) {
              const error = "Choose a JPG, PNG, or WebP image.";
              setValidationError(error);
              onValidationErrorChange?.(error);
            } else {
              setValidationError(null);
              onValidationErrorChange?.(null);
              onImageChange(file);
            }
            event.target.value = "";
          }}
          ref={imageInputRef}
          type="file"
        />
        <button
          className="mt-3 flex aspect-[4/3] w-full flex-col items-center justify-center overflow-hidden rounded-md border border-dashed border-parcelis-border bg-parcelis-porcelain/50 text-center transition hover:border-parcelis-green dark:bg-parcelis-charcoal/55"
          onClick={() => imageInputRef.current?.click()}
          type="button"
        >
          {imagePreviewUrl ? (
            <img alt={alt} className="h-full w-full object-cover" src={imagePreviewUrl} />
          ) : (
            <>
              <ImagePlus className="h-6 w-6 text-parcelis-green" />
              <span className="mt-3 text-sm font-semibold text-parcelis-charcoal dark:text-white">Upload image</span>
              <span className="mt-1 px-3 text-xs text-parcelis-gray">JPG, PNG, or WebP</span>
            </>
          )}
        </button>
        {imagePreviewUrl ? (
          <div className="mt-3 flex items-center justify-between gap-3 text-sm font-semibold">
            <button
              className="inline-flex items-center gap-1.5 text-parcelis-charcoal hover:underline dark:text-white"
              onClick={() => imageInputRef.current?.click()}
              type="button"
            >
              <Replace className="h-4 w-4" />
              Replace image
            </button>
            <button
              className="inline-flex items-center gap-1.5 text-red-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isDeletePending}
              onClick={onDelete}
              type="button"
            >
              <Trash2 className="h-4 w-4" />
              Delete image
            </button>
          </div>
        ) : null}
        {validationError ? <p className="mt-3 text-sm font-medium text-red-700">{validationError}</p> : null}
      </div>
    </section>
  );
}
