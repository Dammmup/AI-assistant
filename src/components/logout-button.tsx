"use client";

import { apiFetch } from "@/lib/client";
import { Button } from "./ui";

export function LogoutButton() {
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={async () => {
        await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        window.location.href = "/login";
      }}
    >
      Выйти
    </Button>
  );
}
