import {
  Folder,
  FileVideo,
  FileText,
  FileImage,
  FileArchive,
  FileAudio,
  type LucideIcon,
} from "lucide-react";
import { FileKind } from "@/lib/mock-data";

type Style = {
  Icon: LucideIcon;
  bg: string;
  text: string;
};

const styleMap: Record<FileKind, Style> = {
  folder: { Icon: Folder, bg: "bg-accent-soft", text: "text-accent" },
  video: { Icon: FileVideo, bg: "bg-danger-soft", text: "text-danger" },
  doc: { Icon: FileText, bg: "bg-success-soft", text: "text-success" },
  image: { Icon: FileImage, bg: "bg-warning-soft", text: "text-warning" },
  zip: { Icon: FileArchive, bg: "bg-purple-soft", text: "text-purple" },
  audio: { Icon: FileAudio, bg: "bg-purple-soft", text: "text-purple" },
};

export function FileIcon({ kind }: { kind: FileKind }) {
  const { Icon, bg, text } = styleMap[kind];
  return (
    <span
      className={`w-7 h-7 rounded-md grid place-items-center ${bg} ${text} shrink-0`}
    >
      <Icon size={15} strokeWidth={2} />
    </span>
  );
}
