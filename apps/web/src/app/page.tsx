import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const user = await currentUser();
  redirect(user ? "/create" : "/login");
}
