import type { ReactNode } from "react";
import { Text } from "@radix-ui/themes";
import { CopyButton } from "@/components/copy-button";

interface CommandBlockProps {
  readonly label: string;
  readonly command: string;
  readonly hint?: ReactNode;
}

export function CommandBlock({ label, command, hint }: CommandBlockProps) {
  return (
    <div className="command-block">
      <div className="command-block__header">
        <Text as="p" size="1" weight="medium" className="command-block__label">
          {label}
        </Text>
        {hint ? (
          <Text as="p" size="1" className="command-block__hint">
            {hint}
          </Text>
        ) : null}
      </div>
      <div className="command-block__surface">
        <code className="command-block__code">{command}</code>
        <CopyButton value={command} />
      </div>
    </div>
  );
}
