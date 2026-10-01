export class CreationRequestUncertainError extends Error {
  constructor() {
    super("서버의 처리 결과를 확인하지 못했습니다. 중복 생성을 막기 위해 자동 재시도하지 않습니다. 내 작업함에서 저장된 결과를 확인해 주세요.");
    this.name = "CreationRequestUncertainError";
  }
}

/** A transport timeout does not prove that the server cancelled a paid request. */
export async function creationRequest<T>(
  url: string,
  body: unknown,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 180_000,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const request = (async () => {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new CreationRequestUncertainError();
    }
    const result = await response.json().catch(() => {
      throw new CreationRequestUncertainError();
    });
    if (!response.ok || !result.data)
      throw new Error(result.error?.message ?? "요청을 완료하지 못했습니다.");
    return result.data as T;
  })();
  try {
    return await Promise.race([
      request,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new CreationRequestUncertainError());
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
