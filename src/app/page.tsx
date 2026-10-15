import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/auth";

export default async function Home() {
  const user = await requirePageUser();
  redirect(user.role === "admin" ? "/admin/users" : "/appointments");
}
