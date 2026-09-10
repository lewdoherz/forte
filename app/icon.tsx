import { ImageResponse } from "next/og";
import { ForteMark } from "@/components/forte-mark";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<ForteMark size={32} />, { ...size });
}
