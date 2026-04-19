export type FileKind = "folder" | "video" | "image" | "doc" | "zip" | "audio";

export type FileItem = {
  id: string;
  name: string;
  kind: FileKind;
  sizeLabel: string;
  modifiedLabel: string;
  ownerInitial: string;
  ownerName: string;
};

export const sampleFiles: FileItem[] = [
  {
    id: "1",
    name: "프로젝트 A — 자동차 광고",
    kind: "folder",
    sizeLabel: "—",
    modifiedLabel: "오늘 14:32",
    ownerInitial: "V",
    ownerName: "VIMO",
  },
  {
    id: "2",
    name: "레퍼런스",
    kind: "folder",
    sizeLabel: "—",
    modifiedLabel: "어제",
    ownerInitial: "V",
    ownerName: "VIMO",
  },
  {
    id: "3",
    name: "BGM 컬렉션",
    kind: "folder",
    sizeLabel: "—",
    modifiedLabel: "2주 전",
    ownerInitial: "J",
    ownerName: "JIN",
  },
  {
    id: "4",
    name: "프로젝트_A_초벌_v3.mp4",
    kind: "video",
    sizeLabel: "2.4 GB",
    modifiedLabel: "오늘 11:08",
    ownerInitial: "S",
    ownerName: "SEON",
  },
  {
    id: "5",
    name: "광고_최종본_1080p.mp4",
    kind: "video",
    sizeLabel: "890 MB",
    modifiedLabel: "4월 17일",
    ownerInitial: "S",
    ownerName: "SEON",
  },
  {
    id: "6",
    name: "광고_브리프_v3.pdf",
    kind: "doc",
    sizeLabel: "3.2 MB",
    modifiedLabel: "4월 16일",
    ownerInitial: "J",
    ownerName: "JIN",
  },
  {
    id: "7",
    name: "썸네일_세트_v2.zip",
    kind: "zip",
    sizeLabel: "48 MB",
    modifiedLabel: "4월 15일",
    ownerInitial: "M",
    ownerName: "MIN",
  },
  {
    id: "8",
    name: "촬영스케줄_2026Q2.xlsx",
    kind: "doc",
    sizeLabel: "124 KB",
    modifiedLabel: "4월 14일",
    ownerInitial: "S",
    ownerName: "SEON",
  },
  {
    id: "9",
    name: "BGM_샘플_컬렉션.mp3",
    kind: "audio",
    sizeLabel: "64 MB",
    modifiedLabel: "4월 13일",
    ownerInitial: "J",
    ownerName: "JIN",
  },
  {
    id: "10",
    name: "소스_아카이브.zip",
    kind: "zip",
    sizeLabel: "12.1 GB",
    modifiedLabel: "4월 12일",
    ownerInitial: "V",
    ownerName: "VIMO",
  },
];

export type NavSection = {
  label: string;
  items: NavItem[];
};

export type NavItem = {
  id: string;
  label: string;
  icon: string; // lucide icon name
  count?: number;
  href: string;
};

export const navSections: NavSection[] = [
  {
    label: "빠른 접근",
    items: [
      { id: "recent", label: "최근 파일", icon: "Clock", count: 24, href: "/" },
      { id: "starred", label: "즐겨찾기", icon: "Star", count: 8, href: "/starred" },
      { id: "trash", label: "휴지통", icon: "Trash2", href: "/trash" },
    ],
  },
  {
    label: "폴더",
    items: [
      { id: "mine", label: "내 파일", icon: "User", href: "/files/mine" },
      { id: "team", label: "팀 공용", icon: "Users", href: "/files/team" },
      { id: "projects", label: "프로젝트", icon: "Folder", count: 12, href: "/files/projects" },
      { id: "references", label: "레퍼런스", icon: "Folder", href: "/files/references" },
      { id: "templates", label: "템플릿", icon: "Folder", href: "/files/templates" },
    ],
  },
  {
    label: "공유",
    items: [
      { id: "shared-with", label: "나와 공유한 파일", icon: "Share2", href: "/shared/with-me" },
      { id: "shared-by", label: "내가 공유한 파일", icon: "Link", href: "/shared/by-me" },
    ],
  },
];
