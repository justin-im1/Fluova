import { getServerUser } from "@/lib/auth/getServerUser";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const user = await getServerUser();
  if (user) {
    redirect("/dashboard");
  }
  redirect("/login");
}
