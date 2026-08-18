/** Read a JSON API response without leaking HTML/framework error pages to users. */
export async function readJsonApiResponse<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(fallbackMessage);
  }

  try {
    return await response.json() as T;
  } catch {
    throw new Error(fallbackMessage);
  }
}
