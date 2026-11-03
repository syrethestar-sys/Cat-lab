"use client";

import { Upload } from "lucide-react";
import { useState } from "react";

type UploadBoxProps = {
  title: string;
  text: string;
  onFiles: (files: File[]) => void;
};

export default function UploadBox({ title, text, onFiles }: UploadBoxProps) {
  const [over, setOver] = useState(false);

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFiles([...e.dataTransfer.files]);
      }}
      className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border-3 border-dashed px-5 py-9 text-center transition-colors hover:border-blue has-focus-visible:border-blue ${over ? "border-blue" : "border-line"}`}
    >
      <Upload className="size-14 text-blue" />
      <span className="font-bold">{title}</span>
      <span className="text-muted">{text}</span>
      <input
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </label>
  );
}
