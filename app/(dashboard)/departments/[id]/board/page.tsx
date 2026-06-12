import DepartmentBoardPage from "./department-board";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DepartmentBoardPage id={id} />;
}
