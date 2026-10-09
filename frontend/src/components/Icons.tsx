import type { SVGProps } from "react";
import icons from "../assets/octicons.json";

type IconProps = Omit<SVGProps<SVGSVGElement>, "stroke"> & { size?: number; stroke?: number };
function glyph(name: keyof typeof icons) {
  return function Icon({ size = 16, stroke, className = "", ...props }: IconProps) {
    void stroke;
    const icon = icons[name];
    return <svg {...props} className={`icon ${className}`} width={size} height={size} viewBox={icon.viewBox} fill="currentColor" aria-hidden={props["aria-label"] ? undefined : true} dangerouslySetInnerHTML={{ __html: icon.body }} />;
  };
}
export const IconAlertCircle = glyph("warning");
export const IconArchive = glyph("archive");
export const IconArrowLeft = glyph("arrow-left");
export const IconArrowRight = glyph("arrow-right");
export const IconBell = glyph("bell");
export const IconBug = glyph("bug");
export const IconCalendar = glyph("calendar");
export const IconChartBar = glyph("chart");
export const IconChartBarPopular = glyph("chart");
export const IconCheck = glyph("check");
export const IconChevronDown = glyph("chevron");
export const IconChevronLeft = glyph("arrow-left");
export const IconChevronRight = glyph("arrow-right");
export const IconChevronsUp = glyph("warning");
export const IconCircle = glyph("circle");
export const IconCircleCheck = glyph("check");
export const IconCircleDot = glyph("circle");
export const IconCopy = glyph("layers");
export const IconCopyOff = glyph("link");
export const IconDownload = glyph("download");
export const IconFileSearch = glyph("search");
export const IconFileText = glyph("book");
export const IconFilter = glyph("filter");
export const IconHelpCircle = glyph("message");
export const IconInfoCircle = glyph("info");
export const IconKey = glyph("lock");
export const IconListDetails = glyph("board");
export const IconLock = glyph("lock");
export const IconLogout = glyph("logout");
export const IconMenu2 = glyph("list");
export const IconPencil = glyph("edit");
export const IconPhoto = glyph("image");
export const IconPlus = glyph("plus");
export const IconRefresh = glyph("refresh");
export const IconRestore = glyph("archive");
export const IconSearch = glyph("search");
export const IconTag = glyph("tag");
export const IconUser = glyph("user");
export const IconUsers = glyph("users");
export const IconX = glyph("close");
export const IconDots = glyph("more");
export const IconSortAscending = glyph("sort");
export const IconLink = glyph("link");

export const IconSpark = glyph("spark");
