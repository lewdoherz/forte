import { ImageResponse } from "next/og";
import { ForteMark } from "@/components/forte-mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<ForteMark size={180} />, { ...size });
}
