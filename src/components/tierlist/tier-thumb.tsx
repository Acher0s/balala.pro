/**
 * A card sprite for tier lists, shown at half the 2x texture size (71×95, the game's own
 * 1x size). Playing cards stack their base and front layers.
 */
export function TierThumbImage({
  layers,
  small,
}: {
  layers: string[];
  small?: boolean;
}) {
  const size = small ? "h-12 w-9" : "h-[95px] w-[71px]";
  return (
    <span className={`relative block ${size}`}>
      {layers.map((src) => (
        // biome-ignore lint/performance/noImgElement: pixel-art sprites
        <img
          key={src}
          src={src}
          alt=""
          draggable={false}
          loading="lazy"
          className="absolute inset-0 size-full"
          style={{ margin: 0 }}
        />
      ))}
    </span>
  );
}
