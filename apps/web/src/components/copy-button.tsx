"use client";

import { CheckIcon, CopyIcon } from "@radix-ui/react-icons";
import { Button } from "@radix-ui/themes";
import { useEffect, useId, useRef, useState } from "react";

export type CopyButtonState = "idle" | "copied" | "error";

export interface CopyButtonPresentation {
  readonly label: string;
  readonly statusMessage: string;
}

export const COPY_BUTTON_RESET_MS = 2000;

export function getCopyButtonPresentation(state: CopyButtonState): CopyButtonPresentation {
  switch (state) {
    case "copied":
      return { label: "Copied", statusMessage: "Command copied." };
    case "error":
      return {
        label: "Copy failed",
        statusMessage: "Copy failed. Select the command text manually.",
      };
    default:
      return { label: "Copy", statusMessage: "Ready to copy." };
  }
}

export async function performCopy(
  writeText: (value: string) => Promise<void>,
  value: string,
): Promise<CopyButtonState> {
  try {
    await writeText(value);
    return "copied";
  } catch {
    return "error";
  }
}

interface CopyButtonProps {
  readonly value: string;
}

export function CopyButton({ value }: CopyButtonProps) {
  const [state, setState] = useState<CopyButtonState>("idle");
  const statusId = useId();
  const resetTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current !== null) {
        window.clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  async function handleCopy() {
    if (resetTimeoutRef.current !== null) {
      window.clearTimeout(resetTimeoutRef.current);
    }

    const nextState = await performCopy((text) => navigator.clipboard.writeText(text), value);
    setState(nextState);

    resetTimeoutRef.current = window.setTimeout(() => {
      setState("idle");
    }, COPY_BUTTON_RESET_MS);
  }

  const presentation = getCopyButtonPresentation(state);
  const buttonProps = {
    type: "button" as const,
    size: "2" as const,
    onClick: handleCopy,
    "aria-describedby": statusId,
    className: "copy-button",
  };

  return (
    <>
      {state === "copied" ? (
        <Button {...buttonProps} variant="solid" color="green">
          <CheckIcon aria-hidden="true" />
          {presentation.label}
        </Button>
      ) : (
        <Button {...buttonProps} variant="soft">
          <CopyIcon aria-hidden="true" />
          {presentation.label}
        </Button>
      )}
      <span id={statusId} className="sr-only" role="status" aria-live="polite">
        {presentation.statusMessage}
      </span>
    </>
  );
}
