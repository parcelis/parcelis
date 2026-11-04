"use client";

import * as React from "react";
import { ImagePlus, Replace, Trash2, X } from "lucide-react";
import Image from "next/image";
import { Button } from "@parcelis/ui";
import { imageContentTypes } from "./image-upload";

type SingleImageUploadPanelProps = {
  multiple?: false;
  alt: string;
  acceptedImageDescription?: string;
  acceptedImageTypes?: readonly string[];
  hasPendingImage?: boolean;
  imagePreviewUrl: string | null;
  isDeletePending?: boolean;
  onDelete: () => void;
  onImageChange: (file: File | null) => void;
  onValidationErrorChange?: (error: string | null) => void;
  previewBackground?: "light" | "dark";
  previewImageFit?: "contain" | "cover";
  title?: string;
};

function SingleImageUploadPanel({
  alt,
  acceptedImageDescription = "JPG, PNG, WebP, or GIF",
  acceptedImageTypes = imageContentTypes,
  hasPendingImage = false,
  imagePreviewUrl,
  isDeletePending = false,
  onDelete,
  onImageChange,
  onValidationErrorChange,
  previewBackground,
  previewImageFit = "cover",
  title,
}: SingleImageUploadPanelProps) {
  const imageInputRef = React.useRef<HTMLInputElement | null>(null);
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const acceptedTypes = new Set(acceptedImageTypes);
  const previewSurfaceClassName =
    previewBackground === "light"
      ? "bg-white"
      : previewBackground === "dark"
        ? "bg-parcelis-charcoal"
        : "bg-parcelis-porcelain/50 dark:bg-parcelis-charcoal/55";
  const emptyStateTitleClassName =
    previewBackground === "dark"
      ? "text-white"
      : previewBackground === "light"
        ? "text-parcelis-charcoal dark:!text-parcelis-charcoal"
        : "text-parcelis-charcoal dark:text-white";
  const emptyStateDescriptionClassName =
    previewBackground === "dark"
      ? "text-parcelis-porcelain"
      : previewBackground === "light"
        ? "text-parcelis-gray dark:!text-parcelis-gray"
        : "text-parcelis-gray";

  return (
    <section className="w-full">
      {title ? <h3 className="text-xl font-bold text-parcelis-charcoal dark:text-white">{title}</h3> : null}
      <div className="mx-auto w-full max-w-xs">
        <input
          accept={acceptedImageTypes.join(",")}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            if (file && !acceptedTypes.has(file.type)) {
              const error = `Choose a ${acceptedImageDescription} image.`;
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
          className={`mt-3 flex aspect-[4/3] w-full flex-col items-center justify-center overflow-hidden rounded-md border border-dashed border-parcelis-border text-center transition hover:border-parcelis-green ${previewSurfaceClassName}`}
          onClick={() => imageInputRef.current?.click()}
          type="button"
        >
          {imagePreviewUrl ? (
            <Image
              alt={alt}
              className={`h-full w-full ${previewImageFit === "contain" ? "object-contain p-4" : "object-cover"}`}
              src={imagePreviewUrl}
              height={256}
              unoptimized
              width={256}
            />
          ) : (
            <>
              <ImagePlus className="h-6 w-6 text-parcelis-green" />
              <span className={`mt-3 text-sm font-semibold ${emptyStateTitleClassName}`}>Upload image</span>
              <span className={`mt-1 px-3 text-xs ${emptyStateDescriptionClassName}`}>{acceptedImageDescription}</span>
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
              {hasPendingImage ? <X className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
              {hasPendingImage ? "Discard image" : "Delete image"}
            </button>
          </div>
        ) : null}
        {validationError ? <p className="mt-3 text-sm font-medium text-red-700">{validationError}</p> : null}
      </div>
    </section>
  );
}

type MultipleImageUploadPanelProps = {
  multiple: true;
  inputId: string;
  acceptedImageTypes: readonly string[];
  acceptedImageDescription: string;
  buttonLabel: string;
  disabled?: boolean;
  onImagesChange: (files: File[]) => void;
};

export function ImageUploadPanel(props: SingleImageUploadPanelProps | MultipleImageUploadPanelProps) {
  return props.multiple ? <MultipleImageUploadPanel {...props} /> : <SingleImageUploadPanel {...props} />;
}

function MultipleImageUploadPanel({
  inputId,
  acceptedImageTypes,
  acceptedImageDescription,
  buttonLabel,
  disabled = false,
  onImagesChange,
}: MultipleImageUploadPanelProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  return (
    <div className="w-full">
      <input
        id={inputId}
        ref={inputRef}
        className="sr-only"
        type="file"
        multiple
        disabled={disabled}
        accept={acceptedImageTypes.join(",")}
        tabIndex={-1}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          onImagesChange(files);
        }}
      />
      <Button
        type="button"
        variant="secondary"
        aria-label={buttonLabel}
        aria-describedby={`${inputId}-help`}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="h-auto min-h-28 w-full justify-start gap-4 whitespace-normal border-dashed px-4 py-5 text-left hover:border-parcelis-green dark:bg-parcelis-slate"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-parcelis-green/10">
          <ImagePlus aria-hidden="true" className="h-5 w-5 text-parcelis-green" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-semibold">{buttonLabel}</span>
          <span id={`${inputId}-help`} className="text-xs font-normal leading-5 text-parcelis-gray">
            {acceptedImageDescription}
          </span>
        </span>
      </Button>
    </div>
  );
}
