import { requirePageUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/labels";
import { AppShell } from "@/components/shell/app-shell";
import { SiteFooter } from "@/components/shell/footer";
import { isAccessLocked } from "@/lib/paywall";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  return (
    <AppShell
      user={{
        fullName: user.fullName,
        role: user.role,
        roleLabel: ROLE_LABEL[user.role],
        position: user.position ?? null,
        avatarColor: user.preferences?.avatarColor ?? null,
      }}
      footer={<SiteFooter />}
      locked={isAccessLocked()}
    >
      {children}
    </AppShell>
  );
}
