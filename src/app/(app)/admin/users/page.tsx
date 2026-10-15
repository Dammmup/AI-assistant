import { requirePageUser } from "@/lib/auth";
import { collections } from "@/lib/db";
import { UsersManager } from "@/components/admin/users-manager";

export default async function UsersPage() {
  const me = await requirePageUser("admin");
  const { users } = await collections();
  const list = await users.find({}, { projection: { passwordHash: 0 } }).sort({ createdAt: 1 }).toArray();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Пользователи</h1>
      <UsersManager
        meId={me._id.toHexString()}
        users={list.map((u) => ({
          id: u._id.toHexString(),
          fullName: u.fullName,
          email: u.email,
          role: u.role,
          isActive: u.isActive,
          createdAt: u.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
