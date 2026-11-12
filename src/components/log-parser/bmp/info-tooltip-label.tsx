// Copied from Balatro-Multiplayer/BalatroMultiplayerServer (apps/web/src/app/(home)/matches/components/info-tooltip-label.tsx, as of the commit before
// f5e5bbf7, which removed the Log Parser page), with the BMP team's permission. Only import
// paths are changed; see ../NOTICE.md.
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from './ui'

// Ported from www's InfoTooltipLabel (log-parser/page.tsx).
export function InfoTooltipLabel({
  label,
  description,
}: {
  label: string
  description: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className='cursor-help border-muted-foreground border-b border-dashed'>
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent className='max-w-xs whitespace-pre-line'>
        <p>{description}</p>
      </TooltipContent>
    </Tooltip>
  )
}
