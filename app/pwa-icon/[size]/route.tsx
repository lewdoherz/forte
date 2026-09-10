import { ImageResponse } from "next/og";
import { ForteMark } from "@/components/forte-mark";

/** Serves the PWA manifest icons (192/512) generated at request time. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const { size } = await params;
  const px = size === "512" ? 512 : 192;
  return new ImageResponse(<ForteMark size={px} />, { width: px, height: px });
}
