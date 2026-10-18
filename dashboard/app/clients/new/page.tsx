import { redirect } from "next/navigation";

// Renamed: AdMate is built around your own ad account.
export default function Moved() {
  redirect("/accounts/new");
}
