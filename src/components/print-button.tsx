"use client";

import { Button } from "./ui";

export function PrintButton() {
  return <Button onClick={() => window.print()}>Печать</Button>;
}
