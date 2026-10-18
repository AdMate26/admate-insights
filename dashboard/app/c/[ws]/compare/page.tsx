import { redirect } from "next/navigation";

// Comparisons are part of Home and Campaigns; pick periods or reports with the period control.
export default async function Moved({ params }: PageProps<"/c/[ws]/compare">) {
  const { ws } = await params;
  redirect(`/c/${ws}/reports`);
}
