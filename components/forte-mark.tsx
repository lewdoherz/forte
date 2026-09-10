/** Neutral "forte" monogram mark, rendered into PNG icons by `next/og`. */
export function ForteMark({ size }: { size: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#18181b",
        color: "#fafafa",
        fontSize: Math.round(size * 0.62),
        fontWeight: 700,
        letterSpacing: -Math.round(size * 0.03),
      }}
    >
      f
    </div>
  );
}
