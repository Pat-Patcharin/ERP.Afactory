import { redirect } from "next/navigation";

/** Land on the Command Center — what happened, what needs attention, what
 *  needs approval, and today's workload, before anyone picks a module. */
export default function HomePage() {
  redirect("/dashboard");
}
