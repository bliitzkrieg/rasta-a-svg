"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

interface AppTooltipProps {
  content: ReactNode;
  children: ReactNode;
}

export function AppTooltip({ content, children }: AppTooltipProps) {
  return (
    <Tooltip.Provider delayDuration={180}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="app-tooltip" sideOffset={8}>
            {content}
            <Tooltip.Arrow className="app-tooltip-arrow" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
