import { redirect } from "next/navigation";
import { currentUser } from "./auth";
import { listMyWorkspaces } from "./context";

/**
 * 제품 화면의 진입 가드.
 *
 * layout과 page는 병렬로 렌더링되므로 layout의 redirect만 믿을 수 없다.
 * 세션이 없는 page가 requireUser()를 먼저 호출하면 AUTH_REQUIRED가 그대로 500이 되어
 * 사용자에게 오류 화면이 보인다. 각 화면이 이 함수로 직접 확인한다.
 */
export async function requireProductWorkspace() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const workspaces = await listMyWorkspaces();
  const workspace = workspaces[0];
  if (!workspace) redirect("/onboarding");

  return workspace;
}
