import { redirect } from "next/navigation";

/** Land on the purchasing command center — the busiest screen of the day. */
export default function HomePage() {
  redirect("/purchase");
}
