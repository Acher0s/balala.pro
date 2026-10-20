import { redirect } from "next/navigation";
import { loginUrl, STUDIO } from "@/lib/auth";

/** Old address; the site has one login page now. */
export default function StudioLogin() {
  redirect(loginUrl(STUDIO));
}
