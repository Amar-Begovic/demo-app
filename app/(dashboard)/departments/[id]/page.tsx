import DepartmentDetailPage from "./department-detail";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DepartmentDetailPage id={id} />;
}
